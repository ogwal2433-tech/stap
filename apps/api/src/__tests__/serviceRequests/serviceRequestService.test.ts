import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client:         { findUnique: vi.fn() },
    user:           { findMany:   vi.fn() },
    serviceRequest: {
      create:     vi.fn(),
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      update:     vi.fn(),
      groupBy:    vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { serviceRequestService } from '../../services/serviceRequestService';
import { AppError, NotFoundError } from '../../errors/AppError';

const mp  = prisma as any;
const mns = notificationService as any;

/** A request as Prisma returns it under the service's INCLUDE. */
const sr = (over: Record<string, any> = {}) => ({
  id:            'sr-1',
  clientId:      'client-1',
  siteId:        null,
  type:          'MORE_GUARDS',
  subject:       'Two extra guards for the warehouse',
  description:   'We need two additional night guards from Monday.',
  quantity:      2,
  status:        'PENDING',
  priority:      'HIGH',
  staffResponse: null,
  staffNotes:    null,
  respondedById: null,
  respondedAt:   null,
  createdBy:     'client-user-1',
  createdAt:     new Date('2026-08-17T08:00:00Z'),
  updatedAt:     new Date('2026-08-17T08:00:00Z'),
  client:        { id: 'client-1', clientName: 'Kakooza Enterprises Ltd', systemId: 'CL-001' },
  site:          null,
  createdByUser:   { id: 'client-user-1', name: 'Michael Kakooza' },
  respondedByUser: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.client.findUnique.mockResolvedValue({ id: 'client-1', clientName: 'Kakooza Enterprises Ltd' });
  mp.user.findMany.mockResolvedValue([{ id: 'client-user-1' }, { id: 'client-user-2' }]);
  mp.serviceRequest.create.mockResolvedValue(sr());
  mp.serviceRequest.findUnique.mockResolvedValue(sr());
  mp.serviceRequest.findMany.mockResolvedValue([sr()]);
  mp.serviceRequest.count.mockResolvedValue(1);
  mp.serviceRequest.update.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));
  mp.serviceRequest.groupBy.mockResolvedValue([]);
});

// ── Internal notes must not reach clients ──────────────────────────────────────

describe('staffNotes visibility', () => {
  it('is withheld from the client-facing list', async () => {
    const res = await serviceRequestService.listByClient('client-1');

    expect(res.data[0]).not.toHaveProperty('staffNotes');
  });

  it('is withheld from a newly created request', async () => {
    const created = await serviceRequestService.create(
      { clientId: 'client-1', subject: 'x', description: 'y'.repeat(12) } as any,
      'client-user-1',
    );

    expect(created).not.toHaveProperty('staffNotes');
  });

  it('is returned to staff', async () => {
    mp.serviceRequest.findMany.mockResolvedValue([sr({ staffNotes: 'Assigned to Ops' })]);

    const res = await serviceRequestService.listAll({ page: 1, limit: 20 });

    expect(res.data[0].staffNotes).toBe('Assigned to Ops');
  });

  it('reaches staff on a single fetch too', async () => {
    mp.serviceRequest.findUnique.mockResolvedValue(sr({ staffNotes: 'Chasing the client' }));

    const res = await serviceRequestService.getByIdForStaff('sr-1');

    expect(res.staffNotes).toBe('Chasing the client');
  });
});

// ── listAll() ──────────────────────────────────────────────────────────────────

