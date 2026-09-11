import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTrainingSessionSchema } from '@stap/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    user:            { findUnique: vi.fn(), findMany: vi.fn() },
    guard:           { findMany: vi.fn() },
    trainingSession: { create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined), sendEmail: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/guardService', () => ({ guardService: {} }));

import prisma from '../../db/prisma';
import { hrService } from '../../services/hrService';
import { notificationService } from '../../services/notificationService';

const db = prisma as unknown as {
  user:            { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  guard:           { findMany: ReturnType<typeof vi.fn> };
  trainingSession: { create: ReturnType<typeof vi.fn> };
};

const SUPERVISOR = { id: 'u-sup', name: 'James Okello', role: 'FIELD_SUPERVISOR', status: 'ACTIVE' };

const createdSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'ts1', title: 'Fire drill', description: null, location: 'HQ',
  scheduledAt: new Date('2026-10-01T09:00:00Z'), durationHours: 2, passMark: 70,
  status: 'SCHEDULED', targetGroup: 'GUARDS', facilitatorType: 'INTERNAL',
  facilitatorName: 'James Okello',
  facilitatorUser: { id: 'u-sup', name: 'James Okello' },
  attendees: [], ...overrides,
});

const input = (o: Record<string, unknown> = {}) => ({
  title: 'Fire drill', scheduledAt: '2026-10-01T09:00:00.000Z',
  durationHours: 2, passMark: 70,
  targetGroup: 'GUARDS', facilitatorType: 'INTERNAL', facilitatorUserId: 'u-sup',
  guardIds: ['g1'], staffIds: [],
  ...o,
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(SUPERVISOR);
  db.guard.findMany.mockResolvedValue([{ id: 'g1', userId: 'gu1' }]);
  db.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
  db.trainingSession.create.mockResolvedValue(createdSession());
});

describe('the schema keeps attendees and target group in step', () => {
  const parse = (o: Record<string, unknown>) =>
    CreateTrainingSessionSchema.safeParse({
      title: 'Fire drill', scheduledAt: '2026-10-01T09:00:00.000Z',
      targetGroup: 'GUARDS', facilitatorType: 'INTERNAL', facilitatorUserId: 'u-sup',
      guardIds: [], staffIds: [], ...o,
    });

  it('accepts guards on a guards session', () => {
    expect(parse({ guardIds: ['g1'] }).success).toBe(true);
  });

  it('accepts staff on a staff session', () => {
    expect(parse({ targetGroup: 'STAFF', staffIds: ['u1'] }).success).toBe(true);
  });

  it('rejects staff attendees on a guards session', () => {
    // Rejected rather than silently dropped: a session that trained nobody it
    // was told to is worse than an error.
    expect(parse({ guardIds: ['g1'], staffIds: ['u1'] }).success).toBe(false);
  });

  it('rejects guard attendees on a staff session', () => {
    expect(parse({ targetGroup: 'STAFF', staffIds: ['u1'], guardIds: ['g1'] }).success).toBe(false);
  });

  it('requires at least one attendee', () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ targetGroup: 'STAFF' }).success).toBe(false);
  });

  it('requires a chosen user for an internal facilitator', () => {
    const r = parse({ guardIds: ['g1'], facilitatorUserId: undefined });
    expect(r.success).toBe(false);
  });

  it('requires a name for an external facilitator', () => {
    expect(parse({
      guardIds: ['g1'], facilitatorType: 'EXTERNAL', facilitatorUserId: undefined,
    }).success).toBe(false);
    expect(parse({
      guardIds: ['g1'], facilitatorType: 'EXTERNAL', facilitatorUserId: undefined,
      facilitatorName: 'Dr John Smith',
    }).success).toBe(true);
  });
});

