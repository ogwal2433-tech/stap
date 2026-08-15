import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    requisition:               { findUnique: vi.fn() },
    requisitionAccountability: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    accountabilityItem:        { deleteMany: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    $transaction:              vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRoles: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { accountabilityService } from '../../services/accountabilityService';
import { AppError, NotFoundError } from '../../errors/AppError';

const mp     = prisma as any;
const mNotif = notificationService as any;

const APPROVED_REQ = {
  id:          'req-1',
  amount:      1_000_000,
  particulars: 'Office supplies for Q3',
  status:      'APPROVED',
};

const SUBMITTED_ITEMS = [
  { requisitionItem: 'Printer Paper', category: 'Stationery', quantity: 5,  rate: 25_000 },
  { requisitionItem: 'Fuel',          category: 'Fuel',       quantity: 40, rate: 5_500  },
];

/** A saved accountability as Prisma returns it, with the FULL_INCLUDE shape. */
const accRow = (over: Record<string, any> = {}) => ({
  id:                  'acc-1',
  requisitionId:       'req-1',
  status:              'SUBMITTED',
  totalAdminAmount:    0,
  totalHRAmount:       0,
  totalDirectorAmount: 0,
  originalAmount:      1_000_000,
  variance:            0,
  submittedBy:         { id: 'user-1', name: 'Joshua' },
  submittedAt:         new Date('2026-08-11T00:00:00.000Z'),
  adminReviewedBy:     null, adminReviewedAt:    null, adminNotes:    null,
  hrReviewedBy:        null, hrReviewedAt:       null, hrNotes:       null,
  directorApprovedBy:  null, directorApprovedAt: null, directorNotes: null,
  items: [
    { id: 'item-1', itemNumber: 1, requisitionItem: 'Printer Paper', category: 'Stationery',
      quantity: 5, rate: 25_000, totalCost: 125_000, adminAmount: null, hrAmount: null, directorAmount: null, notes: null },
    { id: 'item-2', itemNumber: 2, requisitionItem: 'Fuel', category: 'Fuel',
      quantity: 40, rate: 5_500, totalCost: 220_000, adminAmount: null, hrAmount: null, directorAmount: null, notes: null },
  ],
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.requisition.findUnique.mockResolvedValue(APPROVED_REQ);
  mp.requisitionAccountability.findUnique.mockResolvedValue(null);
  mp.accountabilityItem.aggregate.mockResolvedValue({
    _sum: { adminAmount: 0, hrAmount: 0, directorAmount: 0 },
  });
  // The service does its writes inside a transaction; run the callback against
  // the same mocked client so the assertions see the calls.
  mp.$transaction.mockImplementation(async (fn: any) => fn(mp));
  mp.requisitionAccountability.create.mockResolvedValue(accRow());
  mp.requisitionAccountability.update.mockResolvedValue(accRow());
  mp.accountabilityItem.deleteMany.mockResolvedValue({ count: 0 });
  mp.accountabilityItem.update.mockResolvedValue({});
});

// ── submit() ───────────────────────────────────────────────────────────────────

describe('accountabilityService.submit()', () => {
  it('stores each line with totalCost derived from quantity × rate', async () => {
    await accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1');

    const rows = mp.requisitionAccountability.create.mock.calls[0][0].data.items.create;
    expect(rows).toEqual([
      expect.objectContaining({ itemNumber: 1, requisitionItem: 'Printer Paper', totalCost: 125_000 }),
      expect.objectContaining({ itemNumber: 2, requisitionItem: 'Fuel',          totalCost: 220_000 }),
    ]);
  });

  it('snapshots the requisition amount so later edits cannot skew the variance', async () => {
    await accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1');

    expect(mp.requisitionAccountability.create.mock.calls[0][0].data.originalAmount).toBe(1_000_000);
  });

  it('numbers the lines itself rather than trusting the caller', async () => {
    await accountabilityService.submit(
      'req-1',
      [{ ...SUBMITTED_ITEMS[0], itemNumber: 99 }, SUBMITTED_ITEMS[1]] as any,
      'user-1',
    );

    const rows = mp.requisitionAccountability.create.mock.calls[0][0].data.items.create;
    expect(rows.map((r: any) => r.itemNumber)).toEqual([1, 2]);
  });

  it('refuses a requisition whose funds have not been released', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...APPROVED_REQ, status: 'PENDING' });

    await expect(accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1'))
      .rejects.toThrow(AppError);
  });

  it('accepts a requisition already assigned or in progress', async () => {
    for (const status of ['ASSIGNED', 'IN_PROGRESS']) {
      mp.requisition.findUnique.mockResolvedValue({ ...APPROVED_REQ, status });
      await expect(accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1'))
        .resolves.toBeTruthy();
    }
  });

  it('throws NotFoundError for an unknown requisition', async () => {
    mp.requisition.findUnique.mockResolvedValue(null);

    await expect(accountabilityService.submit('nope', SUBMITTED_ITEMS as any, 'user-1'))
      .rejects.toThrow(NotFoundError);
  });

  it('re-submitting clears every prior reviewer figure', async () => {
    // Reviewer amounts were entered against the old breakdown — carrying them
    // onto a new one would attribute figures nobody approved.
    mp.requisitionAccountability.findUnique.mockResolvedValue({ id: 'acc-1', status: 'HR_REVIEWED' });

    await accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1');

    expect(mp.accountabilityItem.deleteMany).toHaveBeenCalledWith({ where: { accountabilityId: 'acc-1' } });
    expect(mp.requisitionAccountability.update.mock.calls[0][0].data).toMatchObject({
      status:               'SUBMITTED',
      totalAdminAmount:     0,
      totalHRAmount:        0,
      totalDirectorAmount:  0,
      variance:             0,
      adminReviewedById:    null,
      hrReviewedById:       null,
      directorApprovedById: null,
    });
  });

  it('will not reopen an accountability the Director has closed', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue({ id: 'acc-1', status: 'DIRECTOR_APPROVED' });

    await expect(accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1'))
      .rejects.toThrow(/Director/i);
  });

  it('asks Admin and the Assistant Manager to review', async () => {
    await accountabilityService.submit('req-1', SUBMITTED_ITEMS as any, 'user-1');

    expect(mNotif.sendToRoles).toHaveBeenCalledWith(
      expect.arrayContaining(['ADMINISTRATOR', 'ASSISTANT_MANAGER']),
      expect.objectContaining({ entityId: 'req-1' }),
    );
  });
});

