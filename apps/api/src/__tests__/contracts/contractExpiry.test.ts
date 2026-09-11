import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    client:   { findUnique: vi.fn() },
    contract: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { contractService } from '../../services/contractService';

const db = prisma as unknown as {
  contract: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

const days = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

/** Enough of a contract row for formatContract() to render one. */
const row = (overrides: Record<string, unknown> = {}) => ({
  id:                'ct1',
  client:            { id: 'c1', clientName: 'Acme Holdings' },
  contractStart:     days(-400),
  contractEnd:       days(-10),
  guardsRequired:    4,
  totalMonthlyValue: 1_000_000,
  status:            'EXPIRED',
  weaponsAllocation: null,
  shiftPattern:      null,
  guardRates:        [],
  amendmentCount:    0,
  billingNote:       null,
  createdAt:         days(-400),
  updatedAt:         days(-10),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.contract.findMany.mockResolvedValue([]);
});

describe('getExpiringContracts()', () => {
  it('bounds the window at both ends', async () => {
    await contractService.getExpiringContracts(30);

    const { where } = db.contract.findMany.mock.calls[0]![0];
    // The lower bound is the point. Without it the query reads "ends before 30
    // days from now", which every lapsed contract also satisfies — they stayed
    // out only while the nightly cron had already flipped them to EXPIRED.
    expect(where.contractEnd.gte).toBeInstanceOf(Date);
    expect(where.contractEnd.lte).toBeInstanceOf(Date);
    expect(where.contractEnd.gte.getTime()).toBeLessThan(where.contractEnd.lte.getTime());
    expect(where.status).toEqual({ in: ['ACTIVE', 'EXPIRING'] });
  });

  it('honours a custom threshold', async () => {
    await contractService.getExpiringContracts(7);
    const { where } = db.contract.findMany.mock.calls[0]![0];
    const spanDays =
      (where.contractEnd.lte.getTime() - where.contractEnd.gte.getTime()) / 86_400_000;
    expect(Math.round(spanDays)).toBe(7);
  });
});

describe('getExpiredContracts()', () => {
  it('matches on the date, not just the status', async () => {
    await contractService.getExpiredContracts();

    const { where, orderBy } = db.contract.findMany.mock.calls[0]![0];
    // Status is maintained by a nightly cron, so a contract that lapsed since
    // the last run is still ACTIVE. Reading the status alone would hide it.
    expect(where.contractEnd.lt).toBeInstanceOf(Date);
    expect(orderBy).toEqual({ contractEnd: 'desc' });
  });

  it('excludes drafts — never signed is not expired', async () => {
    await contractService.getExpiredContracts();
    const { where } = db.contract.findMany.mock.calls[0]![0];
    expect(where.status).toEqual({ not: 'DRAFT' });
  });

  it('finds a lapsed contract still marked ACTIVE by a stale cron', async () => {
    db.contract.findMany.mockResolvedValue([row({ status: 'ACTIVE', contractEnd: days(-3) })]);
    const [c] = await contractService.getExpiredContracts();
    expect(c!.status).toBe('ACTIVE');
    expect(c!.daysSinceExpiry).toBe(3);
  });

  it('applies a limit only when asked for one', async () => {
    await contractService.getExpiredContracts(5);
    expect(db.contract.findMany.mock.calls[0]![0].take).toBe(5);

    db.contract.findMany.mockClear();
    await contractService.getExpiredContracts();
    expect(db.contract.findMany.mock.calls[0]![0]).not.toHaveProperty('take');
  });
});

describe('daysSinceExpiry', () => {
  it('counts the days since a contract lapsed', async () => {
    db.contract.findMany.mockResolvedValue([row({ contractEnd: days(-45) })]);
    const [c] = await contractService.getExpiredContracts();
    expect(c!.daysSinceExpiry).toBe(45);
  });

  it('is null while the end date is still ahead', async () => {
    db.contract.findMany.mockResolvedValue([row({ contractEnd: days(10), status: 'ACTIVE' })]);
    const [c] = await contractService.getExpiringContracts();
    expect(c!.daysSinceExpiry).toBeNull();
    expect(c!.daysRemaining).toBeGreaterThan(0);
  });

  it('leaves daysRemaining floored at zero for an expired contract', async () => {
    // Callers test `daysRemaining <= 30` to mean "expiring soon". A negative
    // value there would sweep every expired contract into that count.
    db.contract.findMany.mockResolvedValue([row({ contractEnd: days(-45) })]);
    const [c] = await contractService.getExpiredContracts();
    expect(c!.daysRemaining).toBe(0);
  });
});

describe('getExpiryAlerts()', () => {
  it('returns both lists from one call', async () => {
    db.contract.findMany
      .mockResolvedValueOnce([row({ contractEnd: days(5),  status: 'EXPIRING' })])
      .mockResolvedValueOnce([row({ contractEnd: days(-5), status: 'EXPIRED'  })]);

    const alerts = await contractService.getExpiryAlerts(30, 10);

    expect(alerts.expiring).toHaveLength(1);
    expect(alerts.expired).toHaveLength(1);
    expect(alerts.expiring[0]!.daysSinceExpiry).toBeNull();
    expect(alerts.expired[0]!.daysSinceExpiry).toBe(5);
  });

  it('caps the expiring list to the limit', async () => {
    db.contract.findMany
      .mockResolvedValueOnce(Array.from({ length: 25 }, () => row({ contractEnd: days(5) })))
      .mockResolvedValueOnce([]);

    const alerts = await contractService.getExpiryAlerts(30, 10);
    expect(alerts.expiring).toHaveLength(10);
  });

  it('never puts the same contract in both lists', async () => {
    // The two windows meet at "now" and must not overlap: one is gte now, the
    // other lt now.
    await contractService.getExpiryAlerts(30, 10);
    const expiringWhere = db.contract.findMany.mock.calls[0]![0].where;
    const expiredWhere  = db.contract.findMany.mock.calls[1]![0].where;
    expect(expiringWhere.contractEnd.gte.getTime()).toBeGreaterThanOrEqual(
      expiredWhere.contractEnd.lt.getTime(),
    );
  });
});
