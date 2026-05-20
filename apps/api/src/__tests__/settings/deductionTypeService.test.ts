import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    deductionType: {
      findMany:   vi.fn(),
      findFirst:  vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    guardDeduction: {
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../lib/redis', () => ({
  redisConnection: { del: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }));

import prisma from '../../db/prisma';
import { settingsService } from '../../services/settingsService';
import { NotFoundError } from '../../errors/AppError';

const mp = prisma as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeType(overrides: Record<string, any> = {}) {
  return {
    id:            'dt-1',
    name:          'Food',
    code:          'FOOD',
    defaultAmount: 2000,
    description:   'UGX 2,000 per plate.',
    isAutomatic:   false,
    displayOrder:  1,
    isActive:      true,
    createdAt:     new Date('2026-01-01'),
    updatedAt:     new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.auditLog.create.mockResolvedValue({});
  mp.guardDeduction.count.mockResolvedValue(0);
});

// ── listDeductionTypes() ───────────────────────────────────────────────────────

describe('settingsService.listDeductionTypes()', () => {
  it('returns all types ordered by displayOrder asc', async () => {
    const types = [makeType(), makeType({ id: 'dt-2', name: 'Transport', code: 'TRANSPORT', defaultAmount: null, displayOrder: 2 })];
    mp.deductionType.findMany.mockResolvedValue(types);

    const result = await settingsService.listDeductionTypes();

    expect(mp.deductionType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { displayOrder: 'asc' } }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Food');
  });

  it('returns only active types when activeOnly = true', async () => {
    mp.deductionType.findMany.mockResolvedValue([makeType()]);

    await settingsService.listDeductionTypes(true);

    const callArg = mp.deductionType.findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({ isActive: true });
  });

  it('passes empty where when activeOnly = false', async () => {
    mp.deductionType.findMany.mockResolvedValue([]);

    await settingsService.listDeductionTypes(false);

    const callArg = mp.deductionType.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({});
  });

  it('includes isAutomatic types in both active and inactive queries', async () => {
    const autoType = makeType({ code: 'NSSF', name: 'NSSF Contribution', isAutomatic: true });
    mp.deductionType.findMany.mockResolvedValue([autoType]);

    const result = await settingsService.listDeductionTypes(true);

    expect(result[0].isAutomatic).toBe(true);
  });

  it('returns empty array when no types exist', async () => {
    mp.deductionType.findMany.mockResolvedValue([]);

    const result = await settingsService.listDeductionTypes();

    expect(result).toEqual([]);
  });
});

// ── createDeductionType() ─────────────────────────────────────────────────────

