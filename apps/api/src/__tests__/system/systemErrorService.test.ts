import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    systemError: {
      findMany:  vi.fn(),
      findUnique: vi.fn(),
      count:     vi.fn(),
      update:    vi.fn(),
      updateMany: vi.fn(),
      groupBy:   vi.fn(),
    },
  },
}));

import prisma from '../../db/prisma';
import { systemErrorService } from '../../services/systemErrorService';
import { NotFoundError } from '../../errors/AppError';

const mp = prisma as any;

const MOCK_ERROR = {
  id: 'err-1', errorCode: 'DATABASE_ERROR', severity: 'ERROR', category: 'DATABASE',
  message: 'boom', stack: null, context: null,
  route: 'GET /api/v1/guards', method: 'GET', statusCode: 500,
  userId: 'u1', userRole: 'DIRECTOR', ipAddress: '127.0.0.1', userAgent: 'curl',
  status: 'OPEN', resolvedById: null, resolvedByUser: null, resolvedAt: null, resolutionNotes: null,
  occurrenceCount: 1, firstSeenAt: new Date(), lastSeenAt: new Date(),
  environment: 'development', appVersion: null,
  createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.systemError.findMany.mockResolvedValue([MOCK_ERROR]);
  mp.systemError.count.mockResolvedValue(1);
  mp.systemError.findUnique.mockResolvedValue(MOCK_ERROR);
  mp.systemError.update.mockResolvedValue({ ...MOCK_ERROR, status: 'RESOLVED' });
  mp.systemError.updateMany.mockResolvedValue({ count: 2 });
  mp.systemError.groupBy.mockResolvedValue([]);
});

describe('systemErrorService.list()', () => {
  it('paginates and returns formatted rows', async () => {
    const result = await systemErrorService.list({ page: 1, limit: 50 });
    expect(result.data[0]).toMatchObject({ id: 'err-1', errorCode: 'DATABASE_ERROR' });
    expect(result.pagination).toMatchObject({ page: 1, limit: 50, total: 1 });
  });

  it('filters by status/severity/category', async () => {
    await systemErrorService.list({ status: 'OPEN', severity: 'ERROR', category: 'DATABASE', page: 1, limit: 50 });
    const where = mp.systemError.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'OPEN', severity: 'ERROR', category: 'DATABASE' });
  });

  it('builds a search OR clause across message/route/errorCode', async () => {
    await systemErrorService.list({ search: 'timeout', page: 1, limit: 50 });
    const where = mp.systemError.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toMatchObject({ message: { contains: 'timeout', mode: 'insensitive' } });
  });

  it('orders by severity desc then lastSeenAt desc', async () => {
    await systemErrorService.list({ page: 1, limit: 50 });
    const orderBy = mp.systemError.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual([{ severity: 'desc' }, { lastSeenAt: 'desc' }]);
  });
});

describe('systemErrorService.getById()', () => {
  it('returns the formatted error when found', async () => {
    const result = await systemErrorService.getById('err-1');
    expect(result.id).toBe('err-1');
  });

  it('throws NotFoundError when missing', async () => {
    mp.systemError.findUnique.mockResolvedValue(null);
    await expect(systemErrorService.getById('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('systemErrorService.updateStatus()', () => {
  it('sets resolvedById/resolvedAt when marking RESOLVED', async () => {
    await systemErrorService.updateStatus('err-1', { status: 'RESOLVED', resolutionNotes: 'Fixed' }, 'user-1');
    expect(mp.systemError.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED', resolutionNotes: 'Fixed', resolvedById: 'user-1', resolvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('clears resolvedById/resolvedAt for non-RESOLVED statuses', async () => {
    await systemErrorService.updateStatus('err-1', { status: 'INVESTIGATING' }, 'user-1');
    expect(mp.systemError.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'INVESTIGATING', resolvedById: null, resolvedAt: null }),
      }),
    );
  });
});

describe('systemErrorService.bulkUpdateStatus()', () => {
  it('updates all matching ids and returns the count', async () => {
    const count = await systemErrorService.bulkUpdateStatus(['e1', 'e2'], 'IGNORED');
    expect(count).toBe(2);
    expect(mp.systemError.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      data:  { status: 'IGNORED' },
    });
  });
});

describe('systemErrorService.getStats()', () => {
  it('aggregates counts by severity/category/status and includes recent errors', async () => {
    mp.systemError.count
      .mockResolvedValueOnce(10)  // total
      .mockResolvedValueOnce(2)   // openCritical
      .mockResolvedValueOnce(3)   // openError
      .mockResolvedValueOnce(4);  // todayCount
    mp.systemError.groupBy
      .mockResolvedValueOnce([{ severity: 'ERROR', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ category: 'DATABASE', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ status: 'OPEN', _count: { _all: 5 } }]);
    mp.systemError.findMany.mockResolvedValue([MOCK_ERROR]);

    const stats = await systemErrorService.getStats();

    expect(stats.total).toBe(10);
    expect(stats.openCritical).toBe(2);
    expect(stats.openError).toBe(3);
    expect(stats.todayCount).toBe(4);
    expect(stats.bySeverity).toEqual({ ERROR: 3 });
    expect(stats.byCategory).toEqual({ DATABASE: 3 });
    expect(stats.byStatus).toEqual({ OPEN: 5 });
    expect(stats.recentErrors).toHaveLength(1);
  });
});
