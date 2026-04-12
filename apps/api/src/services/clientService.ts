import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import type {
  CreateClientInput,
  UpdateClientInput,
  ClientListQuery,
  ClientResponse,
  ClientSummary,
  PaginatedResponse,
} from '@stap/shared';

function toClientResponse(client: Record<string, unknown>): ClientResponse {
  return {
    id: client.id as string,
    clientName: client.clientName as string,
    contactPerson: client.contactPerson as string,
    contactPhone: client.contactPhone as string,
    email: (client.email as string | null) ?? null,
    physicalAddress: client.physicalAddress as string,
    billingAddress: (client.billingAddress as string | null) ?? null,
    billingTerms: client.billingTerms as number,
    contractStatus: client.contractStatus as 'ACTIVE' | 'INACTIVE' | 'EXPIRED',
    createdAt: (client.createdAt as Date).toISOString(),
    updatedAt: (client.updatedAt as Date).toISOString(),
    ...(client._count ? { _count: client._count as ClientResponse['_count'] } : {}),
  };
}

class ClientService {
  // ── List ───────────────────────────────────────────────────────────────────

  async list(query: ClientListQuery): Promise<PaginatedResponse<ClientResponse>> {
    const { page, limit, search, contractStatus, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.ClientWhereInput = {};

    if (contractStatus) {
      where.contractStatus = contractStatus;
    }

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: { select: { sites: true, contracts: true, complaints: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return {
      data: clients.map((c) =>
        toClientResponse({
          ...c,
          _count: {
            sites: c._count.sites,
            contracts: c._count.contracts,
            clientComplaints: c._count.complaints,
          },
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string): Promise<ClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { siteName: 'asc' } },
        contracts: { orderBy: { createdAt: 'desc' }, take: 3 },
        complaints: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    if (!client) throw new NotFoundError(`Client ${id} not found`);

    return {
      ...toClientResponse({
        ...client,
        _count: {
          sites: client._count.sites,
          contracts: client._count.contracts,
          clientComplaints: client._count.complaints,
        },
      }),
      // Pass through nested relations for detail view
      ...(client as unknown as Record<string, unknown>),
    } as ClientResponse;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateClientInput, createdBy: string): Promise<ClientResponse> {
    const client = await prisma.client.create({
      data: {
        clientName: data.clientName,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        email: data.email ?? null,
        physicalAddress: data.physicalAddress,
        billingAddress: data.billingAddress ?? null,
        billingTerms: data.billingTerms,
        contractStatus: data.contractStatus,
      },
      include: {
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'CLIENT_CREATED',
      entity: 'client',
      entityId: client.id,
      newValue: { clientName: client.clientName },
    });

    return toClientResponse({
      ...client,
      _count: {
        sites: client._count.sites,
        contracts: client._count.contracts,
        clientComplaints: client._count.complaints,
      },
    });
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    data: UpdateClientInput,
    updatedBy: string,
  ): Promise<ClientResponse> {
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Client ${id} not found`);

    const updated = await prisma.client.update({
      where: { id },
      data,
      include: {
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'CLIENT_UPDATED',
      entity: 'client',
      entityId: id,
      oldValue: { clientName: existing.clientName, contractStatus: existing.contractStatus },
      newValue: { clientName: updated.clientName, contractStatus: updated.contractStatus },
    });

    return toClientResponse({
      ...updated,
      _count: {
        sites: updated._count.sites,
        contracts: updated._count.contracts,
        clientComplaints: updated._count.complaints,
      },
    });
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  async archive(id: string, updatedBy: string): Promise<ClientResponse> {
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Client ${id} not found`);

    const updated = await prisma.client.update({
      where: { id },
      data: { contractStatus: 'INACTIVE' },
      include: {
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'CLIENT_ARCHIVED',
      entity: 'client',
      entityId: id,
      oldValue: { contractStatus: existing.contractStatus },
      newValue: { contractStatus: 'INACTIVE' },
    });

    return toClientResponse({
      ...updated,
      _count: {
        sites: updated._count.sites,
        contracts: updated._count.contracts,
        clientComplaints: updated._count.complaints,
      },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  async getSummary(): Promise<ClientSummary> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [totalActive, totalInactive, expiringContracts, openComplaints] =
      await Promise.all([
        prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
        prisma.client.count({ where: { contractStatus: 'INACTIVE' } }),
        prisma.contract.count({
          where: {
            contractEnd: { lte: thirtyDaysFromNow, gte: new Date() },
            status: { in: ['ACTIVE', 'EXPIRING'] },
          },
        }),
        prisma.clientComplaint.count({ where: { status: 'OPEN' } }),
      ]);

    return { totalActive, totalInactive, expiringContracts, openComplaints };
  }
}

export const clientService = new ClientService();
