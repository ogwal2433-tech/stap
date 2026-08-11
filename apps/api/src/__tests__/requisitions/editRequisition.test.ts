import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canEditRequisition } from '@stap/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    requisition:             { findUnique: vi.fn(), update: vi.fn() },
    requisitionCategoryItem: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit:  vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { requisitionService } from '../../services/requisitionService';

const mp = prisma as any;

const PENDING_REQ = {
  id:                 'req-1',
  requestedById:      'user-1',
  status:             'PENDING',
  hrApprovedAt:       null,
  particulars:        'Original particulars',
  amount:             500_000,
  category:           'Stationery',
};

const updatedRow = (over: Record<string, any> = {}) => ({
  ...PENDING_REQ,
  date:                   new Date('2026-08-11'),
  requestedByUser:        { name: 'Joshua' },
  hrApprovedByUser:       null,
  directorApprovedByUser: null,
  assignedToUser:         null,
  assignedToId:           null,
  directorApprovedAt:     null,
  progress:               null,
  remarks:                null,
  accountDetails:         null,
  accountName:            null,
  bankName:               null,
  rejectedBy:             null,
  rejectedAt:             null,
  rejectionReason:        null,
  categoryItems:          [],
  purchaseOrders:         [],
  totalDispatched:        0,
  dispatchStatus:         'PENDING',
  createdAt:              new Date(),
  updatedAt:              new Date(),
  ...over,
});

/** The transaction body runs against a client with the same shape. */
const tx = {
  requisition:             { update: vi.fn() },
  requisitionCategoryItem: { deleteMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.requisition.findUnique.mockResolvedValue(PENDING_REQ);
  tx.requisition.update.mockResolvedValue(updatedRow());
  tx.requisitionCategoryItem.deleteMany.mockResolvedValue({ count: 0 });
  mp.$transaction.mockImplementation((fn: any) => fn(tx));
});

// ── The lock rule itself ───────────────────────────────────────────────────────

describe('canEditRequisition()', () => {
  it('allows editing while the requisition is awaiting HR', () => {
    expect(canEditRequisition('PENDING', null)).toBe(true);
    expect(canEditRequisition('SUBMITTED', null)).toBe(true);
  });

  it('locks once HR has approved, even though the status is still PENDING', () => {
    // hrApprove() records hrApprovedAt and deliberately leaves status alone, so
    // a status-only check would wrongly report this as editable.
    expect(canEditRequisition('PENDING', new Date('2026-08-01'))).toBe(false);
  });

  it('locks every status past HR', () => {
    for (const s of ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'REJECTED', 'CANCELLED']) {
      expect(canEditRequisition(s, null)).toBe(false);
    }
  });
});

// ── Service ────────────────────────────────────────────────────────────────────

describe('requisitionService.update()', () => {
  it('updates the editable fields', async () => {
    await requisitionService.update(
      'req-1',
      { particulars: 'Updated particulars', amount: 750_000, bankName: 'Centenary Bank' },
      'user-1',
      'TRAINER',
    );

    const data = tx.requisition.update.mock.calls[0][0].data;
    expect(data.particulars).toBe('Updated particulars');
    expect(data.amount).toBe(750_000);
    expect(data.bankName).toBe('Centenary Bank');
  });

  it('leaves fields that were not supplied untouched', async () => {
    await requisitionService.update('req-1', { amount: 750_000 }, 'user-1', 'TRAINER');

    const data = tx.requisition.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('particulars');
    expect(data).not.toHaveProperty('bankName');
    expect(data).not.toHaveProperty('remarks');
  });

  it('blanks an optional field when it is explicitly sent as null', async () => {
    await requisitionService.update('req-1', { remarks: null }, 'user-1', 'TRAINER');

    expect(tx.requisition.update.mock.calls[0][0].data.remarks).toBeNull();
  });

  it('never changes the status', async () => {
    await requisitionService.update('req-1', { amount: 1 }, 'user-1', 'TRAINER');

    expect(tx.requisition.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('replaces category items wholesale', async () => {
    await requisitionService.update(
      'req-1',
      { categoryItems: [{ category: 'Fuel', quantity: 3, unit: 'litres' }] },
      'user-1',
      'TRAINER',
    );

    expect(tx.requisitionCategoryItem.deleteMany).toHaveBeenCalledWith({
      where: { requisitionId: 'req-1' },
    });
    expect(tx.requisition.update.mock.calls[0][0].data.categoryItems.create).toEqual([
      { category: 'Fuel', quantity: 3, unit: 'litres' },
    ]);
  });

  it('leaves existing category items alone when none are sent', async () => {
    await requisitionService.update('req-1', { amount: 1 }, 'user-1', 'TRAINER');

    expect(tx.requisitionCategoryItem.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses once HR has approved, despite the status still being PENDING', async () => {
    mp.requisition.findUnique.mockResolvedValue({
      ...PENDING_REQ, hrApprovedAt: new Date('2026-08-01'),
    });

    await expect(
      requisitionService.update('req-1', { amount: 999_999 }, 'user-1', 'TRAINER'),
    ).rejects.toThrow(/HR has already approved it/);

    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('refuses on an approved requisition', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...PENDING_REQ, status: 'APPROVED' });

    await expect(
      requisitionService.update('req-1', { amount: 999_999 }, 'user-1', 'TRAINER'),
    ).rejects.toThrow(/cannot be edited/);
  });

  it('refuses when someone else tries to edit it', async () => {
    await expect(
      requisitionService.update('req-1', { amount: 111_111 }, 'other-user', 'TRAINER'),
    ).rejects.toThrow('You can only edit your own requisitions.');
  });

  it('lets a Director edit somebody else’s requisition', async () => {
    await requisitionService.update('req-1', { amount: 111_111 }, 'dir-1', 'DIRECTOR');

    expect(tx.requisition.update).toHaveBeenCalled();
  });

  it('throws when the requisition does not exist', async () => {
    mp.requisition.findUnique.mockResolvedValue(null);

    await expect(
      requisitionService.update('nope', { amount: 1 }, 'user-1', 'TRAINER'),
    ).rejects.toThrow('Requisition not found');
  });

  it('records an audit entry with the before and after figures', async () => {
    tx.requisition.update.mockResolvedValue(
      updatedRow({ particulars: 'Updated particulars', amount: 750_000 }),
    );

    await requisitionService.update(
      'req-1', { particulars: 'Updated particulars', amount: 750_000 }, 'user-1', 'TRAINER',
    );

    const audit = (QueueService.logAudit as any).mock.calls[0][0];
    expect(audit.action).toBe('REQUISITION_EDITED');
    expect(audit.oldValue).toEqual({ particulars: 'Original particulars', amount: 500_000 });
    expect(audit.newValue).toMatchObject({ particulars: 'Updated particulars', amount: 750_000 });
  });
});