// ── Review chain ───────────────────────────────────────────────────────────────

describe('accountabilityService review stages', () => {
  const review = { items: [{ id: 'item-1', amount: 120_000 }, { id: 'item-2', amount: 215_000 }] };

  beforeEach(() => {
    mp.requisitionAccountability.findUnique.mockResolvedValue({
      id: 'acc-1', status: 'SUBMITTED', originalAmount: 1_000_000, variance: 0,
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    });
  });

  it('writes Admin figures to the admin column only', async () => {
    await accountabilityService.adminReview('req-1', review as any, 'user-2');

    const written = mp.accountabilityItem.update.mock.calls.map((c: any) => c[0]);
    expect(written[0].data).toHaveProperty('adminAmount', 120_000);
    expect(written[0].data).not.toHaveProperty('hrAmount');
    expect(written[0].data).not.toHaveProperty('directorAmount');
  });

  it('totals from the database, not from the request body', async () => {
    // A caller sending only some lines must not be able to shrink the total.
    mp.accountabilityItem.aggregate.mockResolvedValue({
      _sum: { adminAmount: 335_000, hrAmount: 0, directorAmount: 0 },
    });

    await accountabilityService.adminReview('req-1', review as any, 'user-2');

    expect(mp.requisitionAccountability.update.mock.calls[0][0].data.totalAdminAmount).toBe(335_000);
  });

  it('requires Admin review before HR', async () => {
    await expect(accountabilityService.hrReview('req-1', review as any, 'user-3'))
      .rejects.toThrow(/Admin review must be completed first/i);
  });

  it('requires HR review before the Director can close it', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue({
      id: 'acc-1', status: 'ADMIN_REVIEWED', originalAmount: 1_000_000, variance: 0,
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    });

    await expect(accountabilityService.directorApprove('req-1', review as any, 'user-4'))
      .rejects.toThrow(/HR review must be completed first/i);
  });

  it('rejects lines belonging to a different accountability', async () => {
    await expect(
      accountabilityService.adminReview(
        'req-1',
        { items: [{ id: 'item-1', amount: 1 }, { id: 'somebody-elses', amount: 1 }] } as any,
        'user-2',
      ),
    ).rejects.toThrow(/do not belong/i);
  });

  it('rejects a partial submission that misses a line', async () => {
    await expect(
      accountabilityService.adminReview('req-1', { items: [{ id: 'item-1', amount: 1 }] } as any, 'user-2'),
    ).rejects.toThrow(/every line/i);
  });

  it('throws NotFoundError when nothing has been submitted yet', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue(null);

    await expect(accountabilityService.adminReview('req-1', review as any, 'user-2'))
      .rejects.toThrow(NotFoundError);
  });

  it('will not accept further review once the Director has approved', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue({
      id: 'acc-1', status: 'DIRECTOR_APPROVED', originalAmount: 1_000_000, variance: 0,
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    });

    await expect(accountabilityService.adminReview('req-1', review as any, 'user-2'))
      .rejects.toThrow(/already approved/i);
  });
});

