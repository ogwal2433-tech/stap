import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateLeaveRequestSchema } from '@stap/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    user:         { findUnique: vi.fn() },
    guard:        { findUnique: vi.fn() },
    leaveRequest: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined), sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/guardService', () => ({ guardService: {} }));

import prisma from '../../db/prisma';
import { hrService } from '../../services/hrService';

const db = prisma as unknown as {
  user:         { findUnique: ReturnType<typeof vi.fn> };
  guard:        { findUnique: ReturnType<typeof vi.fn> };
  leaveRequest: {
    findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>;
  };
};

const STAFF = { id: 'u1', name: 'Sarah Nakato', role: 'CONTROL_ROOM', status: 'ACTIVE' };
const GUARD = { id: 'g1', firstName: 'Moses', lastName: 'Okot' };

const created = (o: Record<string, unknown> = {}) => ({
  id: 'lr1', guardId: null, userId: 'u1',
  guard: null, user: { id: 'u1', name: 'Sarah Nakato', role: 'CONTROL_ROOM', jobTitle: 'CONTROLLER' },
  type: 'ANNUAL',
  startDate: new Date('2026-10-01'), endDate: new Date('2026-10-07'),
  daysRequested: 6, reason: 'Family commitments abroad', status: 'PENDING',
  approver: null, approvedAt: null, rejectionReason: null, createdAt: new Date(),
  ...o,
});

const input = (o: Record<string, unknown> = {}) => ({
  userId: 'u1', guardId: null, type: 'ANNUAL',
  startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-07T00:00:00.000Z',
  reason: 'Family commitments abroad', ...o,
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(STAFF);
  db.guard.findUnique.mockResolvedValue(GUARD);
  db.leaveRequest.findFirst.mockResolvedValue(null);
  db.leaveRequest.create.mockResolvedValue(created());
});

describe('the schema takes exactly one subject', () => {
  const parse = (o: Record<string, unknown>) =>
    CreateLeaveRequestSchema.safeParse({
      type: 'ANNUAL', startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-07T00:00:00.000Z', reason: 'Family commitments abroad', ...o,
    });

  it('accepts a guard', () => expect(parse({ guardId: 'g1' }).success).toBe(true));
  it('accepts a staff member', () => expect(parse({ userId: 'u1' }).success).toBe(true));
  it('rejects both', () => expect(parse({ guardId: 'g1', userId: 'u1' }).success).toBe(false));
  it('rejects neither', () => expect(parse({}).success).toBe(false));

  it('accepts the leave types staff need', () => {
    for (const type of ['COMPASSIONATE', 'STUDY', 'UNPAID']) {
      expect(parse({ userId: 'u1', type }).success).toBe(true);
    }
  });

  it('keeps EMERGENCY, which the leave balance still reports', () => {
    expect(parse({ userId: 'u1', type: 'EMERGENCY' }).success).toBe(true);
  });

  it('rejects an end date before the start', () => {
    expect(parse({
      userId: 'u1', startDate: '2026-10-07T00:00:00.000Z', endDate: '2026-10-01T00:00:00.000Z',
    }).success).toBe(false);
  });
});

describe('requestLeave for a staff member', () => {
  it('stores the user and leaves the guard column empty', async () => {
    await hrService.requestLeave(input(), 'admin');
    const { data } = db.leaveRequest.create.mock.calls[0]![0];
    expect(data.userId).toBe('u1');
    expect(data.guardId).toBeNull();
  });

  it('counts working days rather than calendar days', async () => {
    // 1–7 October 2026 spans one Sunday, so six days count against leave.
    await hrService.requestLeave(input(), 'admin');
    const { data } = db.leaveRequest.create.mock.calls[0]![0];
    expect(data.daysRequested).toBe(6);
  });

  it('refuses a guard login masquerading as staff', async () => {
    // A guard's leave belongs against their guard record, where entitlement and
    // deployment history live.
    db.user.findUnique.mockResolvedValue({ ...STAFF, role: 'GUARD' });
    await expect(hrService.requestLeave(input(), 'admin')).rejects.toThrow(/guard record/i);
  });

  it('refuses an inactive staff account', async () => {
    db.user.findUnique.mockResolvedValue({ ...STAFF, status: 'INACTIVE' });
    await expect(hrService.requestLeave(input(), 'admin')).rejects.toThrow(/not active/i);
  });

  it('refuses an unknown staff member', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(hrService.requestLeave(input(), 'admin')).rejects.toThrow(/not found/i);
  });

  it('names the staff member in the approval notification', async () => {
    const { notificationService } = await import('../../services/notificationService');
    await hrService.requestLeave(input(), 'admin');
    expect(notificationService.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Sarah Nakato') }),
    );
  });
});

