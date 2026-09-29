import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client:          { findUnique: vi.fn() },
    site:            { findFirst:  vi.fn() },
    user:            { findMany:   vi.fn() },
    clientComplaint: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    auditLog:        { create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    send:        vi.fn().mockResolvedValue(undefined),
    sendToRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { complaintService } from '../../services/complaintService';
import { AppError, NotFoundError } from '../../errors/AppError';

const mp  = prisma as any;
const mns = notificationService as any;

const CLIENT = { id: 'client-1', clientName: 'Kakooza Enterprises Ltd' };

/** An outbound notice, shaped as the INCLUDE projection returns it. */
const notice = (over: Record<string, any> = {}) => ({
  id:             'notice-1',
  clientId:       'client-1',
  siteId:         null,
  subject:        'Outstanding invoice INV/2026/0001',
  category:       'BILLING_DISPUTE',
  description:    'Your invoice is 14 days overdue. Please arrange payment within 7 days.',
  severity:       'HIGH',
  status:         'SENT',
  direction:      'OUTBOUND',
  receivedById:   null,
  assignedToId:   null,
  assignedAt:     null,
  resolution:     null,
  actionTaken:    null,
  actionTakenAt:  null,
  resolvedAt:     null,
  resolvedBy:     null,
  sentById:       'staff-1',
  sentAt:         new Date('2026-08-15T08:00:00Z'),
  acknowledgedAt: null,
  acknowledgedById: null,
  clientResponse: null,
  createdAt:      new Date('2026-08-15T08:00:00Z'),
  updatedAt:      new Date('2026-08-15T08:00:00Z'),
  client:         { id: 'client-1', clientName: 'Kakooza Enterprises Ltd', systemId: null, email: 'k@test.ug' },
  site:           null,
  receivedByUser: null,
  assignedToUser: null,
  actionTakenByUser:  null,
  sentByUser:         { id: 'staff-1', name: 'Joshua' },
  acknowledgedByUser: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.client.findUnique.mockResolvedValue(CLIENT);
  mp.site.findFirst.mockResolvedValue({ id: 'site-1' });
  mp.user.findMany.mockResolvedValue([{ id: 'client-user-1' }, { id: 'client-user-2' }]);
  mp.clientComplaint.create.mockResolvedValue(notice());
  mp.clientComplaint.findUnique.mockResolvedValue(notice());
  mp.clientComplaint.update.mockResolvedValue(notice());
  mp.clientComplaint.count.mockResolvedValue(0);
});

// ── createOutbound() ───────────────────────────────────────────────────────────

describe('complaintService.createOutbound()', () => {
  const input = {
    clientId:    'client-1',
    subject:     'Outstanding invoice INV/2026/0001',
    description: 'Your invoice is 14 days overdue. Please arrange payment within 7 days.',
    priority:    'HIGH' as const,
    category:    'BILLING_DISPUTE' as const,
  };

  it('marks the complaint OUTBOUND and starts it at SENT', async () => {
    await complaintService.createOutbound(input, 'staff-1');

    expect(mp.clientComplaint.create.mock.calls[0][0].data).toMatchObject({
      direction: 'OUTBOUND',
      status:    'SENT',
      sentById:  'staff-1',
    });
  });

  it('stores priority on severity — the same LOW/MEDIUM/HIGH scale', async () => {
    await complaintService.createOutbound(input, 'staff-1');

    expect(mp.clientComplaint.create.mock.calls[0][0].data.severity).toBe('HIGH');
  });

  it('defaults an unspecified category to OTHER, since category is required', async () => {
    await complaintService.createOutbound({ ...input, category: undefined } as any, 'staff-1');

    expect(mp.clientComplaint.create.mock.calls[0][0].data.category).toBe('OTHER');
  });

  it('notifies every portal user at that company, not just one contact', async () => {
    await complaintService.createOutbound(input, 'staff-1');

    expect(mns.send).toHaveBeenCalledTimes(2);
    expect(mns.send.mock.calls[0][0]).toMatchObject({
      userId:     'client-user-1',
      entityType: 'complaint',
      entityId:   'notice-1',
    });
  });

  it('still sends when the client has no portal user yet', async () => {
    // The notice is a record of what Security360 sent; it must not depend on the
    // client having been given a login.
    mp.user.findMany.mockResolvedValue([]);

    await expect(complaintService.createOutbound(input, 'staff-1')).resolves.toBeTruthy();
    expect(mns.send).not.toHaveBeenCalled();
  });

  it('rejects an unknown client', async () => {
    mp.client.findUnique.mockResolvedValue(null);

    await expect(complaintService.createOutbound(input, 'staff-1')).rejects.toThrow(NotFoundError);
  });

  it('rejects a site belonging to a different client', async () => {
    mp.site.findFirst.mockResolvedValue(null);

    await expect(
      complaintService.createOutbound({ ...input, siteId: 'site-of-another-client' }, 'staff-1'),
    ).rejects.toThrow(/does not belong/i);
  });
});

// ── acknowledgeNotice() ────────────────────────────────────────────────────────

describe('complaintService.acknowledgeNotice()', () => {
  it('records the response and who acknowledged it', async () => {
    await complaintService.acknowledgeNotice('notice-1', 'Noted. Paying Friday.', 'client-user-1');

    expect(mp.clientComplaint.update.mock.calls[0][0].data).toMatchObject({
      status:           'ACKNOWLEDGED',
      acknowledgedById: 'client-user-1',
      clientResponse:   'Noted. Paying Friday.',
    });
  });

  it('treats a blank response as no response rather than an empty string', async () => {
    await complaintService.acknowledgeNotice('notice-1', '   ', 'client-user-1');

    expect(mp.clientComplaint.update.mock.calls[0][0].data.clientResponse).toBeNull();
  });

  it('tells the sender their notice was seen', async () => {
    await complaintService.acknowledgeNotice('notice-1', undefined, 'client-user-1');

    expect(mns.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'staff-1', entityId: 'notice-1' }),
    );
  });

  it('refuses a complaint the client raised themselves', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ direction: 'INBOUND', status: 'OPEN' }));

    await expect(complaintService.acknowledgeNotice('notice-1', undefined, 'client-user-1'))
      .rejects.toThrow(/Only notices sent by Security360/i);
  });

  it('refuses a second acknowledgement', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ status: 'ACKNOWLEDGED' }));

    await expect(complaintService.acknowledgeNotice('notice-1', undefined, 'client-user-1'))
      .rejects.toThrow(/already acknowledged/i);
  });

  it('refuses to acknowledge a notice already closed', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ status: 'RESOLVED' }));

    await expect(complaintService.acknowledgeNotice('notice-1', undefined, 'client-user-1'))
      .rejects.toThrow(/already been closed/i);
  });

  it('throws NotFoundError for an unknown notice', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(null);

    await expect(complaintService.acknowledgeNotice('nope', undefined, 'client-user-1'))
      .rejects.toThrow(NotFoundError);
  });
});

