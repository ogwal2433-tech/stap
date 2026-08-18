import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES, SR_TERMINAL_STATUSES } from '@stap/shared';
import type {
  CreateServiceRequestInput,
  UpdateServiceRequestInput,
  ServiceRequestResponse,
  ServiceRequestSummary,
  PaginatedResponse,
} from '@stap/shared';

/**
 * Shapes a request for the API.
 *
 * `staffNotes` is only included for staff callers — the client portal passes
 * `forStaff: false`, so internal notes cannot leak through the portal even if a
 * future route forgets to strip them.
 */
function fmt(r: any, forStaff = false): ServiceRequestResponse {
  const base: ServiceRequestResponse = {
    id:             r.id,
    clientId:       r.clientId,
    clientName:     r.client?.clientName ?? '',
    clientSystemId: r.client?.systemId ?? null,
    siteId:         r.siteId ?? null,
    siteName:       r.site?.siteName ?? null,
    type:           r.type,
    subject:        r.subject,
    description:    r.description,
    quantity:       r.quantity ?? null,
    status:         r.status,
    priority:       r.priority,
    staffResponse:  r.staffResponse ?? null,
    respondedBy:    r.respondedByUser
      ? { id: r.respondedByUser.id, name: r.respondedByUser.name }
      : null,
    respondedAt:    r.respondedAt?.toISOString() ?? null,
    requestedBy:    r.createdByUser
      ? { id: r.createdByUser.id, name: r.createdByUser.name }
      : null,
    createdBy:      r.createdBy,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
  if (forStaff) base.staffNotes = r.staffNotes ?? null;
  return base;
}

const INCLUDE = {
  client:          { select: { id: true, clientName: true, systemId: true } },
  site:            { select: { id: true, siteName: true } },
  createdByUser:   { select: { id: true, name: true } },
  respondedByUser: { select: { id: true, name: true } },
} as const;

/**
 * Service requests a client raises with STAP.
 *
 * Staff read and answer them through the staff routes; clients see only their
 * own company's, and never the internal notes.
 */
class ServiceRequestService {
  async create(data: CreateServiceRequestInput, createdBy: string): Promise<ServiceRequestResponse> {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new NotFoundError('Client not found');

    const sr = await prisma.serviceRequest.create({
      data: {
        clientId:    data.clientId,
        siteId:      data.siteId ?? null,
        type:        data.type ?? 'OTHER',
        subject:     data.subject,
        description: data.description,
        quantity:    data.quantity ?? null,
        priority:    data.priority ?? 'NORMAL',
        createdBy,
      },
      include: INCLUDE,
    });

    return fmt(sr);
  }

  async listByClient(clientId: string, page = 1, limit = 20): Promise<PaginatedResponse<ServiceRequestResponse>> {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      prisma.serviceRequest.count({ where: { clientId } }),
      prisma.serviceRequest.findMany({
        where:   { clientId },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: items.map((r) => fmt(r)),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  // ── Staff ────────────────────────────────────────────────────────────────────

  /** Every client's requests, for the staff queue. */
  async listAll(query: {
    status?:   string;
    clientId?: string;
    priority?: string;
    dateFrom?: string;
    dateTo?:   string;
    page:      number;
    limit:     number;
  }): Promise<PaginatedResponse<ServiceRequestResponse>> {
    const { page, limit } = query;
    const where: import('@prisma/client').Prisma.ServiceRequestWhereInput = {};

    if (query.status)   where.status   = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.priority) where.priority = query.priority;

    if (query.dateFrom || query.dateTo) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        // Inclusive of the whole end day, which is what a date picker implies.
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    const [total, items] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        include: INCLUDE,
        // Unanswered work first, newest within that — the queue reads top-down.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: items.map((r) => fmt(r, true)),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  /** Counts per status, for the summary cards and the sidebar badge. */
  async getSummary(): Promise<ServiceRequestSummary> {
    const counts = await prisma.serviceRequest.groupBy({
      by:     ['status'],
      _count: { _all: true },
    });
    const of = (status: string) =>
      counts.find((c) => c.status === status)?._count._all ?? 0;

    return {
      pending:    of('PENDING'),
      inProgress: of('IN_PROGRESS'),
      completed:  of('COMPLETED'),
      rejected:   of('REJECTED'),
      total:      counts.reduce((sum, c) => sum + c._count._all, 0),
    };
  }

  async getByIdForStaff(id: string): Promise<ServiceRequestResponse> {
    const sr = await prisma.serviceRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!sr) throw new NotFoundError('Service request not found');
    return fmt(sr, true);
  }

  /**
   * Moves a request along and tells the client what was decided.
   *
   * Completed and rejected requests are final: reopening one would leave the
   * client holding a response that no longer describes where things stand.
   */
  async updateStatus(
    id:            string,
    data:          UpdateServiceRequestInput,
    respondedById: string,
  ): Promise<ServiceRequestResponse> {
    const existing = await prisma.serviceRequest.findUnique({
      where:  { id },
      select: { id: true, clientId: true, status: true, subject: true, staffResponse: true, staffNotes: true },
    });
    if (!existing) throw new NotFoundError('Service request not found');

    if (SR_TERMINAL_STATUSES.includes(existing.status as never)) {
      throw new AppError(
        `This request was already ${existing.status.toLowerCase()} and can no longer be changed.`,
        400,
      );
    }

    const response = data.staffResponse?.trim() || null;
    const notes    = data.staffNotes?.trim() || null;

    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: {
        status:        data.status,
        // Keep whatever was written before if this update leaves the box empty,
        // rather than silently wiping an earlier reply.
        staffResponse: response ?? existing.staffResponse,
        staffNotes:    notes    ?? existing.staffNotes,
        respondedById,
        respondedAt:   new Date(),
      },
      include: INCLUDE,
    });

    // Everyone with a portal login at that company should see the outcome.
    const clientUsers = await prisma.user.findMany({
      where:  { clientId: existing.clientId, role: ROLES.CLIENT, status: 'ACTIVE' },
      select: { id: true },
    });

    const heading =
      data.status === 'COMPLETED' ? 'Service Request Completed ✅'
      : data.status === 'REJECTED' ? 'Service Request Declined ❌'
      : 'Service Request Updated 🔄';

    await Promise.all([
      ...clientUsers.map((u) =>
        notificationService.send({
          userId:     u.id,
          type:       'SYSTEM',
          title:      heading,
          message:    response
            ?? `"${existing.subject}" is now ${data.status.replace(/_/g, ' ').toLowerCase()}.`,
          entityType: 'serviceRequest',
          entityId:   id,
        }),
      ),
      QueueService.logAudit({
        userId:   respondedById,
        action:   'SERVICE_REQUEST_UPDATED',
        entity:   'serviceRequest',
        entityId: id,
        newValue: {
          from:        existing.status,
          to:          data.status,
          hasResponse: response !== null,
          notified:    clientUsers.length,
        },
      }),
    ]);

    return fmt(updated, true);
  }
}

export const serviceRequestService = new ServiceRequestService();
