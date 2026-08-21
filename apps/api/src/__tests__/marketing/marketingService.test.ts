import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateProspectSchema, UpdateProspectSchema, CreateBidSchema,
  PIPELINE_ORDER, OPEN_PIPELINE_STATUSES,
} from '@stap/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    prospectiveClient:     { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    prospectStatusHistory: { create: vi.fn(), findMany: vi.fn() },
    bid:                   { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    marketingTarget:       { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    client:                { findFirst: vi.fn(), create: vi.fn() },
    contract:              { count: vi.fn() },
    user:                  { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../lib/systemId', () => ({
  generateClientId: vi.fn().mockResolvedValue('CLT-0099'),
}));

import prisma from '../../db/prisma';
import { marketingService } from '../../services/marketingService';

const mp = prisma as any;

const OFFICER = 'user-marketing';

const prospectRow = (over: Record<string, any> = {}) => ({
  id: 'p1', companyName: 'Nakumatt Uganda Ltd',
  contactName: 'James Opolot', contactPhone: '+256772123456',
  contactEmail: 'j@nakumatt.co.ug', address: 'Plot 12 Kampala Road',
  industry: 'Retail', notes: null, status: 'NEGOTIATION',
  estimatedValue: 2_500_000, lostReason: null, wonDate: null,
  convertedClientId: null, assignedToId: OFFICER, createdById: OFFICER,
  assignedToUser: { id: OFFICER, name: 'Sylvia Akello' },
  createdByUser:  { id: OFFICER, name: 'Sylvia Akello' },
  createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-10'),
  ...over,
});

/** The transaction callback receives a client with the same shape. */
const tx = {
  prospectiveClient:     { create: vi.fn(), update: vi.fn() },
  prospectStatusHistory: { create: vi.fn() },
  client:                { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.prospectiveClient.create.mockResolvedValue(prospectRow({ status: 'NEW' }));
  tx.prospectiveClient.update.mockResolvedValue(prospectRow());
  tx.prospectStatusHistory.create.mockResolvedValue({});
  tx.client.create.mockResolvedValue({ id: 'client-9', clientName: 'Nakumatt Uganda Ltd' });
  mp.$transaction.mockImplementation((fn: any) => fn(tx));
});

// ── Pipeline constants ─────────────────────────────────────────────────────────

describe('pipeline constants', () => {
  it('runs from NEW through to the two closed states', () => {
    expect(PIPELINE_ORDER[0]).toBe('NEW');
    expect(PIPELINE_ORDER.slice(-2)).toEqual(['WON', 'LOST']);
  });

  it('treats neither WON nor LOST as open pipeline', () => {
    expect(OPEN_PIPELINE_STATUSES).not.toContain('WON');
    expect(OPEN_PIPELINE_STATUSES).not.toContain('LOST');
    expect(OPEN_PIPELINE_STATUSES).not.toContain('NEW');
  });
});

// ── Prospects ──────────────────────────────────────────────────────────────────

describe('createProspect()', () => {
  it('opens the history with a row that has no fromStatus', async () => {
    await marketingService.createProspect(
      { companyName: 'Nakumatt Uganda Ltd', status: 'NEW' } as any, OFFICER,
    );

    const history = tx.prospectStatusHistory.create.mock.calls[0][0].data;
    expect(history.fromStatus).toBeNull();
    expect(history.toStatus).toBe('NEW');
  });

  it('assigns the prospect to its creator when no owner is given', async () => {
    await marketingService.createProspect({ companyName: 'Acme Ltd' } as any, OFFICER);
    expect(tx.prospectiveClient.create.mock.calls[0][0].data.assignedToId).toBe(OFFICER);
  });

  it('stamps wonDate when a prospect is created already won', async () => {
    await marketingService.createProspect(
      { companyName: 'Acme Ltd', status: 'WON' } as any, OFFICER,
    );
    expect(tx.prospectiveClient.create.mock.calls[0][0].data.wonDate).toBeInstanceOf(Date);
  });
});

