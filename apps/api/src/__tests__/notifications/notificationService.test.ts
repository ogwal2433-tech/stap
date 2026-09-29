import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    user:                   { findUnique: vi.fn(), findMany: vi.fn() },
    notification:           { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendSms:   vi.fn().mockResolvedValue(undefined),
    logAudit:  vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { notificationService } from '../../services/notificationService';

const mp = prisma as any;
const mq = QueueService as any;

const MOCK_USER = {
  id:    'user-1',
  name:  'Alice Nakato',
  email: 'alice@security360.ug',
  role:  'DIRECTOR',
  phone: '+256700000001',
};

const MOCK_NOTIFICATION = {
  id:         'notif-1',
  userId:     'user-1',
  type:       'COMPLAINT_ASSIGNED',
  title:      'New Complaint',
  message:    'A complaint was raised',
  isRead:     false,
  readAt:     null,
  entityType: 'complaint',
  entityId:   'comp-1',
  createdAt:  new Date('2026-04-16T10:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.user.findUnique.mockResolvedValue(MOCK_USER);
  mp.user.findMany.mockResolvedValue([MOCK_USER]);
  mp.notification.create.mockResolvedValue(MOCK_NOTIFICATION);
  mp.notification.findUnique.mockResolvedValue(MOCK_NOTIFICATION);
  mp.notification.findMany.mockResolvedValue([MOCK_NOTIFICATION]);
  mp.notification.count.mockResolvedValue(1);
  mp.notification.update.mockResolvedValue({ ...MOCK_NOTIFICATION, isRead: true, readAt: new Date() });
  mp.notification.updateMany.mockResolvedValue({ count: 1 });
  mp.notificationPreference.findUnique.mockResolvedValue(null);
  mp.notificationPreference.upsert.mockResolvedValue({ role: 'DIRECTOR', preferences: {} });
});

// ── computeTimeAgo (via getForUser — tested through public surface) ─────────────

describe('computeTimeAgo (via getForUser timeAgo field)', () => {
  it('returns "just now" for notifications created less than 1 minute ago', async () => {
    const recent = { ...MOCK_NOTIFICATION, createdAt: new Date(Date.now() - 30_000) };
    mp.notification.findMany.mockResolvedValue([recent]);
    mp.notification.count.mockResolvedValue(1);

    const result = await notificationService.getForUser('user-1', { page: 1, limit: 20 });
    expect(result.data[0].timeAgo).toBe('just now');
  });

  it('returns "N minutes ago" for notifications created within the last hour', async () => {
    const recent = { ...MOCK_NOTIFICATION, createdAt: new Date(Date.now() - 5 * 60_000) };
    mp.notification.findMany.mockResolvedValue([recent]);
    mp.notification.count.mockResolvedValue(1);

    const result = await notificationService.getForUser('user-1', { page: 1, limit: 20 });
    expect(result.data[0].timeAgo).toMatch(/^\d+ minutes? ago$/);
  });

  it('returns "N hours ago" for notifications created within the last day', async () => {
    const recent = { ...MOCK_NOTIFICATION, createdAt: new Date(Date.now() - 3 * 3_600_000) };
    mp.notification.findMany.mockResolvedValue([recent]);
    mp.notification.count.mockResolvedValue(1);

    const result = await notificationService.getForUser('user-1', { page: 1, limit: 20 });
    expect(result.data[0].timeAgo).toMatch(/^\d+ hours? ago$/);
  });
});

// ── send() ─────────────────────────────────────────────────────────────────────

describe('notificationService.send()', () => {
  it('creates an in-app notification record when no preference is set', async () => {
    await notificationService.send({
      userId:  'user-1',
      type:    'COMPLAINT_ASSIGNED',
      title:   'New Complaint',
      message: 'A complaint was raised',
    });

    expect(mp.notification.create).toHaveBeenCalledOnce();
    expect(mp.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'COMPLAINT_ASSIGNED' }),
      }),
    );
  });

  it('queues email when explicit channels include "email"', async () => {
    await notificationService.send({
      userId:   'user-1',
      type:     'PAYMENT_RECEIVED',
      title:    'Invoice Paid',
      message:  'UGX 1,000,000 received',
      channels: ['inApp', 'email'],
    });

    expect(mq.sendEmail).toHaveBeenCalledOnce();
    expect(mq.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: MOCK_USER.email, subject: 'Invoice Paid' }),
    );
  });

  it('does NOT queue email when explicit channels do not include "email"', async () => {
    await notificationService.send({
      userId:   'user-1',
      type:     'COMPLAINT_ASSIGNED',
      title:    'Test',
      message:  'Hello',
      channels: ['inApp'],
    });

    expect(mq.sendEmail).not.toHaveBeenCalled();
  });

  it('respects role preference — skips in-app if preference disables it', async () => {
    mp.notificationPreference.findUnique.mockResolvedValue({
      role:        'DIRECTOR',
      preferences: { COMPLAINT_ASSIGNED: { inApp: false, email: false, sms: false } },
    });

    await notificationService.send({
      userId:  'user-1',
      type:    'COMPLAINT_ASSIGNED',
      title:   'Test',
      message: 'Hello',
    });

    expect(mp.notification.create).not.toHaveBeenCalled();
    expect(mq.sendEmail).not.toHaveBeenCalled();
  });

  it('silently returns if user does not exist', async () => {
    mp.user.findUnique.mockResolvedValue(null);

    await expect(
      notificationService.send({ userId: 'ghost', type: 'X', title: 'X', message: 'X' }),
    ).resolves.toBeUndefined();

    expect(mp.notification.create).not.toHaveBeenCalled();
  });
});