// ── resolveOutbound() ──────────────────────────────────────────────────────────

describe('complaintService.resolveOutbound()', () => {
  it('closes the notice and records who closed it', async () => {
    await complaintService.resolveOutbound('notice-1', 'staff-1');

    expect(mp.clientComplaint.update.mock.calls[0][0].data).toMatchObject({
      status:     'RESOLVED',
      resolvedBy: 'staff-1',
    });
  });

  it('can close a notice the client never acknowledged', async () => {
    // Chasing an unresponsive client should not leave the notice open forever.
    await expect(complaintService.resolveOutbound('notice-1', 'staff-1')).resolves.toBeTruthy();
  });

  it('refuses an inbound complaint, which must record its action taken', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ direction: 'INBOUND', status: 'OPEN' }));

    await expect(complaintService.resolveOutbound('notice-1', 'staff-1'))
      .rejects.toThrow(/inbound complaint/i);
  });

  it('refuses to resolve twice', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ status: 'RESOLVED' }));

    await expect(complaintService.resolveOutbound('notice-1', 'staff-1'))
      .rejects.toThrow(/already resolved/i);
  });
});

// ── Direction isolation ────────────────────────────────────────────────────────

describe('inbound and outbound stay separated', () => {
  it('updateStatus() refuses an outbound notice', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice());

    await expect(
      complaintService.updateStatus('notice-1', { status: 'RESOLVED', actionTaken: 'done enough' } as any, 'staff-1'),
    ).rejects.toThrow(AppError);
  });

  it('assignComplaint() refuses an outbound notice', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice());

    await expect(
      complaintService.assignComplaint('notice-1', { receivedById: 'u1', assignedToId: 'u2' } as any, 'staff-1'),
    ).rejects.toThrow(/cannot be assigned/i);
  });

  it('list() filters by direction when asked', async () => {
    mp.clientComplaint.findMany.mockResolvedValue([notice()]);
    mp.clientComplaint.count.mockResolvedValue(1);

    await complaintService.list({ direction: 'OUTBOUND', page: 1, limit: 20 });

    expect(mp.clientComplaint.findMany.mock.calls[0][0].where).toMatchObject({ direction: 'OUTBOUND' });
  });

  it('list() returns both directions when none is given, so old callers still work', async () => {
    mp.clientComplaint.findMany.mockResolvedValue([notice()]);
    mp.clientComplaint.count.mockResolvedValue(1);

    await complaintService.list({ page: 1, limit: 20 });

    expect(mp.clientComplaint.findMany.mock.calls[0][0].where).not.toHaveProperty('direction');
  });

  it('list() treats ALL as no filter', async () => {
    mp.clientComplaint.findMany.mockResolvedValue([notice()]);
    mp.clientComplaint.count.mockResolvedValue(1);

    await complaintService.list({ direction: 'ALL', page: 1, limit: 20 });

    expect(mp.clientComplaint.findMany.mock.calls[0][0].where).not.toHaveProperty('direction');
  });

  it('counts only unacknowledged notices for the unread badge', async () => {
    mp.clientComplaint.count.mockResolvedValue(3);

    expect(await complaintService.countUnreadNotices('client-1')).toBe(3);
    expect(mp.clientComplaint.count.mock.calls[0][0].where).toEqual({
      clientId: 'client-1', direction: 'OUTBOUND', status: 'SENT',
    });
  });

  it('reports direction on the response, defaulting rows written before the column existed', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(notice({ direction: undefined }));

    const res = await complaintService.getById('notice-1');

    expect(res.direction).toBe('INBOUND');
  });
});
