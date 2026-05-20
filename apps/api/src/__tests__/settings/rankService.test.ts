import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guardRank: {
      findMany:   vi.fn(),
      findFirst:  vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    guard: {
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/settingsService', () => ({
  settingsService: { get: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { rankService } from '../../services/rankService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mp = prisma as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeRank(overrides: Record<string, any> = {}) {
  return {
    id:           'rank-1',
    name:         'Guard',
    displayOrder: 1,
    isActive:     true,
    createdAt:    new Date('2026-01-01'),
    updatedAt:    new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.auditLog.create.mockResolvedValue({});
  mp.guard.count.mockResolvedValue(0);
});

// ── listRanks() ────────────────────────────────────────────────────────────────

describe('rankService.listRanks()', () => {
  it('returns all ranks ordered by displayOrder asc', async () => {
    const ranks = [makeRank({ displayOrder: 1 }), makeRank({ id: 'rank-2', name: 'Senior Guard', displayOrder: 2 })];
    mp.guardRank.findMany.mockResolvedValue(ranks);

    const result = await rankService.listRanks();

    expect(mp.guardRank.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { displayOrder: 'asc' } }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Guard');
  });

  it('returns only active ranks when activeOnly = true', async () => {
    mp.guardRank.findMany.mockResolvedValue([makeRank()]);

    await rankService.listRanks(true);

    const callArg = mp.guardRank.findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({ isActive: true });
  });

  it('passes empty where when activeOnly = false', async () => {
    mp.guardRank.findMany.mockResolvedValue([]);

    await rankService.listRanks(false);

    const callArg = mp.guardRank.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({});
  });

  it('returns empty array when no ranks exist', async () => {
    mp.guardRank.findMany.mockResolvedValue([]);

    const result = await rankService.listRanks();

    expect(result).toEqual([]);
  });

  it('formats createdAt as ISO string', async () => {
    mp.guardRank.findMany.mockResolvedValue([makeRank()]);

    const [rank] = await rankService.listRanks();

    expect(typeof rank.createdAt).toBe('string');
    expect(rank.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── createRank() ───────────────────────────────────────────────────────────────

describe('rankService.createRank()', () => {
  it('creates rank with correct name and displayOrder', async () => {
    mp.guardRank.findFirst.mockResolvedValue(null);
    mp.guardRank.create.mockResolvedValue(makeRank({ name: 'Corporal', displayOrder: 3 }));

    await rankService.createRank({ name: 'Corporal', displayOrder: 3 }, 'user1');

    expect(mp.guardRank.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Corporal', displayOrder: 3 }),
      }),
    );
  });

  it('throws 409 for duplicate name (case-insensitive)', async () => {
    mp.guardRank.findFirst.mockResolvedValue(makeRank({ name: 'guard' }));

    await expect(
      rankService.createRank({ name: 'GUARD', displayOrder: 1 }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates audit log entry', async () => {
    mp.guardRank.findFirst.mockResolvedValue(null);
    mp.guardRank.create.mockResolvedValue(makeRank());

    await rankService.createRank({ name: 'Guard', displayOrder: 1 }, 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RANK_CREATED', entity: 'guardRank' }),
      }),
    );
  });
});

// ── updateRank() ───────────────────────────────────────────────────────────────

describe('rankService.updateRank()', () => {
  it('updates name successfully', async () => {
    const existing = makeRank();
    mp.guardRank.findUnique.mockResolvedValue(existing);
    mp.guardRank.findFirst.mockResolvedValue(null);
    mp.guardRank.update.mockResolvedValue({ ...existing, name: 'Senior Guard' });

    await rankService.updateRank('rank-1', { name: 'Senior Guard' }, 'user1');

    expect(mp.guardRank.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rank-1' },
        data:  expect.objectContaining({ name: 'Senior Guard' }),
      }),
    );
  });

  it('updates displayOrder successfully', async () => {
    const existing = makeRank();
    mp.guardRank.findUnique.mockResolvedValue(existing);
    mp.guardRank.update.mockResolvedValue({ ...existing, displayOrder: 5 });

    await rankService.updateRank('rank-1', { displayOrder: 5 }, 'user1');

    expect(mp.guardRank.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayOrder: 5 }) }),
    );
  });

  it('throws 409 when renaming to an existing name', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank({ name: 'Guard' }));
    mp.guardRank.findFirst.mockResolvedValue(makeRank({ id: 'rank-2', name: 'Corporal' }));

    await expect(
      rankService.updateRank('rank-1', { name: 'Corporal' }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when rank not found', async () => {
    mp.guardRank.findUnique.mockResolvedValue(null);

    await expect(
      rankService.updateRank('no-such-id', { name: 'Foo' }, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('creates audit log entry', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guardRank.update.mockResolvedValue(makeRank());

    await rankService.updateRank('rank-1', { displayOrder: 2 }, 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RANK_UPDATED', entity: 'guardRank', entityId: 'rank-1' }),
      }),
    );
  });

  it('does not check for duplicate when name is unchanged', async () => {
    const existing = makeRank({ name: 'Guard' });
    mp.guardRank.findUnique.mockResolvedValue(existing);
    mp.guardRank.update.mockResolvedValue(existing);

    await rankService.updateRank('rank-1', { name: 'Guard' }, 'user1');

    expect(mp.guardRank.findFirst).not.toHaveBeenCalled();
  });
});