describe('overlap is checked per subject', () => {
  it('looks at the staff member, not a guard', async () => {
    await hrService.requestLeave(input(), 'admin');
    const { where } = db.leaveRequest.findFirst.mock.calls[0]![0];
    expect(where.userId).toBe('u1');
    expect(where.guardId).toBeUndefined();
  });

  it('counts pending as well as approved', async () => {
    // Two requests over the same dates is one mistake made twice; catching it
    // at entry beats an approver finding the clash later.
    await hrService.requestLeave(input(), 'admin');
    const { where } = db.leaveRequest.findFirst.mock.calls[0]![0];
    expect(where.status).toEqual({ in: ['PENDING', 'APPROVED'] });
  });

  it('refuses an overlap and says which kind it clashed with', async () => {
    db.leaveRequest.findFirst.mockResolvedValue({ status: 'PENDING' });
    await expect(hrService.requestLeave(input(), 'admin'))
      .rejects.toThrow(/Sarah Nakato already has pending leave/i);
  });

  it('keys on the guard for a guard request', async () => {
    await hrService.requestLeave(input({ userId: null, guardId: 'g1' }), 'admin');
    const { where } = db.leaveRequest.findFirst.mock.calls[0]![0];
    expect(where.guardId).toBe('g1');
    expect(where.userId).toBeUndefined();
  });
});

describe('the response says who it is for', () => {
  it('reads STAFF from the record rather than a stored flag', async () => {
    const result = await hrService.requestLeave(input(), 'admin');
    expect(result.applicantType).toBe('STAFF');
    expect(result.applicantId).toBe('u1');
    expect(result.applicantName).toBe('Sarah Nakato');
    expect(result.staff?.jobTitle).toBe('CONTROLLER');
    expect(result.guard).toBeNull();
  });

  it('reads GUARD for a guard request', async () => {
    db.leaveRequest.create.mockResolvedValue(created({
      guardId: 'g1', userId: null,
      guard: { id: 'g1', firstName: 'Moses', lastName: 'Okot' }, user: null,
    }));
    const result = await hrService.requestLeave(input({ userId: null, guardId: 'g1' }), 'admin');
    expect(result.applicantType).toBe('GUARD');
    expect(result.applicantName).toBe('Moses Okot');
    expect(result.staff).toBeNull();
  });
});

describe('listing narrows by kind', () => {
  beforeEach(() => {
    db.leaveRequest.findMany.mockResolvedValue([]);
    db.leaveRequest.count.mockResolvedValue(0);
  });

  it('STAFF asks for rows that carry a user', async () => {
    await hrService.listLeaveRequests({ applicantType: 'STAFF', page: 1, limit: 20 });
    expect(db.leaveRequest.findMany.mock.calls[0]![0].where.userId).toEqual({ not: null });
  });

  it('GUARD asks for rows that carry a guard', async () => {
    await hrService.listLeaveRequests({ applicantType: 'GUARD', page: 1, limit: 20 });
    expect(db.leaveRequest.findMany.mock.calls[0]![0].where.guardId).toEqual({ not: null });
  });

  it('no filter asks for everyone', async () => {
    await hrService.listLeaveRequests({ page: 1, limit: 20 });
    const { where } = db.leaveRequest.findMany.mock.calls[0]![0];
    expect(where.userId).toBeUndefined();
    expect(where.guardId).toBeUndefined();
  });
});