// ── Variance ───────────────────────────────────────────────────────────────────

describe('accountabilityService variance', () => {
  const atHrReviewed = {
    id: 'acc-1', status: 'HR_REVIEWED', originalAmount: 1_000_000, variance: 0,
    items: [{ id: 'item-1' }, { id: 'item-2' }],
  };
  const review = { items: [{ id: 'item-1', amount: 1 }, { id: 'item-2', amount: 1 }] };

  const directorTotalOf = async (total: number) => {
    mp.requisitionAccountability.findUnique.mockResolvedValue(atHrReviewed);
    mp.accountabilityItem.aggregate.mockResolvedValue({
      _sum: { adminAmount: 0, hrAmount: 0, directorAmount: total },
    });
    await accountabilityService.directorApprove('req-1', review as any, 'user-4');
    return mp.requisitionAccountability.update.mock.calls[0][0].data.variance;
  };

  it('is negative when less was spent than requisitioned (surplus)', async () => {
    expect(await directorTotalOf(900_000)).toBe(-100_000);
  });

  it('is positive when more was spent than requisitioned (overspend)', async () => {
    expect(await directorTotalOf(1_150_000)).toBe(150_000);
  });

  it('is zero when the spend matches exactly', async () => {
    expect(await directorTotalOf(1_000_000)).toBe(0);
  });

  it('stays untouched at the earlier stages, where it means nothing yet', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue({
      id: 'acc-1', status: 'SUBMITTED', originalAmount: 1_000_000, variance: 0,
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    });
    mp.accountabilityItem.aggregate.mockResolvedValue({
      _sum: { adminAmount: 500_000, hrAmount: 0, directorAmount: 0 },
    });

    await accountabilityService.adminReview('req-1', review as any, 'user-2');

    expect(mp.requisitionAccountability.update.mock.calls[0][0].data.variance).toBe(0);
  });
});

// ── getByRequisition() ─────────────────────────────────────────────────────────

describe('accountabilityService.getByRequisition()', () => {
  it('returns null when none has been submitted', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue(null);

    expect(await accountabilityService.getByRequisition('req-1')).toBeNull();
  });

  it('exposes the three reviewer columns and the submitted total per line', async () => {
    mp.requisitionAccountability.findUnique.mockResolvedValue(
      accRow({
        status: 'DIRECTOR_APPROVED',
        totalAdminAmount: 335_000, totalHRAmount: 330_000, totalDirectorAmount: 320_000,
        variance: -680_000,
      }),
    );

    const res = await accountabilityService.getByRequisition('req-1');

    expect(res).toMatchObject({
      status:              'DIRECTOR_APPROVED',
      totalAdminAmount:    335_000,
      totalHRAmount:       330_000,
      totalDirectorAmount: 320_000,
      originalAmount:      1_000_000,
      variance:            -680_000,
      // 125,000 + 220,000 — what was actually claimed, before any reviewer edits.
      totalSubmitted:      345_000,
    });
    expect(res!.items).toHaveLength(2);
  });
});