// ── deactivateRank() ───────────────────────────────────────────────────────────

describe('rankService.deactivateRank()', () => {
  it('sets isActive = false', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guardRank.update.mockResolvedValue(makeRank({ isActive: false }));

    const { rank } = await rankService.deactivateRank('rank-1', 'user1');

    expect(rank.isActive).toBe(false);
    expect(mp.guardRank.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('does not delete the rank', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guardRank.update.mockResolvedValue(makeRank({ isActive: false }));

    await rankService.deactivateRank('rank-1', 'user1');

    expect(mp.guardRank.delete).not.toHaveBeenCalled();
  });

  it('returns guardsWithRank count', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guard.count.mockResolvedValue(7);
    mp.guardRank.update.mockResolvedValue(makeRank({ isActive: false }));

    const result = await rankService.deactivateRank('rank-1', 'user1');

    expect(result.guardsWithRank).toBe(7);
  });

  it('creates audit log with guardsCurrentlyWithRank count', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guard.count.mockResolvedValue(3);
    mp.guardRank.update.mockResolvedValue(makeRank({ isActive: false }));

    await rankService.deactivateRank('rank-1', 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'RANK_DEACTIVATED',
          newValue: { guardsCurrentlyWithRank: 3 },
        }),
      }),
    );
  });

  it('throws 404 when rank not found', async () => {
    mp.guardRank.findUnique.mockResolvedValue(null);

    await expect(rankService.deactivateRank('no-such', 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── deleteRank() ───────────────────────────────────────────────────────────────

describe('rankService.deleteRank()', () => {
  it('deletes rank when no guards have it', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guard.count.mockResolvedValue(0);
    mp.guardRank.delete.mockResolvedValue({});

    await rankService.deleteRank('rank-1', 'user1');

    expect(mp.guardRank.delete).toHaveBeenCalledWith({ where: { id: 'rank-1' } });
  });

  it('throws 409 when guards hold this rank', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank());
    mp.guard.count.mockResolvedValue(5);

    await expect(rankService.deleteRank('rank-1', 'user1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mp.guardRank.delete).not.toHaveBeenCalled();
  });

  it('throws 404 when rank not found', async () => {
    mp.guardRank.findUnique.mockResolvedValue(null);

    await expect(rankService.deleteRank('no-such', 'user1')).rejects.toThrow(NotFoundError);
  });

  it('creates audit log on successful delete', async () => {
    mp.guardRank.findUnique.mockResolvedValue(makeRank({ name: 'Guard' }));
    mp.guard.count.mockResolvedValue(0);
    mp.guardRank.delete.mockResolvedValue({});

    await rankService.deleteRank('rank-1', 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'RANK_DELETED',
          oldValue: { name: 'Guard' },
        }),
      }),
    );
  });
});

// ── reorderRanks() ────────────────────────────────────────────────────────────

describe('rankService.reorderRanks()', () => {
  it('updates displayOrder for each rank in array order', async () => {
    mp.guardRank.update.mockResolvedValue({});
    mp.guardRank.findMany.mockResolvedValue([]);

    await rankService.reorderRanks(['rank-a', 'rank-b', 'rank-c']);

    expect(mp.guardRank.update).toHaveBeenCalledWith({ where: { id: 'rank-a' }, data: { displayOrder: 1 } });
    expect(mp.guardRank.update).toHaveBeenCalledWith({ where: { id: 'rank-b' }, data: { displayOrder: 2 } });
    expect(mp.guardRank.update).toHaveBeenCalledWith({ where: { id: 'rank-c' }, data: { displayOrder: 3 } });
  });

  it('first item in array gets displayOrder = 1', async () => {
    mp.guardRank.update.mockResolvedValue({});
    mp.guardRank.findMany.mockResolvedValue([]);

    await rankService.reorderRanks(['first-id', 'second-id']);

    expect(mp.guardRank.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'first-id' }, data: { displayOrder: 1 } }),
    );
  });

  it('returns updated rank list in new order', async () => {
    const reordered = [
      makeRank({ id: 'rank-b', name: 'Corporal', displayOrder: 1 }),
      makeRank({ id: 'rank-a', name: 'Guard',    displayOrder: 2 }),
    ];
    mp.guardRank.update.mockResolvedValue({});
    mp.guardRank.findMany.mockResolvedValue(reordered);

    const result = await rankService.reorderRanks(['rank-b', 'rank-a']);

    expect(result[0].name).toBe('Corporal');
    expect(result[1].name).toBe('Guard');
  });
});
