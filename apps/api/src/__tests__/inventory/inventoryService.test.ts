import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockTx = {
  inventoryTransaction: { create: vi.fn() },
  inventoryItem:        { update: vi.fn() },
  guardDeduction:       { create: vi.fn() },
};

vi.mock('../../db/prisma', () => ({
  default: {
    inventoryItem: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    inventoryTransaction: {
      create:    vi.fn(),
      count:     vi.fn(),
      aggregate: vi.fn(),
      findMany:  vi.fn(),
    },
    guardDeduction: {
      create: vi.fn(),
    },
    guard: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(mockTx)),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined), sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { inventoryService } from '../../services/inventoryService';
import { notificationService } from '../../services/notificationService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mp = prisma as any;

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id:               'item-1',
    itemCode:         'UNI-001',
    itemName:         'Guard Shirt',
    itemType:         'UNIFORM',
    unitCost:         30000,
    stockQuantity:    20,
    reorderThreshold: 5,
    description:      null,
    isActive:         true,
    issuedFree:       false,
    isShoeItem:       false,
    createdAt:        new Date('2026-01-01'),
    ...overrides,
  };
}

function makeTxn(overrides: Record<string, any> = {}) {
  return {
    id:            'txn-1',
    item:          { id: 'item-1', itemName: 'Guard Shirt', itemCode: 'UNI-001' },
    guard:         { id: 'guard-1', firstName: 'John', lastName: 'Doe' },
    action:        'ISSUED',
    quantity:      1,
    conditionNote: null,
    chargedAmount: null,
    reference:     null,
    recordedByUser: { id: 'user-1', name: 'Admin' },
    createdAt:     new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.inventoryTransaction.create.mockResolvedValue(makeTxn());
  mockTx.inventoryItem.update.mockResolvedValue({});
  mockTx.guardDeduction.create.mockResolvedValue({});
});

// ── issueItem ──────────────────────────────────────────────────────────────────

describe('inventoryService.issueItem', () => {
  it('throws NotFoundError when item does not exist', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(null);
    await expect(
      inventoryService.issueItem({ itemId: 'bad', guardId: 'guard-1', quantity: 1 }, 'user-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws 400 when insufficient stock', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ stockQuantity: 2 }));
    await expect(
      inventoryService.issueItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 5 }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('uses "Issued free of charge" note for issuedFree items when no conditionNote provided', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ issuedFree: true }));

    await inventoryService.issueItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 1 }, 'user-1');

    const created = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(created.data.conditionNote).toBe('Issued free of charge');
  });

  it('uses provided conditionNote even for issuedFree items', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ issuedFree: true }));

    await inventoryService.issueItem(
      { itemId: 'item-1', guardId: 'guard-1', quantity: 1, conditionNote: 'Custom note' },
      'user-1',
    );

    const created = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(created.data.conditionNote).toBe('Custom note');
  });

  it('decrements stock quantity by issued quantity', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ stockQuantity: 10 }));

    await inventoryService.issueItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 3 }, 'user-1');

    const updateCall = mockTx.inventoryItem.update.mock.calls[0][0];
    expect(updateCall.data.stockQuantity).toEqual({ decrement: 3 });
  });
});

// ── returnItem ─────────────────────────────────────────────────────────────────

