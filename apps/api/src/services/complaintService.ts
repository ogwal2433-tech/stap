import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { AppError, NotFoundError } from '../errors/AppError';
import type {
  CreateComplaintInput,
  UpdateComplaintInput,
  ComplaintResponse,
  ComplaintDashboard,
  PaginatedResponse,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

const INCLUDE = {
  client:   { select: { id: true, clientName: true, systemId: true, email: true } },
  site:     { select: { id: true, siteName: true } },
  receiver: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} as const;

function daysOpen(createdAt: Date, resolvedAt: Date | null): number {
  const end = resolvedAt ?? new Date();
  return Math.floor((end.getTime() - createdAt.getTime()) / 86_400_000);
}

function fmtComplaint(c: any): ComplaintResponse {
  return {
    id:          c.id,
    clientId:    c.clientId,
    client:      { id: c.client.id, clientName: c.client.clientName, systemId: c.client.systemId ?? null },
    site:        c.site ? { id: c.site.id, siteName: c.site.siteName } : null,
    subject:     c.subject,
    category:    c.category,
    description: c.description,
    severity:    c.severity,
    status:      c.status,
    receivedBy:  c.receiver ? { id: c.receiver.id, name: c.receiver.name } : null,
    assignedTo:  c.assignee ? { id: c.assignee.id, name: c.assignee.name } : null,
    assignedAt:  c.assignedAt?.toISOString() ?? null,
    resolution:  c.resolution ?? null,
    resolvedAt:  c.resolvedAt?.toISOString() ?? null,
    resolvedBy:  c.resolvedBy ?? null,
    createdAt:   c.createdAt.toISOString(),
    updatedAt:   c.updatedAt.toISOString(),
    daysOpen:    daysOpen(c.createdAt, c.resolvedAt),
  };
}

// ── Service ────────────────────────────────────────────────────────────────────

class ComplaintService {
  async create(data: CreateComplaintInput, createdBy: string): Promise<ComplaintResponse> {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new NotFoundError('Client not found');

    const complaint = await prisma.clientComplaint.create({
      data: {
        clientId:     data.clientId,
        siteId:       data.siteId,
        subject:      data.subject,
        category:     data.category,
        description:  data.description,
        severity:     data.severity,
        receivedById: createdBy,
        status:       'OPEN',
      },
      include: INCLUDE,
    });

    await Promise.all([
      notificationService.sendToRoles(
        ['DIRECTOR', 'OPERATIONS_SUPERVISOR'],
        {
          type:       'COMPLAINT_ASSIGNED',
          title:      'New Client Complaint',
          message:    `${data.category} complaint from ${client.clientName}: ${data.description.substring(0, 80)}`,
          entityType: 'complaint',
          entityId:   complaint.id,
        },
      ),
      QueueService.logAudit({
        userId:   createdBy,
        action:   'COMPLAINT_CREATED',
        entity:   'ClientComplaint',
        entityId: complaint.id,
        newValue: { status: 'OPEN', category: data.category, severity: data.severity },
      }),
    ]);

    return fmtComplaint(complaint);
  }

  async update(id: string, data: UpdateComplaintInput, updatedBy: string): Promise<ComplaintResponse> {
    const existing = await prisma.clientComplaint.findUnique({ where: { id }, include: INCLUDE });
    if (!existing) throw new NotFoundError('Complaint not found');

    const updateData: any = {};
    if (data.receivedById !== undefined) updateData.receivedById = data.receivedById;
    if (data.assignedTo   !== undefined) {
      updateData.assignedTo = data.assignedTo;
      if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
        updateData.assignedAt = new Date();
      }
    }
    if (data.status     !== undefined) updateData.status     = data.status;
    if (data.resolution !== undefined) updateData.resolution = data.resolution;
    if (data.resolvedBy !== undefined) updateData.resolvedBy = data.resolvedBy;

    if (data.status === 'RESOLVED') {
      if (!data.resolution) throw new AppError('Resolution notes required when resolving a complaint', 400);
      updateData.resolvedAt = new Date();
    }

    const updated = await prisma.clientComplaint.update({
      where:   { id },
      data:    updateData,
      include: INCLUDE,
    });

    const sideEffects: Promise<any>[] = [
      QueueService.logAudit({
        userId:   updatedBy,
        action:   'COMPLAINT_UPDATED',
        entity:   'ClientComplaint',
        entityId: id,
        newValue: updateData,
      }),
    ];

    if (data.status === 'RESOLVED') {
      const clientEmail = (existing.client as any).email;
      if (clientEmail) {
        sideEffects.push(
          QueueService.sendEmail({
            to:       clientEmail,
            subject:  'Your complaint has been resolved',
            template: 'complaint-resolved',
            data:     {
              complaintCategory: existing.category,
              resolution:        data.resolution,
              clientName:        existing.client.clientName,
            },
          }),
        );
      }
    }

    if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
      sideEffects.push(
        notificationService.send({
          userId:     data.assignedTo,
          type:       'COMPLAINT_ASSIGNED',
          title:      'Complaint Assigned to You',
          message:    `A ${existing.category} complaint from ${(existing as any).client.clientName} has been assigned to you`,
          entityType: 'complaint',
          entityId:   id,
        }),
      );
    }

    await Promise.all(sideEffects);

    return fmtComplaint(updated);
  }

  async list(query: {
    status?:   string;
    clientId?: string;
    category?: string;
    page:      number;
    limit:     number;
  }): Promise<PaginatedResponse<ComplaintResponse>> {
    const { page = 1, limit = 20, status, clientId, category } = query;
    const where: any = {};
    if (status)   where.status   = status;
    if (clientId) where.clientId = clientId;
    if (category) where.category = category;

    const [total, items] = await Promise.all([
      prisma.clientComplaint.count({ where }),
      prisma.clientComplaint.findMany({
        where,
        include:  INCLUDE,
        orderBy:  { createdAt: 'desc' },
        skip:     (page - 1) * limit,
        take:     limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data:       items.map(fmtComplaint),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getById(id: string): Promise<ComplaintResponse> {
    const c = await prisma.clientComplaint.findUnique({ where: { id }, include: INCLUDE });
    if (!c) throw new NotFoundError('Complaint not found');
    return fmtComplaint(c);
  }

  async getDashboard(): Promise<ComplaintDashboard> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [allOpen, allResolved, recentComplaints] = await Promise.all([
      prisma.clientComplaint.findMany({
        where:   { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        include: { client: { select: { clientName: true } } },
      }),
      prisma.clientComplaint.findMany({
        where:   { status: 'RESOLVED', resolvedAt: { not: null } },
        select:  { createdAt: true, resolvedAt: true },
      }),
      prisma.clientComplaint.findMany({
        where:   { createdAt: { gte: sixMonthsAgo } },
        select:  { category: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // openByCategory
    const catMap = new Map<string, number>();
    for (const c of allOpen) {
      catMap.set(c.category, (catMap.get(c.category) ?? 0) + 1);
    }
    const openByCategory = [...catMap.entries()].map(([category, count]) => ({ category, count }));

    // avgResolutionDays
    const avgResolutionDays = allResolved.length
      ? Math.round(
          allResolved.reduce((s, c) => s + daysOpen(c.createdAt, c.resolvedAt), 0) / allResolved.length,
        )
      : 0;

    // openByClient — top 5
    const clientMap = new Map<string, number>();
    for (const c of allOpen) {
      const name = (c as any).client?.clientName ?? 'Unknown';
      clientMap.set(name, (clientMap.get(name) ?? 0) + 1);
    }
    const openByClient = [...clientMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clientName, count]) => ({ clientName, count }));

    // monthlyTrend — last 6 months
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }) };
    });
    const trendMap = new Map(months.map(m => [m.key, { month: m.label, opened: 0, resolved: 0 }]));
    for (const c of recentComplaints) {
      const key = `${c.createdAt.getFullYear()}-${c.createdAt.getMonth()}`;
      const bucket = trendMap.get(key);
      if (bucket) {
        bucket.opened++;
        if (c.status === 'RESOLVED') bucket.resolved++;
      }
    }

    return {
      openByCategory,
      avgResolutionDays,
      totalOpen:     allOpen.length,
      totalResolved: allResolved.length,
      openByClient,
      monthlyTrend:  [...trendMap.values()],
    };
  }
}

export const complaintService = new ComplaintService();
