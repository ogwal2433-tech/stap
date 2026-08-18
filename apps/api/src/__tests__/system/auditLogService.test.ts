import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    auditLog: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));

import prisma from '../../db/prisma';
import { auditLogService } from '../../services/auditLogService';
import { NotFoundError } from '../../errors/AppError';

const mp = prisma as any;

const row = (over: Record<string, any> = {}) => ({
  id:        'log-1',
  action:    'GUARD_TRANSFERRED',
  entity:    'guard',
  entityId:  'guard-123',
  userId:    'user-1',
  oldValue:  null,
  newValue:  { toSiteId: 'site-2' },
  ipAddress: '10.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2026-08-18T09:00:00Z'),
  user:      { id: 'user-1', name: 'Joshua', role: 'DIRECTOR' },
  ...over,
});

/** findMany is called 3x: page, distinct actions, distinct entities. */
function mockList(rows: any[], actions: string[] = [], entities: string[] = []) {
  mp.auditLog.findMany
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce(actions.map(action => ({ action })))
    .mockResolvedValueOnce(entities.map(entity => ({ entity })));
}

const where = () => mp.auditLog.findMany.mock.calls[0][0].where;

beforeEach(() => {
  vi.clearAllMocks();
  mp.auditLog.count.mockResolvedValue(1);
  mp.auditLog.findUnique.mockResolvedValue(row());
});

describe('auditLogService.list() filters', () => {
  it('applies no filter when none is given', async () => {
    mockList([row()]);
    await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(where()).toEqual({});
  });

  it('filters by action and user exactly', async () => {
    mockList([row()]);
    await auditLogService.list({ action: 'GUARD_PROMOTED', userId: 'u9', page: 1, limit: 50 } as never);
    expect(where()).toMatchObject({ action: 'GUARD_PROMOTED', userId: 'u9' });
  });

  it('matches entity case-insensitively', async () => {
    // The same entity has been written as both 'clientComplaint' and
    // 'ClientComplaint'; an exact match would return only half the trail.
    mockList([row()]);
    await auditLogService.list({ entity: 'clientComplaint', page: 1, limit: 50 } as never);
    expect(where().entity).toEqual({ equals: 'clientComplaint', mode: 'insensitive' });
  });

  it('searches action, entity and record id together', async () => {
    mockList([row()]);
    await auditLogService.list({ search: 'guard', page: 1, limit: 50 } as never);
    expect(where().OR).toHaveLength(3);
    expect(where().OR[0].action.mode).toBe('insensitive');
  });

  it('ignores a blank search rather than matching everything', async () => {
    mockList([row()]);
    await auditLogService.list({ search: '   ', page: 1, limit: 50 } as never);
    expect(where()).not.toHaveProperty('OR');
  });

  it('covers the whole of the end day', async () => {
    mockList([row()]);
    await auditLogService.list({ dateTo: '2026-08-18', page: 1, limit: 50 } as never);
    expect(where().createdAt.lte.getHours()).toBe(23);
  });

  it('drops an unreadable date instead of failing the query', async () => {
    mockList([row()]);
    await auditLogService.list({ dateFrom: 'garbage', page: 1, limit: 50 } as never);
    expect(where()).not.toHaveProperty('createdAt');
  });

  it('returns newest first', async () => {
    mockList([row()]);
    await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(mp.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('paginates', async () => {
    mockList([row()]);
    mp.auditLog.count.mockResolvedValue(2666);
    const res = await auditLogService.list({ page: 3, limit: 50 } as never);
    expect(mp.auditLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 100, take: 50 });
    expect(res.pages).toBe(54);
  });

  it('reports one page when the table is empty, never zero', async () => {
    mockList([]);
    mp.auditLog.count.mockResolvedValue(0);
    expect((await auditLogService.list({ page: 1, limit: 50 } as never)).pages).toBe(1);
  });

  it('builds filter options from the whole table, not the filtered slice', async () => {
    mockList([row()], ['A_CREATED'], ['guard']);
    await auditLogService.list({ action: 'A_CREATED', page: 1, limit: 50 } as never);
    // Calls 2 and 3 are the distinct lookups and carry no where clause.
    expect(mp.auditLog.findMany.mock.calls[1][0]).not.toHaveProperty('where');
    expect(mp.auditLog.findMany.mock.calls[2][0]).not.toHaveProperty('where');
  });

  it('collapses entity casing into a single filter option', async () => {
    mockList([row()], [], ['ClientComplaint', 'clientComplaint', 'guard']);
    const res = await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(res.entityTypes).toEqual(['ClientComplaint', 'guard']);
  });
});

describe('auditLogService formatting', () => {
  it('names the actor when the row recorded one', async () => {
    mockList([row()]);
    const res = await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(res.data[0].performedBy).toEqual({ id: 'user-1', name: 'Joshua', role: 'DIRECTOR' });
  });

  it('reports no actor rather than inventing one', async () => {
    // Most historic rows carry no userId; the UI shows "System" for these.
    mockList([row({ user: null, userId: null })]);
    const res = await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(res.data[0].performedBy).toBeNull();
  });

  it('carries the change detail and origin through', async () => {
    mockList([row({ oldValue: { toSiteId: 'site-1' } })]);
    const res = await auditLogService.list({ page: 1, limit: 50 } as never);
    expect(res.data[0]).toMatchObject({
      newValue:  { toSiteId: 'site-2' },
      oldValue:  { toSiteId: 'site-1' },
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
  });
});

describe('auditLogService.getById()', () => {
  it('returns the entry', async () => {
    expect((await auditLogService.getById('log-1')).id).toBe('log-1');
  });

  it('throws NotFoundError for an unknown id', async () => {
    mp.auditLog.findUnique.mockResolvedValue(null);
    await expect(auditLogService.getById('nope')).rejects.toThrow(NotFoundError);
  });
});