describe('createTrainingSession — facilitator', () => {
  it('no longer insists on the TRAINER role', async () => {
    // A supervisor or controller commonly runs a session. This used to throw
    // "user is not a TRAINER".
    await hrService.createTrainingSession(input(), 'admin');
    expect(db.trainingSession.create).toHaveBeenCalled();
  });

  it('copies the facilitator name so it survives a deactivated account', async () => {
    await hrService.createTrainingSession(input(), 'admin');
    const { data } = db.trainingSession.create.mock.calls[0]![0];
    expect(data.facilitatorName).toBe('James Okello');
    expect(data.facilitatorUserId).toBe('u-sup');
  });

  it('refuses a facilitator who is not active', async () => {
    db.user.findUnique.mockResolvedValue({ ...SUPERVISOR, status: 'INACTIVE' });
    await expect(hrService.createTrainingSession(input(), 'admin')).rejects.toThrow(/not an active user/i);
  });

  it('refuses a guard or a client as facilitator', async () => {
    for (const role of ['GUARD', 'CLIENT']) {
      db.user.findUnique.mockResolvedValue({ ...SUPERVISOR, role });
      await expect(hrService.createTrainingSession(input(), 'admin')).rejects.toThrow(/member of staff/i);
    }
  });

  it('stores an external facilitator by name with no user link', async () => {
    await hrService.createTrainingSession(
      input({ facilitatorType: 'EXTERNAL', facilitatorUserId: null, facilitatorName: 'Dr John Smith' }),
      'admin',
    );
    const { data } = db.trainingSession.create.mock.calls[0]![0];
    expect(data.facilitatorName).toBe('Dr John Smith');
    expect(data.facilitatorUserId).toBeNull();
    // No user lookup is needed for a guest.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('createTrainingSession — attendees', () => {
  it('creates guard attendees for a guards session', async () => {
    await hrService.createTrainingSession(input({ guardIds: ['g1'] }), 'admin');
    const { data } = db.trainingSession.create.mock.calls[0]![0];
    expect(data.attendees.create).toEqual([{ guardId: 'g1' }]);
  });

  it('creates staff attendees for a staff session', async () => {
    await hrService.createTrainingSession(
      input({ targetGroup: 'STAFF', guardIds: [], staffIds: ['u1', 'u2'] }),
      'admin',
    );
    const { data } = db.trainingSession.create.mock.calls[0]![0];
    expect(data.attendees.create).toEqual([{ userId: 'u1' }, { userId: 'u2' }]);
    expect(data.targetGroup).toBe('STAFF');
  });

  it('tolerates a repeated id rather than calling the list invalid', async () => {
    // findMany collapses duplicates, so comparing its length against the raw
    // array would reject a list that merely repeated someone.
    db.guard.findMany.mockResolvedValue([{ id: 'g1', userId: null }]);
    await hrService.createTrainingSession(input({ guardIds: ['g1', 'g1'] }), 'admin');
    const { data } = db.trainingSession.create.mock.calls[0]![0];
    expect(data.attendees.create).toEqual([{ guardId: 'g1' }]);
  });

  it('refuses a staff attendee who is not active staff', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    await expect(
      hrService.createTrainingSession(
        input({ targetGroup: 'STAFF', guardIds: [], staffIds: ['u1', 'u-nope'] }),
        'admin',
      ),
    ).rejects.toThrow(/not active staff/i);
  });

  it('notifies staff attendees directly — a staff record is an account', async () => {
    await hrService.createTrainingSession(
      input({ targetGroup: 'STAFF', guardIds: [], staffIds: ['u1', 'u2'] }),
      'admin',
    );
    expect(notificationService.send).toHaveBeenCalledTimes(2);
  });

  it('notifies only guards who have a login', async () => {
    db.guard.findMany.mockResolvedValue([
      { id: 'g1', userId: 'gu1' },
      { id: 'g2', userId: null },
    ]);
    await hrService.createTrainingSession(input({ guardIds: ['g1', 'g2'] }), 'admin');
    expect(notificationService.send).toHaveBeenCalledTimes(1);
  });
});