describe('updateProspect()', () => {
  it('records a history entry when the stage changes', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow({ status: 'PROPOSAL_SENT' }));

    await marketingService.updateProspect('p1', { status: 'NEGOTIATION', note: 'Met the CFO' } as any, OFFICER);

    const h = tx.prospectStatusHistory.create.mock.calls[0][0].data;
    expect(h.fromStatus).toBe('PROPOSAL_SENT');
    expect(h.toStatus).toBe('NEGOTIATION');
    expect(h.note).toBe('Met the CFO');
  });

  it('writes no history when only details change', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow());

    await marketingService.updateProspect('p1', { contactPhone: '+256700000000' } as any, OFFICER);

    expect(tx.prospectStatusHistory.create).not.toHaveBeenCalled();
  });

  it('stamps wonDate on the move to WON', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow());

    await marketingService.updateProspect('p1', { status: 'WON' } as any, OFFICER);

    expect(tx.prospectiveClient.update.mock.calls[0][0].data.wonDate).toBeInstanceOf(Date);
  });

  it('clears wonDate and lostReason when a deal reopens', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow({ status: 'LOST', lostReason: 'Price' }));

    await marketingService.updateProspect('p1', { status: 'NEGOTIATION' } as any, OFFICER);

    const data = tx.prospectiveClient.update.mock.calls[0][0].data;
    expect(data.lostReason).toBeNull();
    expect(data.wonDate).toBeNull();
  });

  it('refuses to move a prospect that has become a client', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(
      prospectRow({ status: 'WON', convertedClientId: 'client-9' }),
    );

    await expect(
      marketingService.updateProspect('p1', { status: 'NEGOTIATION' } as any, OFFICER),
    ).rejects.toThrow(/already been converted/);
  });

  it('throws when the prospect does not exist', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(null);
    await expect(
      marketingService.updateProspect('nope', { status: 'WON' } as any, OFFICER),
    ).rejects.toThrow('Prospect not found');
  });
});

// ── Conversion ─────────────────────────────────────────────────────────────────

