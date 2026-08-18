import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { safeDate, dateRangeFilter } from '../lib/dateUtils';
import { AppError, NotFoundError } from '../errors/AppError';
import { generateClientId } from '../lib/systemId';
import {
  PROSPECT_STATUSES, PIPELINE_ORDER, OPEN_PIPELINE_STATUSES,
  prospectStatusLabel,
} from '@stap/shared';
import type {
  CreateProspectInput, UpdateProspectInput,
  CreateBidInput, UpdateBidInput, CreateTargetInput,
  ProspectResponse, ProspectWithHistory, ProspectStatusHistoryEntry,
  BidResponse, MarketingTargetResponse, MarketingDashboardData,
  MarketingReport, MarketingReportType, ProspectStatus, PaginatedResponse,
} from '@stap/shared';

const DAY_MS = 86_400_000;

const PROSPECT_INCLUDE = {
  assignedToUser: { select: { id: true, name: true } },
  createdByUser:  { select: { id: true, name: true } },
} as const;

const BID_INCLUDE = {
  assignedToUser:  { select: { id: true, name: true } },
  submittedByUser: { select: { id: true, name: true } },
  createdByUser:   { select: { id: true, name: true } },
} as const;

const TARGET_INCLUDE = {
  assignedToUser: { select: { id: true, name: true } },
} as const;

const ugx = (n: number) => `UGX ${n.toLocaleString()}`;
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

function sanitiseProspect(p: any): ProspectResponse {
  return {
    id:             p.id,
    companyName:    p.companyName,
    contactName:    p.contactName ?? null,
    contactPhone:   p.contactPhone ?? null,
    contactEmail:   p.contactEmail ?? null,
    address:        p.address ?? null,
    industry:       p.industry ?? null,
    notes:          p.notes ?? null,
    status:         p.status,
    estimatedValue: p.estimatedValue ?? null,
    lostReason:     p.lostReason ?? null,
    wonDate:        p.wonDate?.toISOString() ?? null,
    convertedClientId: p.convertedClientId ?? null,
    assignedTo:     p.assignedToUser ?? null,
    createdBy:      p.createdByUser ?? null,
    createdAt:      p.createdAt.toISOString(),
    updatedAt:      p.updatedAt.toISOString(),
  };
}

function sanitiseHistory(h: any): ProspectStatusHistoryEntry {
  return {
    id:         h.id,
    fromStatus: h.fromStatus ?? null,
    toStatus:   h.toStatus,
    note:       h.note ?? null,
    changedBy:  { id: h.changedByUser.id, name: h.changedByUser.name },
    createdAt:  h.createdAt.toISOString(),
  };
}

function sanitiseBid(b: any): BidResponse {
  return {
    id:             b.id,
    organization:   b.organization,
    bidType:        b.bidType,
    amount:         b.amount ?? null,
    submissionDate: b.submissionDate?.toISOString() ?? null,
    closingDate:    b.closingDate?.toISOString() ?? null,
    status:         b.status,
    description:    b.description ?? null,
    requirements:   b.requirements ?? null,
    notes:          b.notes ?? null,
    lostReason:     b.lostReason ?? null,
    daysToClosing:  b.closingDate
      ? Math.ceil((b.closingDate.getTime() - Date.now()) / DAY_MS)
      : null,
    assignedTo:     b.assignedToUser ?? null,
    submittedBy:    b.submittedByUser ?? null,
    createdBy:      b.createdByUser ?? null,
    createdAt:      b.createdAt.toISOString(),
    updatedAt:      b.updatedAt.toISOString(),
  };
}

function sanitiseTarget(t: any): MarketingTargetResponse {
  return {
    id:              t.id,
    assignedTo:      { id: t.assignedToUser.id, name: t.assignedToUser.name },
    period:          t.period,
    periodType:      t.periodType,
    targetLabel:     t.targetLabel,
    targetValue:     t.targetValue,
    targetClients:   t.targetClients ?? null,
    targetBids:      t.targetBids ?? null,
    achievedValue:   t.achievedValue,
    achievedClients: t.achievedClients,
    achievedBids:    t.achievedBids,
    progressPct:     t.targetValue > 0
      ? Math.round((t.achievedValue / t.targetValue) * 100)
      : 0,
    notes:           t.notes ?? null,
    createdAt:       t.createdAt.toISOString(),
    updatedAt:       t.updatedAt.toISOString(),
  };
}

