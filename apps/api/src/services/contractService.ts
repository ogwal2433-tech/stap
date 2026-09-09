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
  AmendContractInput,
  ContractAmendmentResponse,
} from '@stap/shared';

const CONTRACT_INCLUDE = {
  client:     { select: { id: true, clientName: true } },
  guardRates: true,
} as const;

/** Rate lines are the single source of billing truth — derive totals from them. */
function deriveTotals(guardRates: { guardsCount: number; ratePerGuard: number }[]) {
  const guardsRequired    = guardRates.reduce((sum, r) => sum + r.guardsCount, 0);
  const totalMonthlyValue = guardRates.reduce((sum, r) => sum + r.guardsCount * r.ratePerGuard, 0);
  return { guardsRequired, totalMonthlyValue };
}

function withMonthlyTotal(rates: { guardType: string; guardsCount: number; ratePerGuard: number }[]) {
  return rates.map((r) => ({ ...r, monthlyTotal: r.guardsCount * r.ratePerGuard }));
}

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

    const { guardsRequired, totalMonthlyValue } = deriveTotals(data.guardRates);

    const contract = await prisma.contract.create({
      data: {
        clientId:          data.clientId,
        contractStart:     start,
        contractEnd:       end,
        guardsRequired,
        totalMonthlyValue,
        status:            'ACTIVE',
        weaponsAllocation: data.weaponsAllocation ?? null,
        shiftPattern:      data.shiftPattern ?? null,
        billingNote:       data.billingNote ?? null,
        guardRates: { create: withMonthlyTotal(data.guardRates) },
      },
      include: CONTRACT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'CONTRACT_CREATED',
      entity:   'contract',
      entityId: contract.id,
      newValue: { clientId: data.clientId, status: 'ACTIVE', guardsRequired },
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
    const derived = data.guardRates !== undefined ? deriveTotals(data.guardRates) : null;

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        ...(data.contractStart     !== undefined && { contractStart:     start }),
        ...(data.contractEnd       !== undefined && { contractEnd:       end }),
        ...(data.weaponsAllocation !== undefined && { weaponsAllocation: data.weaponsAllocation ?? null }),
        ...(data.shiftPattern      !== undefined && { shiftPattern:      data.shiftPattern ?? null }),
        ...(data.billingNote       !== undefined && { billingNote:       data.billingNote ?? null }),
        status: newStatus,
        ...(derived && {
          guardsRequired:    derived.guardsRequired,
          totalMonthlyValue: derived.totalMonthlyValue,
          guardRates: {
            deleteMany: {},
            create: withMonthlyTotal(data.guardRates!),
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

  // ── Amendments ─────────────────────────────────────────────────────────────

  /**
   * Records a change to a signed contract and applies it.
   *
   * Not the same as update(). A contract is an agreement, so a change carries a
   * reason, an effective date and a record of what it was before — the guard
   * rates are deleted and recreated when a contract changes, so without the
   * snapshot the originally signed terms would be unrecoverable.
   */
  async amend(
    contractId:  string,
    data:        AmendContractInput,
    amendedById: string,
  ): Promise<ContractAmendmentResponse> {
    const contract = await prisma.contract.findUnique({
      where:   { id: contractId },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new NotFoundError('Contract not found');

    if (contract.status === 'EXPIRED') {
      throw new AppError(
        'This contract has expired. Raise a new contract rather than amending a closed one.',
        400,
      );
    }

    // The whole of what is changing, so a reader a year later sees the terms as
    // they stood rather than only the fields that happened to move.
    const previousValues = {
      guardsRequired:    contract.guardsRequired,
      totalMonthlyValue: contract.totalMonthlyValue,
      contractEnd:       contract.contractEnd.toISOString(),
      status:            contract.status,
      billingNote:       contract.billingNote,
      guardRates:        contract.guardRates.map((r) => ({
        guardType: r.guardType, guardsCount: r.guardsCount, ratePerGuard: r.ratePerGuard,
      })),
    };

    const newValues:  Record<string, unknown> = {};
    const updateData: Record<string, unknown> = {};
    const changes:    string[] = [];
    const ugx = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;

    if (data.guardRates !== undefined) {
      const derived = deriveTotals(data.guardRates);
      newValues.guardsRequired    = derived.guardsRequired;
      newValues.totalMonthlyValue = derived.totalMonthlyValue;
      newValues.guardRates        = data.guardRates;
      updateData.guardsRequired    = derived.guardsRequired;
      updateData.totalMonthlyValue = derived.totalMonthlyValue;
      updateData.guardRates = { deleteMany: {}, create: withMonthlyTotal(data.guardRates) };

      if (derived.guardsRequired !== contract.guardsRequired) {
        changes.push(`Guards: ${contract.guardsRequired} → ${derived.guardsRequired}`);
      }
      if (derived.totalMonthlyValue !== contract.totalMonthlyValue) {
        changes.push(`Monthly value: ${ugx(contract.totalMonthlyValue)} → ${ugx(derived.totalMonthlyValue)}`);
      }
    }

    if (data.contractEnd !== undefined && data.contractEnd) {
      const end = new Date(data.contractEnd);
      if (end <= contract.contractStart) {
        throw new AppError('The new end date must be after the contract start date.', 400);
      }
      newValues.contractEnd  = end.toISOString();
      updateData.contractEnd = end;
      const fmt = (d: Date) => d.toLocaleDateString('en-GB');
      if (end.getTime() !== contract.contractEnd.getTime()) {
        changes.push(`End date: ${fmt(contract.contractEnd)} → ${fmt(end)}`);
      }
    }

    if (data.billingNote !== undefined) {
      newValues.billingNote  = data.billingNote;
      updateData.billingNote = data.billingNote;
      if ((data.billingNote ?? null) !== (contract.billingNote ?? null)) changes.push('Billing note updated');
    }

    if (data.amendmentType === 'TERMINATION') {
      // Ends the contract on the day the amendment takes effect, not today: a
      // termination agreed now may take effect at the end of the month.
      const effective = new Date(data.effectiveDate);
      newValues.status       = 'EXPIRED';
      newValues.contractEnd  = effective.toISOString();
      updateData.status      = 'EXPIRED';
      updateData.contractEnd = effective;
      changes.push(`Terminated, effective ${effective.toLocaleDateString('en-GB')}`);
    }

    const changeSummary = changes.join(', ') || 'No values changed';

    // Numbered per contract from the highest already issued, so a contract's
    // amendments read 01, 02, 03 rather than sharing a global sequence.
    const last = await prisma.contractAmendment.findFirst({
      where:   { contractId },
      orderBy: { systemId: 'desc' },
      select:  { systemId: true },
    });
    const n = last?.systemId ? Number(last.systemId.slice(4)) : 0;
    const systemId = `AMD-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;

    // One transaction: a contract must never be left changed with no amendment
    // recording why, nor an amendment describing a change that did not happen.
    const [amendment] = await prisma.$transaction([
      prisma.contractAmendment.create({
        data: {
          systemId,
          contractId,
          amendedById,
          reason:        data.reason.trim(),
          effectiveDate: new Date(data.effectiveDate),
          amendmentType: data.amendmentType,
          previousValues: previousValues as never,
          newValues:      newValues as never,
          changeSummary,
        },
        include: { amendedByUser: { select: { id: true, name: true } } },
      }),
      prisma.contract.update({
        where: { id: contractId },
        data:  { ...updateData, amendmentCount: { increment: 1 } },
      }),
    ]);

    await QueueService.logAudit({
      userId:   amendedById,
      action:   'CONTRACT_AMENDED',
      entity:   'contract',
      entityId: contractId,
      oldValue: previousValues as never,
      newValue: { systemId, amendmentType: data.amendmentType, changeSummary, reason: data.reason },
    });

    return this.sanitiseAmendment(amendment);
  }

  async getAmendments(contractId: string): Promise<ContractAmendmentResponse[]> {
    const rows = await prisma.contractAmendment.findMany({
      where:   { contractId },
      include: { amendedByUser: { select: { id: true, name: true } } },
      orderBy: { amendedAt: 'desc' },
    });
    return rows.map((r) => this.sanitiseAmendment(r));
  }

  private sanitiseAmendment(a: {
    id: string; systemId: string | null; contractId: string;
    amendedAt: Date; effectiveDate: Date; reason: string; amendmentType: string;
    changeSummary: string | null; previousValues: unknown; newValues: unknown;
    amendedByUser?: { id: string; name: string } | null;
  }): ContractAmendmentResponse {
    return {
      id:             a.id,
      systemId:       a.systemId,
      contractId:     a.contractId,
      amendedAt:      a.amendedAt.toISOString(),
      amendedBy:      a.amendedByUser ?? null,
      reason:         a.reason,
      effectiveDate:  a.effectiveDate.toISOString(),
      amendmentType:  a.amendmentType,
      changeSummary:  a.changeSummary,
      previousValues: (a.previousValues ?? {}) as Record<string, unknown>,
      newValues:      (a.newValues ?? {}) as Record<string, unknown>,
    };
  }

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
        // Both bounds. Without the lower one this asked for "ends before 30
        // days from now", which every already-lapsed contract also satisfies —
        // they only stayed out because the nightly cron had flipped them to
        // EXPIRED. Anything that lapsed since the last run was listed as
        // expiring, counting down from a date already past.
        contractEnd: { gte: now, lte: threshold },
      },
      orderBy: { contractEnd: 'asc' },
      include: CONTRACT_INCLUDE,
    });

    return contracts.map((c) => this.formatContract(c));
  }

  // ── Get expired contracts ──────────────────────────────────────────────────

  /**
   * Contracts whose end date has passed and which nobody has renewed or closed.
   *
   * Matched on the date as well as the status, not the status alone: the status
   * is maintained by a nightly cron, so between runs — or any time it has not
   * run — a lapsed contract is still marked ACTIVE. Reading the field alone
   * would quietly under-report exactly the thing this list exists to surface.
   *
   * DRAFT is excluded. A draft that was never signed has not expired; it was
   * never in force, and showing it as needing renewal is noise.
   */
  async getExpiredContracts(limit?: number): Promise<ContractResponse[]> {
    const now = new Date();

    const contracts = await prisma.contract.findMany({
      where: {
        status:      { not: 'DRAFT' },
        contractEnd: { lt: now },
      },
      // Most recently lapsed first: those are the ones still worth chasing.
      orderBy: { contractEnd: 'desc' },
      include: CONTRACT_INCLUDE,
      ...(limit ? { take: limit } : {}),
    });

    return contracts.map((c) => this.formatContract(c));
  }

  /** Both expiry lists in one round trip, for the clients dashboard. */
  async getExpiryAlerts(
    daysThreshold = 30,
    limit = 10,
  ): Promise<{ expiring: ContractResponse[]; expired: ContractResponse[] }> {
    const [expiring, expired] = await Promise.all([
      this.getExpiringContracts(daysThreshold),
      this.getExpiredContracts(limit),
    ]);
    return { expiring: expiring.slice(0, limit), expired };
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
    const rawDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    // Kept floored at 0 — callers already read it as "time left", and letting
    // it go negative would put expired contracts inside every `<= 30` test.
    const daysRemaining   = Math.max(0, rawDays);
    const daysSinceExpiry = rawDays < 0 ? Math.abs(rawDays) : null;

    return {
      id:                c.id,
      client:            { id: c.client.id, clientName: c.client.clientName },
      contractStart:     c.contractStart instanceof Date ? c.contractStart.toISOString() : c.contractStart,
      contractEnd:       end.toISOString(),
      guardsRequired:    c.guardsRequired,
      totalMonthlyValue: c.totalMonthlyValue ?? 0,
      status:            c.status,
      daysRemaining,
      daysSinceExpiry,
      amendmentCount:    c.amendmentCount ?? 0,
      weaponsAllocation: c.weaponsAllocation ?? null,
      shiftPattern:      (c.shiftPattern as ShiftPattern | null) ?? null,
      guardRates: (c.guardRates ?? []).map((r: any): ContractGuardRateResponse => ({
        id:           r.id,
        guardType:    r.guardType,
        guardsCount:  r.guardsCount,
        ratePerGuard: r.ratePerGuard,
        monthlyTotal: r.monthlyTotal ?? r.guardsCount * r.ratePerGuard,
      })),
      billingNote: c.billingNote ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    };
  }
}

export const contractService = new ContractService();