describe('serviceRequestService.listAll()', () => {
  it('returns every client when no filter is given', async () => {
    await serviceRequestService.listAll({ page: 1, limit: 20 });

    expect(mp.serviceRequest.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('filters by status, client and priority', async () => {
    await serviceRequestService.listAll({
      status: 'PENDING', clientId: 'client-1', priority: 'HIGH', page: 1, limit: 20,
    });

    expect(mp.serviceRequest.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'PENDING', clientId: 'client-1', priority: 'HIGH',
    });
  });

  it('takes the whole of the end day, not midnight', async () => {
    // A picker showing "to 17 Aug" must include requests raised that afternoon.
    await serviceRequestService.listAll({ dateTo: '2026-08-17', page: 1, limit: 20 });

    const lte = (mp.serviceRequest.findMany.mock.calls[0][0].where as any).createdAt.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
  });

  it('supports an open-ended from-date', async () => {
    await serviceRequestService.listAll({ dateFrom: '2026-08-01', page: 1, limit: 20 });

    const createdAt = (mp.serviceRequest.findMany.mock.calls[0][0].where as any).createdAt;
    expect(createdAt.gte).toBeInstanceOf(Date);
    expect(createdAt.lte).toBeUndefined();
  });

  it('puts unanswered work at the top', async () => {
    await serviceRequestService.listAll({ page: 1, limit: 20 });

    expect(mp.serviceRequest.findMany.mock.calls[0][0].orderBy).toEqual([
      { status: 'asc' }, { createdAt: 'desc' },
    ]);
  });

  it('paginates', async () => {
    mp.serviceRequest.count.mockResolvedValue(45);

    const res = await serviceRequestService.listAll({ page: 3, limit: 20 });

    expect(mp.serviceRequest.findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 20 });
    expect(res.pagination).toMatchObject({ total: 45, totalPages: 3, hasNext: false, hasPrev: true });
  });
});

// ── getSummary() ───────────────────────────────────────────────────────────────

describe('serviceRequestService.getSummary()', () => {
  it('counts each status and totals them', async () => {
    mp.serviceRequest.groupBy.mockResolvedValue([
      { status: 'PENDING',     _count: { _all: 4 } },
      { status: 'IN_PROGRESS', _count: { _all: 2 } },
      { status: 'COMPLETED',   _count: { _all: 7 } },
      { status: 'REJECTED',    _count: { _all: 1 } },
    ]);

    expect(await serviceRequestService.getSummary()).toEqual({
      pending: 4, inProgress: 2, completed: 7, rejected: 1, total: 14,
    });
  });

  it('reports zeros rather than undefined when nothing exists', async () => {
    mp.serviceRequest.groupBy.mockResolvedValue([]);

    expect(await serviceRequestService.getSummary()).toEqual({
      pending: 0, inProgress: 0, completed: 0, rejected: 0, total: 0,
    });
  });
});

// ── updateStatus() ─────────────────────────────────────────────────────────────

describe('serviceRequestService.updateStatus()', () => {
  const input = { status: 'IN_PROGRESS', staffResponse: 'Reviewing now.', staffNotes: 'Ops has it' } as any;

  it('records the response, notes and who answered', async () => {
    await serviceRequestService.updateStatus('sr-1', input, 'staff-1');

    expect(mp.serviceRequest.update.mock.calls[0][0].data).toMatchObject({
      status:        'IN_PROGRESS',
      staffResponse: 'Reviewing now.',
      staffNotes:    'Ops has it',
      respondedById: 'staff-1',
    });
  });

  it('keeps an earlier reply when this update leaves the box empty', async () => {
    mp.serviceRequest.findUnique.mockResolvedValue(
      sr({ staffResponse: 'Already told them Monday', staffNotes: 'earlier note' }),
    );

    await serviceRequestService.updateStatus('sr-1', { status: 'IN_PROGRESS' } as any, 'staff-1');

    expect(mp.serviceRequest.update.mock.calls[0][0].data).toMatchObject({
      staffResponse: 'Already told them Monday',
      staffNotes:    'earlier note',
    });
  });

  it('notifies every portal user at that company', async () => {
    await serviceRequestService.updateStatus('sr-1', input, 'staff-1');

    expect(mns.send).toHaveBeenCalledTimes(2);
    expect(mns.send.mock.calls[0][0]).toMatchObject({ entityType: 'serviceRequest', entityId: 'sr-1' });
  });

  it('sends the staff response as the notification body', async () => {
    await serviceRequestService.updateStatus('sr-1', input, 'staff-1');

    expect(mns.send.mock.calls[0][0].message).toBe('Reviewing now.');
  });

  it('falls back to a readable message when there is no response', async () => {
    await serviceRequestService.updateStatus('sr-1', { status: 'IN_PROGRESS' } as any, 'staff-1');

    expect(mns.send.mock.calls[0][0].message).toContain('in progress');
  });

  it('refuses to change a completed request', async () => {
    mp.serviceRequest.findUnique.mockResolvedValue(sr({ status: 'COMPLETED' }));

    await expect(serviceRequestService.updateStatus('sr-1', input, 'staff-1'))
      .rejects.toThrow(/no longer be changed/i);
  });

  it('refuses to change a rejected request', async () => {
    mp.serviceRequest.findUnique.mockResolvedValue(sr({ status: 'REJECTED' }));

    await expect(serviceRequestService.updateStatus('sr-1', input, 'staff-1'))
      .rejects.toThrow(AppError);
  });

  it('throws NotFoundError for an unknown request', async () => {
    mp.serviceRequest.findUnique.mockResolvedValue(null);

    await expect(serviceRequestService.updateStatus('nope', input, 'staff-1'))
      .rejects.toThrow(NotFoundError);
  });

  it('still updates when the client has no portal user', async () => {
    mp.user.findMany.mockResolvedValue([]);

    await expect(serviceRequestService.updateStatus('sr-1', input, 'staff-1')).resolves.toBeTruthy();
    expect(mns.send).not.toHaveBeenCalled();
  });
});