describe('settingsService.createDeductionType()', () => {
  it('creates with correct name, code, defaultAmount', async () => {
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.findUnique.mockResolvedValue(null);
    mp.deductionType.create.mockResolvedValue(makeType({ name: 'Loan Repayment', code: 'LOAN_REPAYMENT', defaultAmount: null }));

    await settingsService.createDeductionType({ name: 'Loan Repayment', code: 'LOAN_REPAYMENT', defaultAmount: null, displayOrder: 11 }, 'user1');

    expect(mp.deductionType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Loan Repayment', code: 'LOAN_REPAYMENT' }),
      }),
    );
  });

  it('auto-uppercases the code', async () => {
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.findUnique.mockResolvedValue(null);
    mp.deductionType.create.mockResolvedValue(makeType({ code: 'LOAN_REPAYMENT' }));

    await settingsService.createDeductionType({ name: 'Loan', code: 'loan_repayment', displayOrder: 1 }, 'user1');

    const call = mp.deductionType.create.mock.calls[0][0];
    expect(call.data.code).toBe('LOAN_REPAYMENT');
  });

  it('throws 409 for duplicate name (case-insensitive)', async () => {
    mp.deductionType.findFirst.mockResolvedValue(makeType({ name: 'food' }));

    await expect(
      settingsService.createDeductionType({ name: 'FOOD', code: 'FOOD2', displayOrder: 1 }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 for duplicate code', async () => {
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.findUnique.mockResolvedValue(makeType());

    await expect(
      settingsService.createDeductionType({ name: 'Different Name', code: 'FOOD', displayOrder: 1 }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('sets isAutomatic = false always', async () => {
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.findUnique.mockResolvedValue(null);
    mp.deductionType.create.mockResolvedValue(makeType({ isAutomatic: false }));

    await settingsService.createDeductionType({ name: 'Test', code: 'TEST', displayOrder: 1 }, 'user1');

    const call = mp.deductionType.create.mock.calls[0][0];
    expect(call.data.isAutomatic).toBe(false);
  });

  it('creates audit log entry', async () => {
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.findUnique.mockResolvedValue(null);
    mp.deductionType.create.mockResolvedValue(makeType());

    await settingsService.createDeductionType({ name: 'Food', code: 'FOOD', displayOrder: 1 }, 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DEDUCTION_TYPE_CREATED', entity: 'deductionType' }),
      }),
    );
  });
});

// ── updateDeductionType() ─────────────────────────────────────────────────────

describe('settingsService.updateDeductionType()', () => {
  it('updates name successfully', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.findFirst.mockResolvedValue(null);
    mp.deductionType.update.mockResolvedValue(makeType({ name: 'Meal' }));

    await settingsService.updateDeductionType('dt-1', { name: 'Meal' }, 'user1');

    expect(mp.deductionType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dt-1' }, data: expect.objectContaining({ name: 'Meal' }) }),
    );
  });

  it('updates defaultAmount to null (clear default)', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ defaultAmount: null }));

    await settingsService.updateDeductionType('dt-1', { defaultAmount: null }, 'user1');

    const call = mp.deductionType.update.mock.calls[0][0];
    expect(call.data.defaultAmount).toBeNull();
  });

  it('updates defaultAmount to a new value', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ defaultAmount: 3000 }));

    await settingsService.updateDeductionType('dt-1', { defaultAmount: 3000 }, 'user1');

    const call = mp.deductionType.update.mock.calls[0][0];
    expect(call.data.defaultAmount).toBe(3000);
  });

  it('updates description', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ description: 'New desc' }));

    await settingsService.updateDeductionType('dt-1', { description: 'New desc' }, 'user1');

    expect(mp.deductionType.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: 'New desc' }) }),
    );
  });

  it('throws 400 when trying to update code field', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());

    await expect(
      settingsService.updateDeductionType('dt-1', { code: 'CHANGED' } as any, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when renaming to existing name', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType({ name: 'Food' }));
    mp.deductionType.findFirst.mockResolvedValue(makeType({ id: 'dt-2', name: 'Transport' }));

    await expect(
      settingsService.updateDeductionType('dt-1', { name: 'Transport' }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when type not found', async () => {
    mp.deductionType.findUnique.mockResolvedValue(null);

    await expect(
      settingsService.updateDeductionType('no-such-id', { name: 'Foo' }, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('creates audit log with old and new values', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ displayOrder: 5 }));

    await settingsService.updateDeductionType('dt-1', { displayOrder: 5 }, 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'DEDUCTION_TYPE_UPDATED',
          entity:   'deductionType',
          entityId: 'dt-1',
        }),
      }),
    );
  });
});

// ── deactivateDeductionType() ─────────────────────────────────────────────────

