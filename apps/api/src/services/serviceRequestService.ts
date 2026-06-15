import prisma from '../db/prisma';
import { NotFoundError, AppError } from '../errors/AppError';
import type {
  CreateServiceRequestInput,
  UpdateServiceRequestInput,
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
        priority:    data.priority ?? 'NORMAL',
        createdBy,
      },
      include: INCLUDE,
    });

    return fmt(sr);
  }

  async update(id: string, data: UpdateServiceRequestInput, _updatedBy: string): Promise<ServiceRequestResponse> {
    const existing = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Service request not found');

    if (data.status === 'RESOLVED' && !data.resolution) {
      throw new AppError('Resolution notes required when resolving a request', 400);
    }

    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: {
        ...(data.status     !== undefined && { status:     data.status }),
        ...(data.resolution !== undefined && { resolution: data.resolution }),
        ...(data.resolvedBy !== undefined && { resolvedBy: data.resolvedBy }),
        ...(data.status === 'RESOLVED' && { resolvedAt: new Date() }),
      },
      include: INCLUDE,
    });

    return fmt(updated);
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

  async listAll(params: { status?: string; clientId?: string; page?: number; limit?: number }): Promise<PaginatedResponse<ServiceRequestResponse>> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.status)   where.status   = params.status;
    if (params.clientId) where.clientId = params.clientId;

    const [total, items] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: items.map(fmt),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getById(id: string): Promise<ServiceRequestResponse> {
    const sr = await prisma.serviceRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!sr) throw new NotFoundError('Service request not found');
    return fmt(sr);
  }

  async delete(id: string): Promise<void> {
    const sr = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!sr) throw new NotFoundError('Service request not found');
    await prisma.serviceRequest.delete({ where: { id } });
  }
}

export const serviceRequestService = new ServiceRequestService();