describe('inventoryService.returnItem', () => {
  it('throws NotFoundError when item does not exist', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(null);
    await expect(
      inventoryService.returnItem({ itemId: 'bad', guardId: 'guard-1', quantity: 1, action: 'RETURNED' }, 'user-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws 400 when no outstanding items for guard', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem());
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 0 } })  // issued
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });  // returned

    await expect(
      inventoryService.returnItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'RETURNED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('throws 400 when returning more than outstanding', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem());
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 2 } })   // issued
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });   // returned

    await expect(
      inventoryService.returnItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 5, action: 'RETURNED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('increments stock on RETURNED action', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem());
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 2 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mp.guard.findUnique.mockResolvedValue({ id: 'guard-1', firstName: 'John', lastName: 'Doe' });

    await inventoryService.returnItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'RETURNED' }, 'user-1');

    const updateCall = mockTx.inventoryItem.update.mock.calls[0][0];
    expect(updateCall.data.stockQuantity).toEqual({ increment: 1 });
  });

  it('charges the amount the user entered, not the item cost, and creates the deduction', async () => {
    // unitCost is deliberately different from chargedAmount — the charge is a
    // management decision, not a calculation.
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ unitCost: 30000 }));
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 2 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mp.guard.findUnique.mockResolvedValue({ id: 'guard-1', firstName: 'John', lastName: 'Doe' });

    mockTx.inventoryTransaction.create.mockResolvedValue(makeTxn({ action: 'DAMAGED', chargedAmount: 12000 }));

    await inventoryService.returnItem(
      { itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'DAMAGED', conditionNote: 'Torn', chargedAmount: 12000 },
      'user-1',
    );

    const txnCreate = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(txnCreate.data.chargedAmount).toBe(12000);
    expect(mockTx.guardDeduction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'DAMAGE_LOSS', amount: 12000 }) }),
    );
  });

  it('records the loss without a deduction when the charge is waived', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ unitCost: 30000 }));
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 2 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mp.guard.findUnique.mockResolvedValue({ id: 'guard-1', firstName: 'John', lastName: 'Doe' });

    mockTx.inventoryTransaction.create.mockResolvedValue(makeTxn({ action: 'LOST', chargedAmount: 0 }));

    await inventoryService.returnItem(
      { itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'LOST', conditionNote: 'Waived', chargedAmount: 0 },
      'user-1',
    );

    const txnCreate = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(txnCreate.data.chargedAmount).toBe(0);
    expect(mockTx.guardDeduction.create).not.toHaveBeenCalled();
  });

  it('sends ASSISTANT_MANAGER notification for LOST action', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem({ unitCost: 30000 }));
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 1 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mp.guard.findUnique.mockResolvedValue({ id: 'guard-1', firstName: 'Jane', lastName: 'Smith' });

    mockTx.inventoryTransaction.create.mockResolvedValue(makeTxn({ action: 'LOST', chargedAmount: 30000 }));

    await inventoryService.returnItem(
      { itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'LOST', conditionNote: 'Cannot be found', chargedAmount: 30000 },
      'user-1',
    );

    expect(notificationService.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ASSISTANT_MANAGER', title: 'Inventory Deduction Created' }),
    );
  });

  it('does NOT notify for regular RETURNED action', async () => {
    mp.inventoryItem.findUnique.mockResolvedValue(makeItem());
    mp.inventoryTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 1 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mp.guard.findUnique.mockResolvedValue({ id: 'guard-1', firstName: 'Jane', lastName: 'Smith' });

    await inventoryService.returnItem({ itemId: 'item-1', guardId: 'guard-1', quantity: 1, action: 'RETURNED' }, 'user-1');

    expect(notificationService.sendToRole).not.toHaveBeenCalled();
  });
});

// ── issueFullUniformSet ────────────────────────────────────────────────────────

describe('inventoryService.issueFullUniformSet', () => {
  it('returns empty array when no UNIFORM items exist', async () => {
    mp.inventoryItem.findMany.mockResolvedValue([]);

    const result = await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    expect(result).toEqual([]);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('skips items already issued to the guard (idempotent)', async () => {
    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2', itemName: 'Guard Trousers' })];
    mp.inventoryItem.findMany.mockResolvedValue(items);
    mp.inventoryTransaction.count
      .mockResolvedValueOnce(1)  // item-1 already issued
      .mockResolvedValueOnce(0); // item-2 not issued

    await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    // $transaction should only be called once (for item-2)
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
  });

  it('skips items with zero stock', async () => {
    const items = [makeItem({ stockQuantity: 0 })];
    mp.inventoryItem.findMany.mockResolvedValue(items);
    mp.inventoryTransaction.count.mockResolvedValue(0);

    const result = await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    expect(result).toEqual([]);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('uses "Issued free of charge" note for issuedFree items', async () => {
    const items = [makeItem({ issuedFree: true, stockQuantity: 5 })];
    mp.inventoryItem.findMany.mockResolvedValue(items);
    mp.inventoryTransaction.count.mockResolvedValue(0);

    await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    const created = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(created.data.conditionNote).toBe('Issued free of charge');
  });

  it('uses "Issued on joining" note for non-free items', async () => {
    const items = [makeItem({ issuedFree: false, isShoeItem: true, stockQuantity: 5 })];
    mp.inventoryItem.findMany.mockResolvedValue(items);
    mp.inventoryTransaction.count.mockResolvedValue(0);

    await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    const created = mockTx.inventoryTransaction.create.mock.calls[0][0];
    expect(created.data.conditionNote).toBe('Issued on joining');
  });

  it('issues all available items and returns their transaction records', async () => {
    const items = [
      makeItem({ id: 'item-1', stockQuantity: 10 }),
      makeItem({ id: 'item-2', itemName: 'Trouser', stockQuantity: 8 }),
    ];
    mp.inventoryItem.findMany.mockResolvedValue(items);
    mp.inventoryTransaction.count.mockResolvedValue(0);
    mockTx.inventoryTransaction.create
      .mockResolvedValueOnce(makeTxn({ id: 'txn-1' }))
      .mockResolvedValueOnce(makeTxn({ id: 'txn-2' }));

    const result = await inventoryService.issueFullUniformSet('guard-1', 'user-1');

    expect(result).toHaveLength(2);
    expect(mp.$transaction).toHaveBeenCalledTimes(2);
  });
});
