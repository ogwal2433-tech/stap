import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    requisition:  { findUnique: vi.fn(), update: vi.fn() },
    fundDispatch: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { notificationService } from '../../services/notificationService';
import { fundDispatchService } from '../../services/fundDispatchService';

const mp = prisma as any;

const APPROVED_REQ = {
  id:           'req-1',
  amount:       1_000_000,
  status:       'APPROVED',
  assignedToId: 'user-9',
  particulars:  'Office supplies',
};

const dispatchRow = (over: Record<string, any> = {}) => ({
  id:               'disp-1',
  requisitionId:    'req-1',
  channel:          'E_TRANSACT',
  amount:           250_000,
  reference:        'ETX-2026-001234',
  recipientName:    'John Mukasa',
  recipientAccount: null,
  dispatchDate:     new Date('2026-08-11T00:00:00.000Z'),
  notes:            null,
  dispatchedById:   'user-1',
  dispatchedByUser: { id: 'user-1', name: 'Joshua' },
  createdAt:        new Date('2026-08-11T00:00:00.000Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.requisition.findUnique.mockResolvedValue(APPROVED_REQ);
  mp.fundDispatch.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  // The service runs the create + counter update as one transaction; the array
  // it returns mirrors the operations in order.
  mp.$transaction.mockImplementation(async () => [dispatchRow(), {}]);
});

describe('fundDispatchService.recordDispatch', () => {
  it('records a dispatch and marks the requisition PARTIAL', async () => {
    const result = await fundDispatchService.recordDispatch(
      'req-1',
      { channel: 'E_TRANSACT', amount: 250_000, reference: 'ETX-2026-001234' } as any,
      'user-1',
    );

    expect(result.channel).toBe('E_TRANSACT');
    expect(result.amount).toBe(250_000);
    expect(result.reference).toBe('ETX-2026-001234');
    expect(result.dispatchedBy).toEqual({ id: 'user-1', name: 'Joshua' });

    const update = mp.requisition.update.mock.calls[0][0];
    expect(update.data).toEqual({ totalDispatched: 250_000, dispatchStatus: 'PARTIAL' });
  });

  it('marks the requisition FULLY_DISPATCHED once the approved amount is covered', async () => {
    mp.fundDispatch.aggregate.mockResolvedValue({ _sum: { amount: 750_000 } });
    mp.$transaction.mockImplementation(async () => [dispatchRow({ amount: 250_000, channel: 'CASH' }), {}]);

    await fundDispatchService.recordDispatch(
      'req-1', { channel: 'CASH', amount: 250_000 } as any, 'user-1',
    );

    const update = mp.requisition.update.mock.calls[0][0];
    expect(update.data).toEqual({ totalDispatched: 1_000_000, dispatchStatus: 'FULLY_DISPATCHED' });
  });

  it('leaves the requisition status alone so assignment and progress survive', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...APPROVED_REQ, status: 'IN_PROGRESS' });
    mp.fundDispatch.aggregate.mockResolvedValue({ _sum: { amount: 900_000 } });
    mp.$transaction.mockImplementation(async () => [dispatchRow({ amount: 100_000 }), {}]);

    await fundDispatchService.recordDispatch(
      'req-1', { channel: 'CASH', amount: 100_000 } as any, 'user-1',
    );

    expect(mp.requisition.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('refuses to dispatch more than the remaining approved amount', async () => {
    mp.fundDispatch.aggregate.mockResolvedValue({ _sum: { amount: 800_000 } });

    await expect(
      fundDispatchService.recordDispatch('req-1', { channel: 'CASH', amount: 500_000 } as any, 'user-1'),
    ).rejects.toThrow(/exceeds the remaining approved amount of UGX 200,000/);

    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('refuses once the full amount is already out', async () => {
    mp.fundDispatch.aggregate.mockResolvedValue({ _sum: { amount: 1_000_000 } });

    await expect(
      fundDispatchService.recordDispatch('req-1', { channel: 'CASH', amount: 1 } as any, 'user-1'),
    ).rejects.toThrow(/already been dispatched/);
  });

  it('refuses to dispatch against a requisition that is not approved', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...APPROVED_REQ, status: 'PENDING' });

    await expect(
      fundDispatchService.recordDispatch('req-1', { channel: 'CASH', amount: 1000 } as any, 'user-1'),
    ).rejects.toThrow(/only be dispatched for approved requisitions/);
  });

  it('throws when the requisition does not exist', async () => {
    mp.requisition.findUnique.mockResolvedValue(null);

    await expect(
      fundDispatchService.recordDispatch('nope', { channel: 'CASH', amount: 1000 } as any, 'user-1'),
    ).rejects.toThrow('Requisition not found');
  });

  it('notifies the assignee and writes an audit entry', async () => {
    await fundDispatchService.recordDispatch(
      'req-1',
      { channel: 'E_TRANSACT', amount: 250_000, reference: 'ETX-2026-001234' } as any,
      'user-1',
    );

    const notice = (notificationService.send as any).mock.calls[0][0];
    expect(notice.userId).toBe('user-9');
    expect(notice.message).toContain('UGX 250,000');
    expect(notice.message).toContain('💳 E-Transact');
    expect(notice.message).toContain('ETX-2026-001234');

    const audit = (QueueService.logAudit as any).mock.calls[0][0];
    expect(audit.action).toBe('FUND_DISPATCHED');
    expect(audit.newValue).toMatchObject({ dispatchStatus: 'PARTIAL', totalDispatched: 250_000 });
  });

  it('skips the notification when nobody is assigned', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...APPROVED_REQ, assignedToId: null });

    await fundDispatchService.recordDispatch(
      'req-1', { channel: 'CASH', amount: 1000 } as any, 'user-1',
    );

    expect(notificationService.send).not.toHaveBeenCalled();
  });
});

describe('fundDispatchService.getDispatches', () => {
  it('returns the history newest first', async () => {
    mp.fundDispatch.findMany.mockResolvedValue([
      dispatchRow({ id: 'disp-2', amount: 100_000, channel: 'CASH', reference: null }),
      dispatchRow(),
    ]);

    const list = await fundDispatchService.getDispatches('req-1');

    expect(list).toHaveLength(2);
    expect(list[0].reference).toBeNull();
    expect(mp.fundDispatch.findMany.mock.calls[0][0].orderBy).toEqual({ dispatchDate: 'desc' });
  });
});