// ── sendToRole() ───────────────────────────────────────────────────────────────

describe('notificationService.sendToRole()', () => {
  it('sends a notification to every user with the given role', async () => {
    const users = [
      { ...MOCK_USER, id: 'user-1' },
      { ...MOCK_USER, id: 'user-2' },
    ];
    mp.user.findMany.mockResolvedValue(users);

    await notificationService.sendToRole({
      role:    'DIRECTOR',
      type:    'ATTENDANCE_ALERT',
      title:   'Absent Guards',
      message: '3 guards absent today',
    });

    // Two users => notification.create called twice
    expect(mp.notification.create).toHaveBeenCalledTimes(2);
  });
});

// ── getForUser() ───────────────────────────────────────────────────────────────

describe('notificationService.getForUser()', () => {
  it('returns paginated notifications with hasNext and hasPrev flags', async () => {
    mp.notification.count.mockResolvedValue(25);
    mp.notification.findMany.mockResolvedValue([MOCK_NOTIFICATION]);

    const result = await notificationService.getForUser('user-1', { page: 2, limit: 10 });

    expect(result.pagination.total).toBe(25);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.hasNext).toBe(true);  // page 2 of 3
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'notif-1', type: 'COMPLAINT_ASSIGNED' });
  });

  it('filters by isRead when provided', async () => {
    await notificationService.getForUser('user-1', { page: 1, limit: 20, isRead: false });

    expect(mp.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
    );
  });
});

// ── markAsRead() ───────────────────────────────────────────────────────────────

describe('notificationService.markAsRead()', () => {
  it('marks a notification as read when the user owns it', async () => {
    await notificationService.markAsRead('notif-1', 'user-1');

    expect(mp.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-1' },
        data:  expect.objectContaining({ isRead: true }),
      }),
    );
  });

  it('does nothing if the notification belongs to a different user', async () => {
    mp.notification.findUnique.mockResolvedValue({ ...MOCK_NOTIFICATION, userId: 'user-2' });

    await notificationService.markAsRead('notif-1', 'user-1');

    expect(mp.notification.update).not.toHaveBeenCalled();
  });
});

// ── markAllAsRead() ────────────────────────────────────────────────────────────

describe('notificationService.markAllAsRead()', () => {
  it('bulk-updates all unread notifications for the user', async () => {
    await notificationService.markAllAsRead('user-1');

    expect(mp.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isRead: false },
        data:  expect.objectContaining({ isRead: true }),
      }),
    );
  });
});

// ── getUnreadCount() ───────────────────────────────────────────────────────────

describe('notificationService.getUnreadCount()', () => {
  it('returns the count of unread notifications for the user', async () => {
    mp.notification.count.mockResolvedValue(7);

    const count = await notificationService.getUnreadCount('user-1');

    expect(count).toBe(7);
    expect(mp.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
  });
});
