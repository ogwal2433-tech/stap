import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { AppError, NotFoundError } from '../errors/AppError';
import { ROLES, COMPLAINT_RECEIVER_ROLES, MIN_ACTION_TAKEN_LENGTH } from '@stap/shared';
import type {
  CreateComplaintInput,
  CreateOutboundComplaintInput,
  AssignComplaintInput,
  UpdateComplaintStatusInput,
  ComplaintResponse,
  ComplaintDashboard,
  PaginatedResponse,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

const INCLUDE = {
  client:            { select: { id: true, clientName: true, systemId: true, email: true } },
  site:              { select: { id: true, siteName: true } },
  receivedByUser:    { select: { id: true, name: true } },
  assignedToUser:    { select: { id: true, name: true, role: true, phone: true } },
  actionTakenByUser: { select: { id: true, name: true } },
  sentByUser:         { select: { id: true, name: true } },
  acknowledgedByUser: { select: { id: true, name: true } },
} as const;

function roleToTitle(role: string): string {
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysOpen(createdAt: Date, resolvedAt: Date | null): number {
  const end = resolvedAt ?? new Date();
  return Math.floor((end.getTime() - createdAt.getTime()) / 86_400_000);
}

function sanitiseComplaint(c: any): ComplaintResponse {
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
    receivedBy:  c.receivedByUser
      ? { id: c.receivedByUser.id, name: c.receivedByUser.name }
      : null,
    assignedTo:  c.assignedToUser
      ? {
          id:    c.assignedToUser.id,
          name:  c.assignedToUser.name,
          title: roleToTitle(c.assignedToUser.role),
          phone: c.assignedToUser.phone ?? 'Not provided',
        }
      : null,
    assignedAt:  c.assignedAt?.toISOString() ?? null,
    resolution:  c.resolution ?? null,
    actionTaken:   c.actionTaken ?? null,
    actionTakenAt: c.actionTakenAt?.toISOString() ?? null,
    actionTakenBy: c.actionTakenByUser
      ? { id: c.actionTakenByUser.id, name: c.actionTakenByUser.name }
      : null,
    resolvedAt:  c.resolvedAt?.toISOString() ?? null,
    resolvedBy:  c.resolvedBy ?? null,
    createdAt:   c.createdAt.toISOString(),
    updatedAt:   c.updatedAt.toISOString(),
    daysOpen:    daysOpen(c.createdAt, c.resolvedAt),

    // Rows written before outbound notices existed have no direction — they are
    // all inbound, which is what the column default says too.
    direction:   (c.direction ?? 'INBOUND') as 'INBOUND' | 'OUTBOUND',
    sentBy:      c.sentByUser ? { id: c.sentByUser.id, name: c.sentByUser.name } : null,
    sentAt:      c.sentAt?.toISOString() ?? null,
    acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: c.acknowledgedByUser
      ? { id: c.acknowledgedByUser.id, name: c.acknowledgedByUser.name }
      : null,
    clientResponse: c.clientResponse ?? null,
  };
}

// ── Service ────────────────────────────────────────────────────────────────────

class ComplaintService {
  async create(data: CreateComplaintInput, createdBy: string): Promise<ComplaintResponse> {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new NotFoundError('Client not found');

    const complaint = await prisma.clientComplaint.create({
      data: {
        clientId:    data.clientId,
        siteId:      data.siteId,
        subject:     data.subject,
        category:    data.category,
        description: data.description,
        severity:    data.severity,
        status:      'OPEN',
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

    return sanitiseComplaint(complaint);
  }

  // ── Outbound notices (STAP → client) ─────────────────────────────────────────

  /**
   * Sends a formal notice from STAP to a client.
   *
   * The mirror image of create(): the complaint is raised by staff against the
   * client, so it starts at SENT rather than OPEN and waits on the client to
   * acknowledge instead of on a staff member to be assigned.
   */
  async createOutbound(
    data:     CreateOutboundComplaintInput,
    sentById: string,
  ): Promise<ComplaintResponse> {
    const client = await prisma.client.findUnique({
      where:  { id: data.clientId },
      select: { id: true, clientName: true },
    });
    if (!client) throw new NotFoundError('Client not found');

    if (data.siteId) {
      const site = await prisma.site.findFirst({
        where:  { id: data.siteId, clientId: data.clientId },
        select: { id: true },
      });
      if (!site) {
        throw new AppError('That site does not belong to the selected client.', 400);
      }
    }

    const complaint = await prisma.clientComplaint.create({
      data: {
        clientId:    data.clientId,
        siteId:      data.siteId ?? null,
        subject:     data.subject.trim(),
        description: data.description.trim(),
        category:    data.category ?? 'OTHER',
        // priority and severity are the same LOW/MEDIUM/HIGH scale.
        severity:    data.priority ?? 'MEDIUM',
        direction:   'OUTBOUND',
        status:      'SENT',
        sentById,
        sentAt:      new Date(),
      },
      include: INCLUDE,
    });

    // Every portal login for this company needs to see it, not just one contact.
    const clientUsers = await prisma.user.findMany({
      where:  { clientId: data.clientId, role: ROLES.CLIENT, status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.all([
      ...clientUsers.map((u) =>
        notificationService.send({
          userId:     u.id,
          type:       'SYSTEM',
          title:      '📋 Notice from STAP Security',
          message:
            `STAP Security has sent you a notice: "${complaint.subject}". ` +
            'Log in to your portal to read and acknowledge it.',
          entityType: 'complaint',
          entityId:   complaint.id,
        }),
      ),
      QueueService.logAudit({
        userId:   sentById,
        action:   'OUTBOUND_COMPLAINT_SENT',
        entity:   'ClientComplaint',
        entityId: complaint.id,
        newValue: {
          clientId:   data.clientId,
          clientName: client.clientName,
          subject:    complaint.subject,
          priority:   complaint.severity,
          notified:   clientUsers.length,
        },
      }),
    ]);

    if (clientUsers.length === 0) {
      console.warn(
        `Outbound notice ${complaint.id} sent to ${client.clientName}, which has no active ` +
        'portal user — nobody will be notified until one is created.',
      );
    }

    return sanitiseComplaint(complaint);
  }

  /**
   * Records a client's receipt of a notice, with an optional reply.
   *
   * Callers must have already established that the notice belongs to the
   * acknowledging client — the portal guard does that from the JWT.
   */
  async acknowledgeNotice(
    complaintId:      string,
    clientResponse:   string | undefined,
    acknowledgedById: string,
  ): Promise<ComplaintResponse> {
    const complaint = await prisma.clientComplaint.findUnique({
      where:  { id: complaintId },
      select: { id: true, direction: true, status: true, subject: true, sentById: true },
    });
    if (!complaint) throw new NotFoundError('Notice not found');

    if (complaint.direction !== 'OUTBOUND') {
      throw new AppError(
        'Only notices sent by STAP can be acknowledged. This is a complaint you raised with us.',
        400,
      );
    }
    if (complaint.status !== 'SENT') {
      throw new AppError(
        complaint.status === 'ACKNOWLEDGED'
          ? 'You have already acknowledged this notice.'
          : 'This notice has already been closed and can no longer be acknowledged.',
        400,
      );
    }

    const response = clientResponse?.trim() || null;

    const updated = await prisma.clientComplaint.update({
      where: { id: complaintId },
      data:  {
        status:         'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById,
        clientResponse: response,
      },
      include: INCLUDE,
    });

    // Tell whoever sent it that the client has seen it.
    if (complaint.sentById) {
      await notificationService.send({
        userId:     complaint.sentById,
        type:       'SYSTEM',
        title:      '✅ Client Acknowledged Your Notice',
        message:
          `${updated.client.clientName} acknowledged "${complaint.subject}".` +
          (response ? ` They replied: "${response.slice(0, 100)}"` : ''),
        entityType: 'complaint',
        entityId:   complaintId,
      });
    }

    await QueueService.logAudit({
      userId:   acknowledgedById,
      action:   'OUTBOUND_COMPLAINT_ACKNOWLEDGED',
      entity:   'ClientComplaint',
      entityId: complaintId,
      newValue: { status: 'ACKNOWLEDGED', hasResponse: response !== null },
    });

    return sanitiseComplaint(updated);
  }

  /** Staff closes a notice once whatever it asked for has happened. */
  async resolveOutbound(complaintId: string, actingUserId: string): Promise<ComplaintResponse> {
    const complaint = await prisma.clientComplaint.findUnique({
      where:  { id: complaintId },
      select: { id: true, direction: true, status: true },
    });
    if (!complaint) throw new NotFoundError('Notice not found');

    if (complaint.direction !== 'OUTBOUND') {
      throw new AppError(
        'This is an inbound complaint — use the regular status endpoint, which records the action taken.',
        400,
      );
    }
    if (complaint.status === 'RESOLVED') {
      throw new AppError('This notice is already resolved.', 400);
    }

    const updated = await prisma.clientComplaint.update({
      where: { id: complaintId },
      data:  {
        status:     'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: actingUserId,
      },
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId:   actingUserId,
      action:   'OUTBOUND_COMPLAINT_RESOLVED',
      entity:   'ClientComplaint',
      entityId: complaintId,
      // Worth recording: a notice closed without the client ever confirming receipt.
      newValue: { status: 'RESOLVED', wasAcknowledged: complaint.status === 'ACKNOWLEDGED' },
    });

    return sanitiseComplaint(updated);
  }

  /** Unacknowledged notices for one client — the portal's unread count. */
  async countUnreadNotices(clientId: string): Promise<number> {
    return prisma.clientComplaint.count({
      where: { clientId, direction: 'OUTBOUND', status: 'SENT' },
    });
  }

  async assignComplaint(
    complaintId:  string,
    data:         AssignComplaintInput,
    actingUserId: string,
  ): Promise<ComplaintResponse> {
    const complaint = await prisma.clientComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new NotFoundError('Complaint not found');

    // Assignment routes a client's complaint to whoever will handle it. A notice
    // STAP sent has no such owner — it is waiting on the client, not on us.
    if (complaint.direction === 'OUTBOUND') {
      throw new AppError('A notice sent to a client cannot be assigned to a staff member.', 400);
    }

    const [receiver, assignee] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: data.receivedById },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findUnique({
        where:  { id: data.assignedToId },
        select: { id: true, name: true, role: true, phone: true },
      }),
    ]);

    if (!receiver) throw new NotFoundError('Receiving staff member not found');
    if (!assignee) throw new NotFoundError('Assigned staff member not found');

    // Control Room is the single point of entry for complaints — anyone else
    // named as the receiver is a mistake, however senior they are.
    if (!(COMPLAINT_RECEIVER_ROLES as string[]).includes(receiver.role)) {
      throw new AppError(
        `Only Control Room staff can receive complaints. "${receiver.name}" is a ` +
        `${roleToTitle(receiver.role)} and cannot be set as the complaint receiver.`,
        400,
      );
    }

    const updated = await prisma.clientComplaint.update({
      where: { id: complaintId },
      data:  {
        receivedById: data.receivedById,
        assignedToId: data.assignedToId,
        assignedAt:   new Date(),
      },
      include: INCLUDE,
    });

    await Promise.all([
      notificationService.send({
        userId:     data.assignedToId,
        type:       'SYSTEM',
        title:      'Complaint Assigned to You',
        message:    `A complaint from ${updated.client.clientName} has been assigned to you. Subject: "${updated.subject}".`,
        entityType: 'complaint',
        entityId:   complaintId,
      }),
      writeAuditLog({
          action:   'COMPLAINT_ASSIGNED',
          entity:   'clientComplaint',
          entityId: complaintId,
          newValue: {
            receivedBy: receiver.name,
            assignedTo: assignee.name,
          },
        }),
    ]);

    return sanitiseComplaint(updated);
  }

  async updateStatus(
    complaintId:  string,
    data:         UpdateComplaintStatusInput,
    actingUserId: string,
  ): Promise<ComplaintResponse> {
    const complaint = await prisma.clientComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new NotFoundError('Complaint not found');

    // Outbound notices run SENT → ACKNOWLEDGED → RESOLVED and are never assigned
    // to a staff member, so this endpoint's rules do not apply to them.
    if (complaint.direction === 'OUTBOUND') {
      throw new AppError(
        'This is a notice STAP sent to a client. Close it with the resolve-notice action instead.',
        400,
      );
    }

    if (!complaint.assignedToId) {
      throw new AppError('This complaint must be assigned to a staff member before its status can be updated.', 400);
    }

    const actingUser = await prisma.user.findUnique({
      where:  { id: actingUserId },
      select: { role: true },
    });

    const isAssignedPerson = complaint.assignedToId === actingUserId;
    const isControlRoom    = actingUser?.role === ROLES.CONTROL_ROOM;
    const isHR = ['DIRECTOR', 'ASSISTANT_MANAGER'].includes(actingUser?.role ?? '');

    if (!isAssignedPerson && !isControlRoom && !isHR) {
      throw new AppError(
        'Only the staff member this complaint is assigned to, Control Room, or HR can update its status.',
        403,
      );
    }

    const actionTaken = data.actionTaken?.trim() || null;

    // Nothing is closed without a record of what was done about it. Checked here
    // as well as in the schema so a direct service call cannot slip past it.
    if (data.status === 'RESOLVED' && (actionTaken?.length ?? 0) < MIN_ACTION_TAKEN_LENGTH) {
      throw new AppError(
        'You must describe the action taken to resolve this complaint before marking it ' +
        'as Resolved. Please fill in the "Action Taken" field.',
        400,
      );
    }

    const updateData: any = { status: data.status };
    if (actionTaken) {
      updateData.actionTaken     = actionTaken;
      updateData.actionTakenAt   = new Date();
      updateData.actionTakenById = actingUserId;
    }
    if (data.resolution !== undefined) {
      updateData.resolution = data.resolution?.trim() || null;
    }
    if (data.status === 'RESOLVED') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = actingUserId;
    }

    const updated = await prisma.clientComplaint.update({
      where:   { id: complaintId },
      data:    updateData,
      include: INCLUDE,
    });

    await writeAuditLog({
        action:   'COMPLAINT_STATUS_UPDATED',
        entity:   'clientComplaint',
        entityId: complaintId,
        newValue: { status: data.status, updatedBy: actingUserId, actionTaken },
      });

    return sanitiseComplaint(updated);
  }

  async list(query: {
    status?:    string;
    clientId?:  string;
    category?:  string;
    direction?: string;
    page:       number;
    limit:      number;
  }): Promise<PaginatedResponse<ComplaintResponse>> {
    const { page = 1, limit = 20, status, clientId, category, direction } = query;
    const where: any = {};
    if (status)   where.status   = status;
    if (clientId) where.clientId = clientId;
    if (category) where.category = category;
    // Omitted (or ALL) returns both directions, so callers that predate outbound
    // notices keep working unchanged.
    if (direction && direction !== 'ALL') where.direction = direction;

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

    return {
      data:       items.map(sanitiseComplaint),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext:    page < Math.ceil(total / limit),
        hasPrev:    page > 1,
      },
    };
  }

  async getById(id: string): Promise<ComplaintResponse> {
    const c = await prisma.clientComplaint.findUnique({ where: { id }, include: INCLUDE });
    if (!c) throw new NotFoundError('Complaint not found');
    return sanitiseComplaint(c);
  }

  async getDashboard(): Promise<ComplaintDashboard> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // This dashboard measures how STAP handles client grievances — resolution
    // times, open volume by category. Notices STAP sends out are a different
    // thing entirely and would quietly distort every figure here, so they are
    // excluded rather than filtered at the edges.
    const inbound = { direction: 'INBOUND' } as const;

    const [allOpen, allResolved, recentComplaints] = await Promise.all([
      prisma.clientComplaint.findMany({
        where:   { ...inbound, status: { in: ['OPEN', 'UNDER_INVESTIGATION'] } },
        include: { client: { select: { clientName: true } } },
      }),
      prisma.clientComplaint.findMany({
        where:   { ...inbound, status: 'RESOLVED', resolvedAt: { not: null } },
        select:  { createdAt: true, resolvedAt: true },
      }),
      prisma.clientComplaint.findMany({
        where:   { ...inbound, createdAt: { gte: sixMonthsAgo } },
        select:  { category: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const catMap = new Map<string, number>();
    for (const c of allOpen) {
      catMap.set(c.category, (catMap.get(c.category) ?? 0) + 1);
    }

    const avgResolutionDays = allResolved.length
      ? Math.round(
          allResolved.reduce((s, c) => s + daysOpen(c.createdAt, c.resolvedAt), 0) / allResolved.length,
        )
      : 0;

    const clientMap = new Map<string, number>();
    for (const c of allOpen) {
      const name = (c as any).client?.clientName ?? 'Unknown';
      clientMap.set(name, (clientMap.get(name) ?? 0) + 1);
    }

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }) };
    });
    const trendMap = new Map(months.map((m) => [m.key, { month: m.label, opened: 0, resolved: 0 }]));
    for (const c of recentComplaints) {
      const key  = `${c.createdAt.getFullYear()}-${c.createdAt.getMonth()}`;
      const bucket = trendMap.get(key);
      if (bucket) {
        bucket.opened++;
        if (c.status === 'RESOLVED') bucket.resolved++;
      }
    }

    return {
      openByCategory:    [...catMap.entries()].map(([category, count]) => ({ category, count })),
      avgResolutionDays,
      totalOpen:         allOpen.length,
      totalResolved:     allResolved.length,
      openByClient:      [...clientMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([clientName, count]) => ({ clientName, count })),
      monthlyTrend:      [...trendMap.values()],
    };
  }
}

export const complaintService = new ComplaintService();
