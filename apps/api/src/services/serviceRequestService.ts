import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import type {
  CreateServiceRequestInput,
  ServiceRequestResponse,
  PaginatedResponse,
} from '@stap/shared';

function fmt(r: any): ServiceRequestResponse {
  return {
    id:          r.id,
    clientId:    r.clientId,
    clientName:  r.client?.clientName ?? '',
    siteId:      r.siteId ?? null,
    siteName:    r.site?.siteName ?? null,
    type:        r.type,
    subject:     r.subject,
    description: r.description,
    quantity:    r.quantity ?? null,
    status:      r.status,
    priority:    r.priority,
    resolvedBy:  r.resolvedBy ?? null,
    resolvedAt:  r.resolvedAt?.toISOString() ?? null,
    resolution:  r.resolution ?? null,
    createdBy:   r.createdBy,
    createdAt:   r.createdAt.toISOString(),
    updatedAt:   r.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  client: { select: { id: true, clientName: true } },
  site:   { select: { id: true, siteName: true } },
} as const;

// Client-facing only — service requests are a private channel from a client to
// STAP. There is deliberately no staff-facing list/get/update/delete here; see
// routes/portal.ts for the only routes that touch this table.
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
      data: items.map(fmt),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }
}

export const serviceRequestService = new ServiceRequestService();
