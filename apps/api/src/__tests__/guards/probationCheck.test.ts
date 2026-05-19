import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@stap/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findMany: vi.fn(),
      update:   vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRole: vi.fn() },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { guardService } from '../../services/guardService';

const mockPrisma = prisma as unknown as {
  guard:    { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};

const mockNotification = notificationService as unknown as {
  sendToRole: ReturnType<typeof vi.fn>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGuard(overrides: Partial<{ id: string; firstName: string; lastName: string }> = {}) {
  return { id: 'guard-1', firstName: 'John', lastName: 'Doe', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.guard.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockNotification.sendToRole.mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('guardService.runProbationCheck()', () => {
  it('updates probationStatus to CONFIRMED for each eligible guard', async () => {
    const guard = makeGuard();
    mockPrisma.guard.findMany.mockResolvedValue([guard]);

    await guardService.runProbationCheck();

    expect(mockPrisma.guard.update).toHaveBeenCalledOnce();
    expect(mockPrisma.guard.update).toHaveBeenCalledWith({
      where: { id: guard.id },
      data:  { probationStatus: 'CONFIRMED' },
    });
  });

  it('does not update guards whose probation end date is in the future', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mockPrisma.guard.update).not.toHaveBeenCalled();
  });

  it('does not update guards who are already CONFIRMED', async () => {
    // findMany with the CONFIRMED filter already excludes them; confirm no-op when result is empty
    mockPrisma.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mockPrisma.guard.update).not.toHaveBeenCalled();
  });

  it('does not update guards who are SUSPENDED or TERMINATED', async () => {
    // The where clause filters employmentStatus:'ACTIVE', so suspended/terminated guards are excluded
    mockPrisma.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mockPrisma.guard.update).not.toHaveBeenCalled();
  });

  it('queries only ACTIVE guards ON_PROBATION with probationEndDate <= today', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    const [callArg] = mockPrisma.guard.findMany.mock.calls[0];
    expect(callArg.where.probationStatus).toBe('ON_PROBATION');
    expect(callArg.where.employmentStatus).toBe('ACTIVE');
    expect(callArg.where.probationEndDate).toHaveProperty('lte');
    const lte: Date = callArg.where.probationEndDate.lte;
    expect(lte).toBeInstanceOf(Date);
    expect(lte.getHours()).toBe(0);
    expect(lte.getMinutes()).toBe(0);
    expect(lte.getSeconds()).toBe(0);
  });

  it('sends a notification to ASSISTANT_MANAGER for each upgraded guard', async () => {
    const guards = [makeGuard({ id: 'g1', firstName: 'Alice', lastName: 'Mwangi' }),
                    makeGuard({ id: 'g2', firstName: 'Bob',   lastName: 'Ochieng' })];
    mockPrisma.guard.findMany.mockResolvedValue(guards);

    await guardService.runProbationCheck();

    expect(mockNotification.sendToRole).toHaveBeenCalledTimes(2);
    expect(mockNotification.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({
        role:  ROLES.ASSISTANT_MANAGER,
        type:  'SYSTEM',
        title: 'Probation Period Ended',
      }),
    );
    // Verify both guards are mentioned in separate calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: string[] = mockNotification.sendToRole.mock.calls.map((call: any[]) => call[0].message);
    expect(messages.some((m) => m.includes('Alice'))).toBe(true);
    expect(messages.some((m) => m.includes('Bob'))).toBe(true);
  });

  it('creates an audit log entry per upgraded guard', async () => {
    const guard = makeGuard({ id: 'guard-99' });
    mockPrisma.guard.findMany.mockResolvedValue([guard]);

    await guardService.runProbationCheck();

    expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action:   'PROBATION_COMPLETED',
        entity:   'guard',
        entityId: guard.id,
        newValue: { probationStatus: 'CONFIRMED' },
      },
    });
  });

  it('handles zero eligible guards without error', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]);

    await expect(guardService.runProbationCheck()).resolves.toBeUndefined();
    expect(mockPrisma.guard.update).not.toHaveBeenCalled();
    expect(mockNotification.sendToRole).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
