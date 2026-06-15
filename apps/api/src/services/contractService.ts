import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import type {
  CreateContractInput,
  UpdateContractInput,
  ContractResponse,
  ContractGuardRateResponse,
  PaginatedResponse,
  ShiftPattern,
} from '@stap/shared';

const CONTRACT_INCLUDE = {
  client:     { select: { id: true, clientName: true } },
  guardRates: true,
} as const;

class ContractService {
  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateContractInput, createdBy: string): Promise<ContractResponse> {
    const client = await prisma.client.findUnique({
      where: { id: data.clientId },
      select: { id: true, clientName: true },
    });
    if (!client) throw new NotFoundError('Client not found');

    const start = new Date(data.contractStart);
    const end = new Date(data.contractEnd);

    if (end <= start) {
      throw new AppError('Contract end date must be after start date', 400);
    }

    const status = this.computeStatus(start, end);

    const contract = await prisma.contract.create({
      data: {
        clientId:          data.clientId,
        contractStart:     start,
        contractEnd:       end,
        guardsRequired:    data.guardsRequired,
        billingPerGuard:   data.billingPerGuard,
        status,
        weaponsAllocation: data.weaponsAllocation ?? null,
        shiftPattern:      data.shiftPattern ?? null,
        ...(data.guardRates?.length && {
          guardRates: { create: data.guardRates },
        }),
      },
      include: CONTRACT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'CONTRACT_CREATED',
      entity:   'contract',
      entityId: contract.id,
      newValue: { clientId: data.clientId, status, guardsRequired: data.guardsRequired },
    });

    return this.formatContract(contract);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateContractInput, updatedBy: string): Promise<ContractResponse> {
    const existing = await prisma.contract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!existing) throw new NotFoundError('Contract not found');

    const start = data.contractStart ? new Date(data.contractStart) : existing.contractStart;
    const end = data.contractEnd ? new Date(data.contractEnd) : existing.contractEnd;

    if (end <= start) {
      throw new AppError('Contract end date must be after start date', 400);
    }

    const newStatus = data.status === 'DRAFT' ? 'DRAFT' : this.computeStatus(start, end);

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        ...(data.contractStart     !== undefined && { contractStart:     start }),
        ...(data.contractEnd       !== undefined && { contractEnd:       end }),
        ...(data.guardsRequired    !== undefined && { guardsRequired:    data.guardsRequired }),
        ...(data.billingPerGuard   !== undefined && { billingPerGuard:   data.billingPerGuard }),
        ...(data.weaponsAllocation !== undefined && { weaponsAllocation: data.weaponsAllocation ?? null }),
        ...(data.shiftPattern      !== undefined && { shiftPattern:      data.shiftPattern ?? null }),
        status: newStatus,
        ...(data.guardRates !== undefined && {
          guardRates: {
            deleteMany: {},
            create: data.guardRates,
          },
        }),
      },
      include: CONTRACT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'CONTRACT_UPDATED',
      entity:   'contract',
      entityId: id,
      oldValue: { status: existing.status, guardsRequired: existing.guardsRequired },
      newValue: { status: newStatus, guardsRequired: updated.guardsRequired },
    });

    return this.formatContract(updated);
  }

  // ── List by client ─────────────────────────────────────────────────────────

  async listByClient(clientId: string): Promise<ContractResponse[]> {
    const contracts = await prisma.contract.findMany({
      where: { clientId },
      orderBy: { contractStart: 'desc' },
      include: CONTRACT_INCLUDE,
    });

    return contracts.map((c) => this.formatContract(c));
  }

  // ── List all (with optional filters) ──────────────────────────────────────

  async listAll(params: {
    clientId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<ContractResponse>> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.ContractWhereInput = {};
    if (params.clientId) where.clientId = params.clientId;
    if (params.status) where.status = params.status as import('@prisma/client').ContractStatus;

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        skip,
        take: limit,
        orderBy: { contractStart: 'desc' },
        include: CONTRACT_INCLUDE,
      }),
      prisma.contract.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: contracts.map((c) => this.formatContract(c)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string): Promise<ContractResponse & { siteCount: number }> {
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new NotFoundError('Contract not found');

    const siteCount = await prisma.site.count({ where: { clientId: contract.clientId } });

    return { ...this.formatContract(contract), siteCount };
  }

  // ── Get expiring contracts ─────────────────────────────────────────────────

  async getExpiringContracts(daysThreshold = 30): Promise<ContractResponse[]> {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + daysThreshold);

    const contracts = await prisma.contract.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
        contractEnd: { lte: threshold },
      },
      orderBy: { contractEnd: 'asc' },
      include: CONTRACT_INCLUDE,
    });

    return contracts.map((c) => this.formatContract(c));
  }

  // ── Run status refresh (cron job) ──────────────────────────────────────────

  async runStatusRefresh(): Promise<void> {
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const expired = await prisma.contract.updateMany({
      where: { status: { not: 'DRAFT' }, contractEnd: { lt: now } },
      data:  { status: 'EXPIRED' },
    });

    const expiring = await prisma.contract.updateMany({
      where: { status: { in: ['ACTIVE'] }, contractEnd: { gte: now, lte: thirtyDaysLater } },
      data:  { status: 'EXPIRING' },
    });

    const reactivated = await prisma.contract.updateMany({
      where: { status: 'EXPIRING', contractEnd: { gt: thirtyDaysLater } },
      data:  { status: 'ACTIVE' },
    });

    console.log(
      `[ContractCron] Expired: ${expired.count}, Expiring: ${expiring.count}, Re-activated: ${reactivated.count}`,
    );
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundError('Contract not found');

    await prisma.contract.delete({ where: { id } });
  }

  // ── Private: compute status ────────────────────────────────────────────────

  private computeStatus(start: Date, end: Date): 'ACTIVE' | 'EXPIRING' | 'EXPIRED' {
    const now = new Date();
    if (now > end) return 'EXPIRED';

    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    if (end <= thirtyDaysLater) return 'EXPIRING';
    return 'ACTIVE';
  }

  // ── Private: format contract response ─────────────────────────────────────

  private formatContract(c: any): ContractResponse {
    const now = new Date();
    const end = c.contractEnd instanceof Date ? c.contractEnd : new Date(c.contractEnd);
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const monthlyValue = c.guardsRequired * c.billingPerGuard;

    return {
      id:              c.id,
      client:          { id: c.client.id, clientName: c.client.clientName },
      contractStart:   c.contractStart instanceof Date ? c.contractStart.toISOString() : c.contractStart,
      contractEnd:     end.toISOString(),
      guardsRequired:  c.guardsRequired,
      billingPerGuard: c.billingPerGuard,
      monthlyValue,
      status:          c.status,
      daysRemaining,
      weaponsAllocation: c.weaponsAllocation ?? null,
      shiftPattern:      (c.shiftPattern as ShiftPattern | null) ?? null,
      guardRates: (c.guardRates ?? []).map((r: any): ContractGuardRateResponse => ({
        id:           r.id,
        guardType:    r.guardType,
        guardsCount:  r.guardsCount,
        ratePerGuard: r.ratePerGuard,
      })),
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    };
  }
}

export const contractService = new ContractService();