describe('convertProspect()', () => {
  beforeEach(() => {
    mp.client.findFirst.mockResolvedValue(null);
    mp.prospectiveClient.findUnique
      .mockResolvedValueOnce(prospectRow({ status: 'WON' }))
      .mockResolvedValue(prospectRow({ status: 'WON', convertedClientId: 'client-9' }));
  });

  it('creates a client and links it back to the prospect', async () => {
    const result = await marketingService.convertProspect('p1', OFFICER);

    expect(result.clientId).toBe('client-9');
    const data = tx.client.create.mock.calls[0][0].data;
    expect(data.clientName).toBe('Nakumatt Uganda Ltd');
    expect(data.contactPerson).toBe('James Opolot');
    expect(data.physicalAddress).toBe('Plot 12 Kampala Road');
    expect(data.systemId).toBe('CLT-0099');
    expect(tx.prospectiveClient.update.mock.calls[0][0].data.convertedClientId).toBe('client-9');
  });

  it('refuses to convert a prospect that has not been won', async () => {
    mp.prospectiveClient.findUnique.mockReset();
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow({ status: 'NEGOTIATION' }));

    await expect(marketingService.convertProspect('p1', OFFICER)).rejects.toThrow(/Only won prospects/);
  });

  it('refuses a second conversion', async () => {
    mp.prospectiveClient.findUnique.mockReset();
    mp.prospectiveClient.findUnique.mockResolvedValue(
      prospectRow({ status: 'WON', convertedClientId: 'client-9' }),
    );

    await expect(marketingService.convertProspect('p1', OFFICER)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses when a client of the same name already exists', async () => {
    mp.prospectiveClient.findUnique.mockReset();
    mp.prospectiveClient.findUnique.mockResolvedValue(prospectRow({ status: 'WON' }));
    mp.client.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(marketingService.convertProspect('p1', OFFICER)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('names every missing detail rather than inventing placeholders', async () => {
    mp.prospectiveClient.findUnique.mockReset();
    mp.prospectiveClient.findUnique.mockResolvedValue(
      prospectRow({ status: 'WON', contactName: null, contactPhone: null, address: null }),
    );

    await expect(marketingService.convertProspect('p1', OFFICER))
      .rejects.toThrow(/contact name, contact phone, physical address/);

    expect(tx.client.create).not.toHaveBeenCalled();
  });
});

// ── Bids ───────────────────────────────────────────────────────────────────────

describe('createBid()', () => {
  it('records who submitted it when created as SUBMITTED', async () => {
    mp.bid.create.mockResolvedValue({
      id: 'b1', organization: 'Ministry of Finance', bidType: 'TENDER', amount: 15_000_000,
      submissionDate: null, closingDate: null, status: 'SUBMITTED',
      description: null, requirements: null, notes: null, lostReason: null,
      assignedToUser: null, submittedByUser: null, createdByUser: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await marketingService.createBid(
      { organization: 'Ministry of Finance', bidType: 'TENDER', status: 'SUBMITTED' } as any, OFFICER,
    );

    expect(mp.bid.create.mock.calls[0][0].data.submittedById).toBe(OFFICER);
  });

  it('leaves the submitter blank on a draft', async () => {
    mp.bid.create.mockResolvedValue({
      id: 'b1', organization: 'X', bidType: 'RFP', amount: null,
      submissionDate: null, closingDate: null, status: 'DRAFT',
      description: null, requirements: null, notes: null, lostReason: null,
      assignedToUser: null, submittedByUser: null, createdByUser: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await marketingService.createBid({ organization: 'X', bidType: 'RFP', status: 'DRAFT' } as any, OFFICER);

    expect(mp.bid.create.mock.calls[0][0].data.submittedById).toBeUndefined();
  });

  it('computes days remaining to the closing date', async () => {
    const closing = new Date(Date.now() + 5 * 86_400_000);
    mp.bid.create.mockResolvedValue({
      id: 'b1', organization: 'X', bidType: 'TENDER', amount: null,
      submissionDate: null, closingDate: closing, status: 'DRAFT',
      description: null, requirements: null, notes: null, lostReason: null,
      assignedToUser: null, submittedByUser: null, createdByUser: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const bid = await marketingService.createBid({ organization: 'X', bidType: 'TENDER' } as any, OFFICER);
    expect(bid.daysToClosing).toBe(5);
  });
});

// ── Targets ────────────────────────────────────────────────────────────────────

describe('refreshTarget()', () => {
  it('derives achievement from won prospects and submitted bids in the period', async () => {
    mp.marketingTarget.findUnique.mockResolvedValue({
      id: 't1', assignedToId: OFFICER, period: '2026-08', periodType: 'MONTHLY',
      targetLabel: 'August 2026', targetValue: 10_000_000,
      targetClients: 3, targetBids: 2,
      achievedValue: 0, achievedClients: 0, achievedBids: 0,
      notes: null, assignedToUser: { id: OFFICER, name: 'Sylvia Akello' },
      createdAt: new Date(), updatedAt: new Date(),
    });
    mp.prospectiveClient.findMany.mockResolvedValue([
      { estimatedValue: 2_500_000 }, { estimatedValue: 1_500_000 }, { estimatedValue: null },
    ]);
    mp.bid.count.mockResolvedValue(2);
    mp.marketingTarget.update.mockImplementation(({ data }: any) => Promise.resolve({
      id: 't1', assignedToId: OFFICER, period: '2026-08', periodType: 'MONTHLY',
      targetLabel: 'August 2026', targetValue: 10_000_000, targetClients: 3, targetBids: 2,
      ...data, notes: null, assignedToUser: { id: OFFICER, name: 'Sylvia Akello' },
      createdAt: new Date(), updatedAt: new Date(),
    }));

    const target = await marketingService.refreshTarget('t1');

    expect(target.achievedValue).toBe(4_000_000);
    expect(target.achievedClients).toBe(3);
    expect(target.achievedBids).toBe(2);
    expect(target.progressPct).toBe(40);
  });

  it('scopes the query to the target period', async () => {
    mp.marketingTarget.findUnique.mockResolvedValue({
      id: 't1', assignedToId: OFFICER, period: '2026-Q1', periodType: 'QUARTERLY',
      targetLabel: 'Q1', targetValue: 1, targetClients: null, targetBids: null,
      achievedValue: 0, achievedClients: 0, achievedBids: 0, notes: null,
      assignedToUser: { id: OFFICER, name: 'S' }, createdAt: new Date(), updatedAt: new Date(),
    });
    mp.prospectiveClient.findMany.mockResolvedValue([]);
    mp.bid.count.mockResolvedValue(0);
    mp.marketingTarget.update.mockResolvedValue({
      id: 't1', assignedToId: OFFICER, period: '2026-Q1', periodType: 'QUARTERLY',
      targetLabel: 'Q1', targetValue: 1, targetClients: null, targetBids: null,
      achievedValue: 0, achievedClients: 0, achievedBids: 0, notes: null,
      assignedToUser: { id: OFFICER, name: 'S' }, createdAt: new Date(), updatedAt: new Date(),
    });

    await marketingService.refreshTarget('t1');

    const where = mp.prospectiveClient.findMany.mock.calls[0][0].where;
    expect(where.wonDate.gte).toEqual(new Date(2026, 0, 1));
    expect(where.wonDate.lt).toEqual(new Date(2026, 3, 1));
  });

  // A target whose period does not match its type used to build the window from
  // Number(), producing new Date(NaN). Prisma rejects that, and because
  // listTargets refreshes every row through Promise.all, one bad row took down
  // the whole targets page and the marketing dashboard with it.
  const corruptTarget = (period: string, periodType: string) => ({
    id: 't1', assignedToId: OFFICER, period, periodType,
    targetLabel: 'x', targetValue: 1000, targetClients: null, targetBids: null,
    achievedValue: 250, achievedClients: 2, achievedBids: 1, notes: null,
    assignedToUser: { id: OFFICER, name: 'S' }, createdAt: new Date(), updatedAt: new Date(),
  });

  it.each([
    ['2026',      'QUARTERLY'],
    ['2026-Q9',   'QUARTERLY'],
    ['2026-13',   'MONTHLY'],
    ['not-a-date','MONTHLY'],
    ['hello',     'ANNUAL'],
    ['',          'ANNUAL'],
  ])('never queries on an unreadable period (%s / %s)', async (period, periodType) => {
    mp.marketingTarget.findUnique.mockResolvedValue(corruptTarget(period, periodType));

    await expect(marketingService.refreshTarget('t1')).resolves.toBeTruthy();
    expect(mp.prospectiveClient.findMany).not.toHaveBeenCalled();
    expect(mp.bid.count).not.toHaveBeenCalled();
  });

  it('leaves stored achievement untouched when the period is unreadable', async () => {
    // Recomputing against a guessed window, or writing zeroes, would put a
    // number on screen that nothing in the record supports.
    mp.marketingTarget.findUnique.mockResolvedValue(corruptTarget('2026', 'QUARTERLY'));

    const res = await marketingService.refreshTarget('t1');

    expect(mp.marketingTarget.update).not.toHaveBeenCalled();
    expect(res.achievedValue).toBe(250);
  });

  it('still computes a window for every valid period shape', async () => {
    for (const [period, periodType, gte, lt] of [
      ['2026-08', 'MONTHLY',   new Date(2026, 7, 1),  new Date(2026, 8, 1)],
      ['2026-Q4', 'QUARTERLY', new Date(2026, 9, 1),  new Date(2027, 0, 1)],
      ['2026',    'ANNUAL',    new Date(2026, 0, 1),  new Date(2027, 0, 1)],
    ] as [string, string, Date, Date][]) {
      vi.clearAllMocks();
      mp.marketingTarget.findUnique.mockResolvedValue(corruptTarget(period, periodType));
      mp.prospectiveClient.findMany.mockResolvedValue([]);
      mp.bid.count.mockResolvedValue(0);
      mp.marketingTarget.update.mockResolvedValue(corruptTarget(period, periodType));

      await marketingService.refreshTarget('t1');

      const w = mp.prospectiveClient.findMany.mock.calls[0][0].where;
      expect(w.wonDate).toEqual({ gte, lt });
    }
  });

  it('reports 0% rather than dividing by zero', async () => {
    mp.marketingTarget.findUnique.mockResolvedValue({
      id: 't1', assignedToId: OFFICER, period: '2026-08', periodType: 'MONTHLY',
      targetLabel: 'x', targetValue: 0, targetClients: null, targetBids: null,
      achievedValue: 0, achievedClients: 0, achievedBids: 0, notes: null,
      assignedToUser: { id: OFFICER, name: 'S' }, createdAt: new Date(), updatedAt: new Date(),
    });
    mp.prospectiveClient.findMany.mockResolvedValue([]);
    mp.bid.count.mockResolvedValue(0);
    mp.marketingTarget.update.mockResolvedValue({
      id: 't1', assignedToId: OFFICER, period: '2026-08', periodType: 'MONTHLY',
      targetLabel: 'x', targetValue: 0, targetClients: null, targetBids: null,
      achievedValue: 0, achievedClients: 0, achievedBids: 0, notes: null,
      assignedToUser: { id: OFFICER, name: 'S' }, createdAt: new Date(), updatedAt: new Date(),
    });

    expect((await marketingService.refreshTarget('t1')).progressPct).toBe(0);
  });
});

// ── Lost reason ────────────────────────────────────────────────────────────────

describe('createProspect() lost reason', () => {
  it('persists the reason when a lead is created straight into LOST', async () => {
    mp.$transaction.mockImplementation(async (fn: any) => fn(mp));
    mp.prospectiveClient.create.mockResolvedValue(prospectRow({ status: 'LOST' }));
    mp.prospectStatusHistory.create.mockResolvedValue({});

    await marketingService.createProspect(
      { companyName: 'Dead Deal Ltd', status: 'LOST', lostReason: 'Budget cut' } as any,
      OFFICER,
    );

    // The schema demands a reason for a LOST prospect; dropping it here saved a
    // record the board could never explain.
    expect(mp.prospectiveClient.create.mock.calls[0][0].data)
      .toMatchObject({ lostReason: 'Budget cut' });
  });

  it('leaves lostReason unset for a live lead', async () => {
    mp.$transaction.mockImplementation(async (fn: any) => fn(mp));
    mp.prospectiveClient.create.mockResolvedValue(prospectRow());
    mp.prospectStatusHistory.create.mockResolvedValue({});

    await marketingService.createProspect(
      { companyName: 'Live Deal Ltd', status: 'NEW' } as any,
      OFFICER,
    );

    expect(mp.prospectiveClient.create.mock.calls[0][0].data.lostReason).toBeUndefined();
  });
});

// ── Lead visibility ────────────────────────────────────────────────────────────

/**
 * A Marketing Officer sees only the leads assigned to them; a Director or
 * Assistant Manager sees the whole pipeline. These pin the `where` the service
 * builds, because the rule is only worth as much as the query that enforces it
 * — a filter dropped here leaks every officer's pipeline to every other one.
 */
describe('lead visibility', () => {
  const MANAGER = 'user-director';

  beforeEach(() => {
    mp.prospectiveClient.findMany.mockResolvedValue([]);
    mp.prospectiveClient.count.mockResolvedValue(0);
  });

  const whereFromList = () => mp.prospectiveClient.findMany.mock.calls[0][0].where;

  it('pins an officer to their own leads', async () => {
    await marketingService.listProspects({
      page: 1, limit: 50, viewerRole: 'MARKETING', viewerUserId: OFFICER,
    });
    expect(whereFromList()).toMatchObject({ assignedToId: OFFICER });
  });

  it('ignores an assignedToId an officer supplies for someone else', async () => {
    await marketingService.listProspects({
      page: 1, limit: 50, assignedToId: 'someone-else',
      viewerRole: 'MARKETING', viewerUserId: OFFICER,
    });
    // The query string must not be able to widen the officer's own view.
    expect(whereFromList().assignedToId).toBe(OFFICER);
  });

  it('leaves a manager unfiltered', async () => {
    await marketingService.listProspects({
      page: 1, limit: 50, viewerRole: 'DIRECTOR', viewerUserId: MANAGER,
    });
    expect(whereFromList().assignedToId).toBeUndefined();
  });

  it('lets a manager narrow to one officer', async () => {
    await marketingService.listProspects({
      page: 1, limit: 50, assignedToId: OFFICER,
      viewerRole: 'ASSISTANT_MANAGER', viewerUserId: MANAGER,
    });
    expect(whereFromList()).toMatchObject({ assignedToId: OFFICER });
  });

  it('keeps the status filter alongside the officer scope', async () => {
    await marketingService.listProspects({
      page: 1, limit: 50, status: 'LOST',
      viewerRole: 'MARKETING', viewerUserId: OFFICER,
    });
    expect(whereFromList()).toMatchObject({ assignedToId: OFFICER, status: 'LOST' });
  });

  it('hides another officer\'s lead behind the same 404 as a missing one', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(
      prospectRow({ assignedToId: 'another-officer', statusHistory: [] }),
    );
    await expect(
      marketingService.getProspect('p1', { role: 'MARKETING', userId: OFFICER }),
    ).rejects.toThrow('Prospect not found');
  });

  it('opens any lead for a manager', async () => {
    mp.prospectiveClient.findUnique.mockResolvedValue(
      prospectRow({ assignedToId: 'another-officer', statusHistory: [] }),
    );
    const p = await marketingService.getProspect('p1', { role: 'DIRECTOR', userId: MANAGER });
    expect(p.companyName).toBe('Nakumatt Uganda Ltd');
  });

  it('scopes the officer dashboard to their own pipeline', async () => {
    mp.prospectiveClient.groupBy.mockResolvedValue([]);
    mp.bid.count.mockResolvedValue(0);
    mp.contract.count.mockResolvedValue(0);
    mp.marketingTarget.findFirst.mockResolvedValue(null);
    mp.prospectStatusHistory.findMany.mockResolvedValue([]);

    await marketingService.getDashboard(OFFICER, 'MARKETING');

    expect(mp.prospectiveClient.groupBy.mock.calls[0][0].where)
      .toMatchObject({ assignedToId: OFFICER });
    // The activity feed names companies, so it is scoped through the parent.
    expect(mp.prospectStatusHistory.findMany.mock.calls[0][0].where)
      .toMatchObject({ prospect: { assignedToId: OFFICER } });
  });
});

// ── Dashboard ──────────────────────────────────────────────────────────────────

describe('getDashboard()', () => {
  it('counts only open stages as pipeline, and derives the conversion rate', async () => {
    mp.prospectiveClient.groupBy.mockResolvedValue([
      { status: 'NEW',           _count: { id: 4 } },
      { status: 'CONTACTED',     _count: { id: 3 } },
      { status: 'NEGOTIATION',   _count: { id: 2 } },
      { status: 'WON',           _count: { id: 3 } },
      { status: 'LOST',          _count: { id: 1 } },
    ]);
    mp.bid.count.mockResolvedValue(2);
    mp.contract.count.mockResolvedValue(5);
    mp.marketingTarget.findFirst.mockResolvedValue(null);
    mp.prospectStatusHistory.findMany.mockResolvedValue([]);

    const d = await marketingService.getDashboard(OFFICER);

    expect(d.stats.totalProspects).toBe(13);
    // NEW is not yet in play; WON and LOST are already out of it.
    expect(d.stats.inPipeline).toBe(5);
    expect(d.stats.won).toBe(3);
    expect(d.stats.conversionRate).toBe(75);
    expect(d.stats.activeBids).toBe(2);
    expect(d.stats.upcomingExpiries).toBe(5);
    expect(d.prospectsByStatus).toHaveLength(PIPELINE_ORDER.length);
  });

  it('reports a zero conversion rate before anything is decided', async () => {
    mp.prospectiveClient.groupBy.mockResolvedValue([{ status: 'NEW', _count: { id: 2 } }]);
    mp.bid.count.mockResolvedValue(0);
    mp.contract.count.mockResolvedValue(0);
    mp.marketingTarget.findFirst.mockResolvedValue(null);
    mp.prospectStatusHistory.findMany.mockResolvedValue([]);

    expect((await marketingService.getDashboard(OFFICER)).stats.conversionRate).toBe(0);
  });
});

// ── Reports ────────────────────────────────────────────────────────────────────

describe('generateReport()', () => {
  it('returns one pipeline row per stage, including empty ones', async () => {
    mp.prospectiveClient.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { id: 2 }, _sum: { estimatedValue: 3_000_000 } },
    ]);

    const report = await marketingService.generateReport('PIPELINE', {});

    expect(report.rows).toHaveLength(PIPELINE_ORDER.length);
    expect(report.rows[0][1]).toBe(2);
    expect(report.rows[1][1]).toBe(0);
  });

  it('computes a bid win rate over decided bids only', async () => {
    mp.bid.findMany.mockResolvedValue([
      { organization: 'A', bidType: 'TENDER', amount: 1, submissionDate: null, closingDate: null, status: 'WON',       assignedToUser: null },
      { organization: 'B', bidType: 'RFP',    amount: 2, submissionDate: null, closingDate: null, status: 'LOST',      assignedToUser: null },
      { organization: 'C', bidType: 'RFQ',    amount: 3, submissionDate: null, closingDate: null, status: 'SUBMITTED', assignedToUser: null },
    ]);

    const report = await marketingService.generateReport('BIDS', {});

    // 1 won of 2 decided; the still-open bid is excluded.
    expect(report.summary.find(s => s.label === 'Win rate')?.value).toBe('50%');
  });
});

// ── Schemas ────────────────────────────────────────────────────────────────────

describe('marketing schemas', () => {
  it('requires a lost reason before a prospect can be marked lost', () => {
    expect(UpdateProspectSchema.safeParse({ status: 'LOST' }).success).toBe(false);
    expect(UpdateProspectSchema.safeParse({ status: 'LOST', lostReason: 'Price too high' }).success).toBe(true);
  });

  it('defaults a new prospect to NEW', () => {
    expect(CreateProspectSchema.parse({ companyName: 'Acme Ltd' }).status).toBe('NEW');
  });

  it('rejects a closing date before the submission date', () => {
    const r = CreateBidSchema.safeParse({
      organization: 'Ministry', bidType: 'TENDER',
      submissionDate: '2026-09-01T00:00:00.000Z',
      closingDate:    '2026-08-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});