/** Period key a date falls into, for the given granularity. */
function periodKey(date: Date, periodType: string): string {
  const y = date.getFullYear();
  if (periodType === 'ANNUAL')    return String(y);
  if (periodType === 'QUARTERLY') return `${y}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive start and exclusive end of a period key. */
/**
 * The calendar window a target is measured over.
 *
 * Returns null when `period` does not match `periodType` — a QUARTERLY target
 * whose period is a bare year, say. Every branch here used to build the range
 * from Number(), so an unparseable period produced `new Date(NaN)` and Prisma
 * rejected the whole query, taking the targets list and the marketing
 * dashboard down with it. Callers now decide what to do with an unreadable
 * period instead of querying on a broken one.
 */
function periodRange(period: string, periodType: string): { start: Date; end: Date } | null {
  const ok = (start: Date, end: Date) =>
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };

  // Number('') is 0, not NaN — without this an empty period would silently
  // resolve to the year 1900 rather than being rejected.
  if (typeof period !== 'string' || period.trim() === '') return null;

  if (periodType === 'ANNUAL') {
    const y = Number(period);
    if (!Number.isInteger(y)) return null;
    return ok(new Date(y, 0, 1), new Date(y + 1, 0, 1));
  }

  if (periodType === 'QUARTERLY') {
    const parts = period.split('-Q');
    if (parts.length !== 2) return null;
    const [y, q] = parts.map(Number);
    if (!Number.isInteger(y) || !Number.isInteger(q) || q < 1 || q > 4) return null;
    const m = (q - 1) * 3;
    return ok(new Date(y, m, 1), new Date(y, m + 3, 1));
  }

  // MONTHLY — "YYYY-MM"
  const parts = period.split('-');
  if (parts.length !== 2) return null;
  const [y, m] = parts.map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return ok(new Date(y, m - 1, 1), new Date(y, m, 1));
}

class MarketingService {
  // ── Prospects ───────────────────────────────────────────────────────────────

  async createProspect(data: CreateProspectInput, createdById: string): Promise<ProspectResponse> {
    const status = data.status ?? 'NEW';

    const prospect = await prisma.$transaction(async (tx) => {
      const created = await tx.prospectiveClient.create({
        data: {
          companyName:    data.companyName.trim(),
          contactName:    data.contactName?.trim() || null,
          contactPhone:   data.contactPhone?.trim() || null,
          contactEmail:   data.contactEmail?.trim() || null,
          address:        data.address?.trim() || null,
          industry:       data.industry?.trim() || null,
          notes:          data.notes?.trim() || null,
          status,
          estimatedValue: data.estimatedValue ?? null,
          assignedToId:   data.assignedToId ?? createdById,
          createdById,
          ...(status === 'WON' ? { wonDate: new Date() } : {}),
        },
        include: PROSPECT_INCLUDE,
      });

      // The opening entry has no fromStatus — it is where the prospect entered
      // the pipeline, not a move.
      await tx.prospectStatusHistory.create({
        data: { prospectId: created.id, fromStatus: null, toStatus: status, changedById: createdById },
      });

      return created;
    });

    await QueueService.logAudit({
      userId:   createdById,
      action:   'PROSPECT_CREATED',
      entity:   'prospectiveClient',
      entityId: prospect.id,
      newValue: { companyName: prospect.companyName, status },
    });

    return sanitiseProspect(prospect);
  }

  async updateProspect(
    id: string, data: UpdateProspectInput, updatedById: string,
  ): Promise<ProspectResponse> {
    const existing = await prisma.prospectiveClient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Prospect not found');

    const statusChanged = !!data.status && data.status !== existing.status;

    if (existing.status === 'WON' && existing.convertedClientId && statusChanged) {
      throw new AppError(
        `${existing.companyName} has already been converted into a client and cannot be moved ` +
        `back through the pipeline.`,
        400,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.prospectiveClient.update({
        where: { id },
        data: {
          ...(data.companyName    !== undefined ? { companyName: data.companyName.trim() }        : {}),
          ...(data.contactName    !== undefined ? { contactName: data.contactName?.trim() || null } : {}),
          ...(data.contactPhone   !== undefined ? { contactPhone: data.contactPhone?.trim() || null } : {}),
          ...(data.contactEmail   !== undefined ? { contactEmail: data.contactEmail?.trim() || null } : {}),
          ...(data.address        !== undefined ? { address: data.address?.trim() || null }       : {}),
          ...(data.industry       !== undefined ? { industry: data.industry?.trim() || null }     : {}),
          ...(data.notes          !== undefined ? { notes: data.notes?.trim() || null }           : {}),
          ...(data.estimatedValue !== undefined ? { estimatedValue: data.estimatedValue ?? null } : {}),
          ...(data.assignedToId   !== undefined ? { assignedToId: data.assignedToId ?? null }     : {}),
          ...(data.status         !== undefined ? { status: data.status }                          : {}),
          // Won and lost markers follow the status rather than being set by hand.
          ...(statusChanged && data.status === 'WON'  ? { wonDate: new Date(), lostReason: null } : {}),
          ...(statusChanged && data.status === 'LOST' ? { lostReason: data.lostReason?.trim() ?? null } : {}),
          ...(statusChanged && data.status !== 'LOST' && data.status !== 'WON'
            ? { lostReason: null, wonDate: null } : {}),
        },
        include: PROSPECT_INCLUDE,
      });

      if (statusChanged) {
        await tx.prospectStatusHistory.create({
          data: {
            prospectId:  id,
            fromStatus:  existing.status,
            toStatus:    data.status!,
            note:        data.note?.trim() || null,
            changedById: updatedById,
          },
        });
      }

      return row;
    });

    if (statusChanged) {
      await QueueService.logAudit({
        userId:   updatedById,
        action:   'PROSPECT_STATUS_CHANGED',
        entity:   'prospectiveClient',
        entityId: id,
        oldValue: { status: existing.status },
        newValue: { status: data.status, companyName: updated.companyName },
      });
    }

    return sanitiseProspect(updated);
  }

  /**
   * Turns a won prospect into a real Client.
   *
   * The link is kept on both sides so the closed-business report can show what
   * a client was worth when it was won.
   */
  async convertProspect(id: string, convertedById: string): Promise<{ prospect: ProspectResponse; clientId: string }> {
    const prospect = await prisma.prospectiveClient.findUnique({ where: { id } });
    if (!prospect) throw new NotFoundError('Prospect not found');

    if (prospect.status !== 'WON') {
      throw new AppError(
        `Only won prospects can be converted. ${prospect.companyName} is currently ` +
        `${prospectStatusLabel(prospect.status).replace(/^\S+\s/, '')}.`,
        400,
      );
    }
    if (prospect.convertedClientId) {
      throw new AppError(`${prospect.companyName} has already been converted into a client.`, 409);
    }

    const clash = await prisma.client.findFirst({
      where:  { clientName: { equals: prospect.companyName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) {
      throw new AppError(
        `A client named "${prospect.companyName}" already exists. Link or rename before converting.`,
        409,
      );
    }

    // A Client needs a contact person, phone and physical address. Rather than
    // invent placeholders that would land in invoices and contracts, insist the
    // prospect carries them before it can become a client.
    const missing = [
      !prospect.contactName?.trim()  && 'contact name',
      !prospect.contactPhone?.trim() && 'contact phone',
      !prospect.address?.trim()      && 'physical address',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      throw new AppError(
        `${prospect.companyName} is missing its ${missing.join(', ')}. ` +
        `Add ${missing.length === 1 ? 'it' : 'them'} to the prospect before converting it into a client.`,
        400,
      );
    }

    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          systemId:        await generateClientId(),
          clientName:      prospect.companyName,
          contactPerson:   prospect.contactName!,
          contactPhone:    prospect.contactPhone!,
          email:           prospect.contactEmail,
          physicalAddress: prospect.address!,
          // Standard terms; Finance adjusts on the client record afterwards.
          billingTerms:    30,
          leadStatus:      'CONVERTED',
        },
      });
      await tx.prospectiveClient.update({
        where: { id },
        data:  { convertedClientId: created.id },
      });
      return created;
    });

    await QueueService.logAudit({
      userId:   convertedById,
      action:   'PROSPECT_CONVERTED',
      entity:   'prospectiveClient',
      entityId: id,
      newValue: { clientId: client.id, companyName: prospect.companyName },
    });

    const refreshed = await prisma.prospectiveClient.findUnique({ where: { id }, include: PROSPECT_INCLUDE });
    return { prospect: sanitiseProspect(refreshed), clientId: client.id };
  }

  async listProspects(query: {
    status?: string; assignedToId?: string; search?: string; page: number; limit: number;
  }): Promise<PaginatedResponse<ProspectResponse>> {
    const where: any = {};
    if (query.status)       where.status       = query.status;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { industry:    { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.prospectiveClient.findMany({
        where, include: PROSPECT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.prospectiveClient.count({ where }),
    ]);

    const totalPages = Math.ceil(total / query.limit);
    return {
      data: items.map(sanitiseProspect),
      pagination: {
        page: query.page, limit: query.limit, total, totalPages,
        hasNext: query.page < totalPages, hasPrev: query.page > 1,
      },
    };
  }

  async getProspect(id: string): Promise<ProspectWithHistory> {
    const p = await prisma.prospectiveClient.findUnique({
      where:   { id },
      include: {
        ...PROSPECT_INCLUDE,
        statusHistory: {
          include: { changedByUser: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!p) throw new NotFoundError('Prospect not found');
    return { ...sanitiseProspect(p), statusHistory: p.statusHistory.map(sanitiseHistory) };
  }

  // ── Bids ────────────────────────────────────────────────────────────────────

  async createBid(data: CreateBidInput, createdById: string): Promise<BidResponse> {
    const bid = await prisma.bid.create({
      data: {
        organization:   data.organization.trim(),
        bidType:        data.bidType,
        amount:         data.amount ?? null,
        submissionDate: data.submissionDate ? new Date(data.submissionDate) : null,
        closingDate:    data.closingDate    ? new Date(data.closingDate)    : null,
        status:         data.status ?? 'DRAFT',
        description:    data.description?.trim() || null,
        requirements:   data.requirements?.trim() || null,
        notes:          data.notes?.trim() || null,
        assignedToId:   data.assignedToId ?? createdById,
        createdById,
        // Submitting is what puts a name against the bid.
        ...(data.status === 'SUBMITTED' ? { submittedById: createdById } : {}),
      },
      include: BID_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdById,
      action:   'BID_CREATED',
      entity:   'bid',
      entityId: bid.id,
      newValue: { organization: bid.organization, bidType: bid.bidType, amount: bid.amount },
    });

    return sanitiseBid(bid);
  }

  async updateBid(id: string, data: UpdateBidInput, updatedById: string): Promise<BidResponse> {
    const existing = await prisma.bid.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Bid not found');

    const nowSubmitted = data.status === 'SUBMITTED' && existing.status !== 'SUBMITTED';

    const bid = await prisma.bid.update({
      where: { id },
      data: {
        ...(data.organization   !== undefined ? { organization: data.organization.trim() }      : {}),
        ...(data.bidType        !== undefined ? { bidType: data.bidType }                        : {}),
        ...(data.amount         !== undefined ? { amount: data.amount ?? null }                  : {}),
        ...(data.submissionDate !== undefined ? { submissionDate: data.submissionDate ? new Date(data.submissionDate) : null } : {}),
        ...(data.closingDate    !== undefined ? { closingDate: data.closingDate ? new Date(data.closingDate) : null }          : {}),
        ...(data.status         !== undefined ? { status: data.status }                          : {}),
        ...(data.description    !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.requirements   !== undefined ? { requirements: data.requirements?.trim() || null } : {}),
        ...(data.notes          !== undefined ? { notes: data.notes?.trim() || null }            : {}),
        ...(data.assignedToId   !== undefined ? { assignedToId: data.assignedToId ?? null }      : {}),
        ...(data.status === 'LOST' ? { lostReason: data.lostReason?.trim() ?? null } : {}),
        ...(nowSubmitted ? { submittedById: updatedById, submissionDate: existing.submissionDate ?? new Date() } : {}),
      },
      include: BID_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   updatedById,
      action:   'BID_UPDATED',
      entity:   'bid',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: bid.status, organization: bid.organization },
    });

    return sanitiseBid(bid);
  }

  async listBids(query: {
    status?: string; bidType?: string; assignedToId?: string; search?: string;
    page: number; limit: number;
  }): Promise<PaginatedResponse<BidResponse>> {
    const where: any = {};
    if (query.status)       where.status       = query.status;
    if (query.bidType)      where.bidType      = query.bidType;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.search) {
      where.organization = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.bid.findMany({
        where, include: BID_INCLUDE,
        // Live bids sort by what closes soonest; nulls sink to the bottom.
        orderBy: [{ closingDate: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.bid.count({ where }),
    ]);

    const totalPages = Math.ceil(total / query.limit);
    return {
      data: items.map(sanitiseBid),
      pagination: {
        page: query.page, limit: query.limit, total, totalPages,
        hasNext: query.page < totalPages, hasPrev: query.page > 1,
      },
    };
  }

  async getBid(id: string): Promise<BidResponse> {
    const bid = await prisma.bid.findUnique({ where: { id }, include: BID_INCLUDE });
    if (!bid) throw new NotFoundError('Bid not found');
    return sanitiseBid(bid);
  }

  // ── Targets ─────────────────────────────────────────────────────────────────

  async createTarget(data: CreateTargetInput, createdById: string): Promise<MarketingTargetResponse> {
    const officer = await prisma.user.findUnique({
      where: { id: data.assignedToId }, select: { id: true },
    });
    if (!officer) throw new NotFoundError('Officer not found');

    // Re-issuing a target for the same officer and period updates it, rather
    // than leaving two competing figures in place.
    const target = await prisma.marketingTarget.upsert({
      where: {
        assignedToId_period_periodType: {
          assignedToId: data.assignedToId, period: data.period, periodType: data.periodType,
        },
      },
      create: {
        assignedToId:  data.assignedToId,
        period:        data.period,
        periodType:    data.periodType,
        targetLabel:   data.targetLabel,
        targetValue:   data.targetValue,
        targetClients: data.targetClients ?? null,
        targetBids:    data.targetBids ?? null,
        notes:         data.notes?.trim() || null,
        createdById,
      },
      update: {
        targetLabel:   data.targetLabel,
        targetValue:   data.targetValue,
        targetClients: data.targetClients ?? null,
        targetBids:    data.targetBids ?? null,
        notes:         data.notes?.trim() || null,
      },
      include: TARGET_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdById,
      action:   'MARKETING_TARGET_SET',
      entity:   'marketingTarget',
      entityId: target.id,
      newValue: { period: target.period, targetValue: target.targetValue, assignedToId: data.assignedToId },
    });

    return this.refreshTarget(target.id);
  }

  /**
   * Recomputes a target's achievement from the record.
   *
   * Achievement is derived, never typed in — anything else would let the
   * numbers drift from the prospects and bids they are meant to summarise.
   */
  async refreshTarget(id: string): Promise<MarketingTargetResponse> {
    const target = await prisma.marketingTarget.findUnique({ where: { id }, include: TARGET_INCLUDE });
    if (!target) throw new NotFoundError('Target not found');

    const range = periodRange(target.period, target.periodType);

    // An unreadable period means achievement cannot be computed. Returning the
    // stored figures untouched keeps the targets list and the dashboard alive
    // for every other row; recomputing against a guessed window, or writing
    // zeroes, would put a number on screen that nothing supports.
    if (!range) {
      console.warn(
        `Marketing target ${target.id} has period "${target.period}" which is not a valid ` +
        `${target.periodType} period — achievement left as stored.`,
      );
      return sanitiseTarget(target);
    }
    const { start, end } = range;

    const [won, bids] = await Promise.all([
      prisma.prospectiveClient.findMany({
        where: {
          status:       'WON',
          assignedToId: target.assignedToId,
          wonDate:      { gte: start, lt: end },
        },
        select: { estimatedValue: true },
      }),
      prisma.bid.count({
        where: {
          assignedToId: target.assignedToId,
          status:       { in: ['SUBMITTED', 'WON', 'LOST'] },
          submissionDate: { gte: start, lt: end },
        },
      }),
    ]);

    const achievedValue   = won.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0);
    const achievedClients = won.length;

    const updated = await prisma.marketingTarget.update({
      where: { id },
      data:  { achievedValue, achievedClients, achievedBids: bids },
      include: TARGET_INCLUDE,
    });
    return sanitiseTarget(updated);
  }

  async listTargets(filters: { assignedToId?: string; period?: string }): Promise<MarketingTargetResponse[]> {
    const targets = await prisma.marketingTarget.findMany({
      where: {
        ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
        ...(filters.period       ? { period: filters.period }             : {}),
      },
      include: TARGET_INCLUDE,
      orderBy: [{ period: 'desc' }, { periodType: 'asc' }],
    });

    // Refreshed on read so the page never shows a stale figure.
    return Promise.all(targets.map(t => this.refreshTarget(t.id)));
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboard(userId: string): Promise<MarketingDashboardData> {
    const now       = new Date();
    const in60Days  = new Date(now.getTime() + 60 * DAY_MS);
    const thisMonth = periodKey(now, 'MONTHLY');

    const [byStatus, activeBids, upcomingExpiries, target, activity] = await Promise.all([
      prisma.prospectiveClient.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.bid.count({ where: { status: 'SUBMITTED' } }),
      prisma.contract.count({
        where: { status: 'ACTIVE', contractEnd: { gte: now, lte: in60Days } },
      }),
      prisma.marketingTarget.findFirst({
        where:   { assignedToId: userId, period: thisMonth, periodType: 'MONTHLY' },
        include: TARGET_INCLUDE,
      }),
      prisma.prospectStatusHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take:    10,
        include: {
          prospect:      { select: { companyName: true } },
          changedByUser: { select: { id: true, name: true } },
        },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map(s => [s.status, s._count.id])) as Record<string, number>;
    const totalProspects = byStatus.reduce((sum, s) => sum + s._count.id, 0);
    const won  = counts.WON  ?? 0;
    const lost = counts.LOST ?? 0;
    const inPipeline = OPEN_PIPELINE_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
    const decided = won + lost;

    const currentTarget = target ? await this.refreshTarget(target.id) : null;

    return {
      role:  'MARKETING',
      stats: {
        totalProspects,
        inPipeline,
        won,
        lost,
        activeBids,
        upcomingExpiries,
        targetProgress: currentTarget?.progressPct ?? null,
        // Of the deals that reached a decision, how many were won.
        conversionRate: decided > 0 ? Math.round((won / decided) * 100) : 0,
      },
      prospectsByStatus: PIPELINE_ORDER.map(status => ({
        status,
        label: PROSPECT_STATUSES.find(s => s.value === status)!.label,
        count: counts[status] ?? 0,
      })),
      currentTarget,
      recentActivity: activity.map(a => ({
        ...sanitiseHistory(a),
        companyName: a.prospect.companyName,
      })),
    };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async generateReport(
    type: MarketingReportType,
    filters: { dateFrom?: string; dateTo?: string; assignedToId?: string },
  ): Promise<MarketingReport> {
    // Query strings arrive unvalidated: '' and 'garbage' both reached new Date()
    // here, and an Invalid Date crashed either toISOString() below or the Prisma
    // call further down. An unreadable bound is now simply not applied.
    const from  = safeDate(filters.dateFrom);
    const to    = safeDate(filters.dateTo);
    const range = dateRangeFilter(from, to, true);
    const officer = filters.assignedToId ? { assignedToId: filters.assignedToId } : {};

    const base = {
      type,
      generatedAt: new Date().toISOString(),
      dateFrom:    from?.toISOString() ?? null,
      dateTo:      to?.toISOString() ?? null,
    };

    if (type === 'PIPELINE') {
      const grouped = await prisma.prospectiveClient.groupBy({
        by:      ['status'],
        _count:  { id: true },
        _sum:    { estimatedValue: true },
        where:   { ...officer, ...(range ? { createdAt: range } : {}) },
      });
      const map = new Map(grouped.map(g => [g.status, g]));
      const rows = PIPELINE_ORDER.map(status => {
        const g = map.get(status);
        return [
          prospectStatusLabel(status),
          g?._count.id ?? 0,
          g?._sum.estimatedValue ?? 0,
        ];
      });
      const totalValue = rows.reduce((s, r) => s + (r[2] as number), 0);
      return {
        ...base,
        title:   'Pipeline Report',
        columns: ['Stage', 'Prospects', 'Estimated Monthly Value (UGX)'],
        rows,
        summary: [
          { label: 'Prospects', value: String(rows.reduce((s, r) => s + (r[1] as number), 0)) },
          { label: 'Pipeline value', value: ugx(totalValue) },
        ],
      };
    }

    if (type === 'PROSPECTS') {
      const items = await prisma.prospectiveClient.findMany({
        where:   { ...officer, ...(range ? { createdAt: range } : {}) },
        include: PROSPECT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      return {
        ...base,
        title:   'Prospects Report',
        columns: ['Company', 'Contact', 'Industry', 'Status', 'Est. Value (UGX)', 'Assigned To', 'Created'],
        rows: items.map(p => [
          p.companyName,
          p.contactName ?? '—',
          p.industry ?? '—',
          prospectStatusLabel(p.status),
          p.estimatedValue ?? 0,
          p.assignedToUser?.name ?? '—',
          dateOnly(p.createdAt),
        ]),
        summary: [{ label: 'Prospects', value: String(items.length) }],
      };
    }

    if (type === 'CLOSED_BUSINESS') {
      const items = await prisma.prospectiveClient.findMany({
        where:   { status: 'WON', ...officer, ...(range ? { wonDate: range } : { wonDate: { not: null } }) },
        include: { ...PROSPECT_INCLUDE, convertedClient: { select: { clientName: true, contractStatus: true } } },
        orderBy: { wonDate: 'desc' },
      });
      const total = items.reduce((s, p) => s + (p.estimatedValue ?? 0), 0);
      return {
        ...base,
        title:   'Closed Business Report',
        columns: ['Company', 'Date Won', 'Contract Value (UGX)', 'Marketing Officer', 'Client Status'],
        rows: items.map(p => [
          p.companyName,
          dateOnly(p.wonDate),
          p.estimatedValue ?? 0,
          p.assignedToUser?.name ?? '—',
          p.convertedClient ? p.convertedClient.contractStatus : 'Not yet converted',
        ]),
        summary: [
          { label: 'Deals won', value: String(items.length) },
          { label: 'Total monthly value', value: ugx(total) },
        ],
      };
    }

    if (type === 'BIDS') {
      const items = await prisma.bid.findMany({
        where:   { ...officer, ...(range ? { createdAt: range } : {}) },
        include: BID_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      const wonCount = items.filter(b => b.status === 'WON').length;
      const decided  = items.filter(b => b.status === 'WON' || b.status === 'LOST').length;
      return {
        ...base,
        title:   'Bid Performance Report',
        columns: ['Organisation', 'Type', 'Amount (UGX)', 'Submitted', 'Closing', 'Status', 'Assigned To'],
        rows: items.map(b => [
          b.organization,
          b.bidType,
          b.amount ?? 0,
          dateOnly(b.submissionDate),
          dateOnly(b.closingDate),
          b.status,
          b.assignedToUser?.name ?? '—',
        ]),
        summary: [
          { label: 'Bids', value: String(items.length) },
          { label: 'Won', value: String(wonCount) },
          { label: 'Win rate', value: decided > 0 ? `${Math.round((wonCount / decided) * 100)}%` : '—' },
        ],
      };
    }

    // PERFORMANCE — one row per officer.
    const officers = await prisma.user.findMany({
      where:  { role: 'MARKETING', ...(filters.assignedToId ? { id: filters.assignedToId } : {}) },
      select: { id: true, name: true },
    });

    const rows = await Promise.all(officers.map(async (o) => {
      const [total, won, lost, bidsSubmitted, bidsWon, wonValue] = await Promise.all([
        prisma.prospectiveClient.count({ where: { assignedToId: o.id, ...(range ? { createdAt: range } : {}) } }),
        prisma.prospectiveClient.count({ where: { assignedToId: o.id, status: 'WON', ...(range ? { wonDate: range } : {}) } }),
        prisma.prospectiveClient.count({ where: { assignedToId: o.id, status: 'LOST', ...(range ? { updatedAt: range } : {}) } }),
        prisma.bid.count({ where: { assignedToId: o.id, status: { in: ['SUBMITTED', 'WON', 'LOST'] }, ...(range ? { createdAt: range } : {}) } }),
        prisma.bid.count({ where: { assignedToId: o.id, status: 'WON', ...(range ? { createdAt: range } : {}) } }),
        prisma.prospectiveClient.aggregate({
          where: { assignedToId: o.id, status: 'WON', ...(range ? { wonDate: range } : {}) },
          _sum:  { estimatedValue: true },
        }),
      ]);
      const decided = won + lost;
      return [
        o.name, total, won, lost,
        decided > 0 ? `${Math.round((won / decided) * 100)}%` : '—',
        bidsSubmitted, bidsWon,
        wonValue._sum.estimatedValue ?? 0,
      ] as (string | number)[];
    }));

    return {
      ...base,
      title:   'Marketing Performance Report',
      columns: ['Officer', 'Prospects', 'Won', 'Lost', 'Conversion', 'Bids Submitted', 'Bids Won', 'Value Won (UGX)'],
      rows,
      summary: [{ label: 'Officers', value: String(officers.length) }],
    };
  }
}

export const marketingService = new MarketingService();