describe('settingsService.deactivateDeductionType()', () => {
  it('sets isActive = false', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ isActive: false }));

    const result = await settingsService.deactivateDeductionType('dt-1', 'user1');

    expect(result.isActive).toBe(false);
    expect(mp.deductionType.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('does not delete the type', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.deductionType.update.mockResolvedValue(makeType({ isActive: false }));

    await settingsService.deactivateDeductionType('dt-1', 'user1');

    expect(mp.deductionType.delete).not.toHaveBeenCalled();
  });

  it('throws 400 for isAutomatic types', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType({ isAutomatic: true }));

    await expect(
      settingsService.deactivateDeductionType('dt-1', 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('records pendingDeductionsOfThisType count in audit log', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType({ code: 'FOOD' }));
    mp.guardDeduction.count.mockResolvedValue(4);
    mp.deductionType.update.mockResolvedValue(makeType({ isActive: false }));

    await settingsService.deactivateDeductionType('dt-1', 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'DEDUCTION_TYPE_DEACTIVATED',
          newValue: { pendingDeductionsOfThisType: 4 },
        }),
      }),
    );
  });

  it('throws 404 when not found', async () => {
    mp.deductionType.findUnique.mockResolvedValue(null);

    await expect(
      settingsService.deactivateDeductionType('no-such', 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteDeductionType() ─────────────────────────────────────────────────────

describe('settingsService.deleteDeductionType()', () => {
  it('deletes when no deduction records reference it', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType());
    mp.guardDeduction.count.mockResolvedValue(0);
    mp.deductionType.delete.mockResolvedValue({});

    await settingsService.deleteDeductionType('dt-1', 'user1');

    expect(mp.deductionType.delete).toHaveBeenCalledWith({ where: { id: 'dt-1' } });
  });

  it('throws 409 when records exist — includes count in message', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType({ name: 'Food' }));
    mp.guardDeduction.count.mockResolvedValue(3);

    await expect(
      settingsService.deleteDeductionType('dt-1', 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mp.deductionType.delete).not.toHaveBeenCalled();
  });

  it('throws 400 for isAutomatic types', async () => {
    mp.deductionType.findUnique.mockResolvedValue(makeType({ isAutomatic: true }));

    await expect(
      settingsService.deleteDeductionType('dt-1', 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mp.deductionType.delete).not.toHaveBeenCalled();
  });

  it('throws 404 when not found', async () => {
    mp.deductionType.findUnique.mockResolvedValue(null);

    await expect(
      settingsService.deleteDeductionType('no-such', 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── reorderDeductionTypes() ───────────────────────────────────────────────────

describe('settingsService.reorderDeductionTypes()', () => {
  it('updates displayOrder per position in array', async () => {
    mp.deductionType.update.mockResolvedValue({});
    mp.deductionType.findMany.mockResolvedValue([]);

    await settingsService.reorderDeductionTypes(['dt-a', 'dt-b', 'dt-c']);

    expect(mp.deductionType.update).toHaveBeenCalledWith({ where: { id: 'dt-a' }, data: { displayOrder: 1 } });
    expect(mp.deductionType.update).toHaveBeenCalledWith({ where: { id: 'dt-b' }, data: { displayOrder: 2 } });
    expect(mp.deductionType.update).toHaveBeenCalledWith({ where: { id: 'dt-c' }, data: { displayOrder: 3 } });
  });

  it('first item in array gets displayOrder = 1', async () => {
    mp.deductionType.update.mockResolvedValue({});
    mp.deductionType.findMany.mockResolvedValue([]);

    await settingsService.reorderDeductionTypes(['first-id', 'second-id']);

    expect(mp.deductionType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'first-id' }, data: { displayOrder: 1 } }),
    );
  });

  it('returns list in new order', async () => {
    const reordered = [
      makeType({ id: 'dt-b', name: 'Transport', code: 'TRANSPORT', displayOrder: 1 }),
      makeType({ id: 'dt-a', name: 'Food',      code: 'FOOD',      displayOrder: 2 }),
    ];
    mp.deductionType.update.mockResolvedValue({});
    mp.deductionType.findMany.mockResolvedValue(reordered);

    const result = await settingsService.reorderDeductionTypes(['dt-b', 'dt-a']);

    expect(result[0].name).toBe('Transport');
    expect(result[1].name).toBe('Food');
  });
});
