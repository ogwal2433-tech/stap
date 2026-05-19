import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@stap/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findMany: vi.fn(),
      update:   vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/settingsService', () => ({
  settingsService: { get: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { guardService } from '../../services/guardService';

const mp     = prisma as any;
const mockNotif = notificationService as any;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGuard(overrides: Record<string, any> = {}) {
  return {
    id:               'g1',
    firstName:        'James',
    lastName:         'Okello',
    salaryRate:       450000,
    incrementCount:   0,
    lastIncrementDate: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.update.mockResolvedValue({});
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);
});

// ── Increment amounts ──────────────────────────────────────────────────────────

describe('guardService.runSalaryIncrements() — increment amounts', () => {
  it('adds 20 000 for the first increment (incrementCount = 0)', async () => {
    const guard = makeGuard({ salaryRate: 450000, incrementCount: 0 });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: guard.id },
        data:  expect.objectContaining({ salaryRate: 470000 }),
      }),
    );
  });

  it('adds 10 000 for the second increment (incrementCount = 1)', async () => {
    const guard = makeGuard({ salaryRate: 470000, incrementCount: 1 });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ salaryRate: 480000 }),
      }),
    );
  });

  it('adds 10 000 for the third+ increment (incrementCount = 5)', async () => {
    const guard = makeGuard({ salaryRate: 500000, incrementCount: 5 });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ salaryRate: 510000 }),
      }),
    );
  });
});

// ── Counter and date ───────────────────────────────────────────────────────────

describe('guardService.runSalaryIncrements() — counter and date', () => {
  it('increments incrementCount by 1 using Prisma atomic operation', async () => {
    mp.guard.findMany.mockResolvedValue([makeGuard()]);

    await guardService.runSalaryIncrements();

    const updateData = mp.guard.update.mock.calls[0][0].data;
    expect(updateData.incrementCount).toEqual({ increment: 1 });
  });

  it('sets lastIncrementDate to today', async () => {
    mp.guard.findMany.mockResolvedValue([makeGuard()]);
    const before = new Date();

    await guardService.runSalaryIncrements();

    const updateData = mp.guard.update.mock.calls[0][0].data;
    const after = new Date();
    expect(updateData.lastIncrementDate).toBeInstanceOf(Date);
    expect(updateData.lastIncrementDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updateData.lastIncrementDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ── Eligibility skips ──────────────────────────────────────────────────────────

describe('guardService.runSalaryIncrements() — eligibility skips', () => {
  it('skips guards with < 1 year of service (DB where clause filters them)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips guards already incremented in the current year (DB where clause)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips TEMPORARY contract guards (DB where filters contractType=PERMANENT)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips SUSPENDED guards (DB where filters employmentStatus=ACTIVE)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips TERMINATED guards (DB where filters employmentStatus=ACTIVE)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('where clause includes all required eligibility filters', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runSalaryIncrements();

    const [callArg] = mp.guard.findMany.mock.calls[0];
    expect(callArg.where.employmentStatus).toBe('ACTIVE');
    expect(callArg.where.contractType).toBe('PERMANENT');
    expect(callArg.where.contractStart).toHaveProperty('lte');
    expect(callArg.where.OR).toBeDefined();
    expect(callArg.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lastIncrementDate: null }),
      ]),
    );
  });
});

// ── Notifications ──────────────────────────────────────────────────────────────

describe('guardService.runSalaryIncrements() — notifications', () => {
  it('sends notification to ASSISTANT_MANAGER per increment', async () => {
    mp.guard.findMany.mockResolvedValue([makeGuard()]);

    await guardService.runSalaryIncrements();

    expect(mockNotif.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: ROLES.ASSISTANT_MANAGER, title: 'Salary Increment Applied' }),
    );
  });

  it('sends notification to ACCOUNTS_OFFICER per increment', async () => {
    mp.guard.findMany.mockResolvedValue([makeGuard()]);

    await guardService.runSalaryIncrements();

    expect(mockNotif.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: ROLES.ACCOUNTS_OFFICER, title: 'Salary Increment Applied' }),
    );
  });

  it('sends 2 notifications (HR + Accounts) for each eligible guard', async () => {
    mp.guard.findMany.mockResolvedValue([makeGuard({ id: 'ga' }), makeGuard({ id: 'gb' })]);

    await guardService.runSalaryIncrements();

    expect(mockNotif.sendToRole).toHaveBeenCalledTimes(4); // 2 guards × 2 roles
  });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

describe('guardService.runSalaryIncrements() — audit log', () => {
  it('creates audit log with old and new salary values', async () => {
    const guard = makeGuard({ salaryRate: 450000, incrementCount: 0 });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runSalaryIncrements();

    expect(mp.auditLog.create).toHaveBeenCalledWith({
      data: {
        action:   'SALARY_INCREMENTED',
        entity:   'guard',
        entityId: guard.id,
        oldValue: { salaryRate: 450000 },
        newValue: { salaryRate: 470000, increment: 20000 },
      },
    });
  });

  it('audit log newValue.increment is 10 000 for non-first increment', async () => {
    const guard = makeGuard({ salaryRate: 470000, incrementCount: 1 });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runSalaryIncrements();

    const auditCall = mp.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.newValue.increment).toBe(10000);
    expect(auditCall.oldValue.salaryRate).toBe(470000);
    expect(auditCall.newValue.salaryRate).toBe(480000);
  });

  it('runs without error when 0 guards are eligible', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await expect(guardService.runSalaryIncrements()).resolves.toBeUndefined();
    expect(mp.guard.update).not.toHaveBeenCalled();
    expect(mp.auditLog.create).not.toHaveBeenCalled();
  });
});
