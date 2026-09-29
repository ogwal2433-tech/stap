import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@security360/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    guard:               { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    disciplinaryRecord:  { create: vi.fn() },
    auditLog:            { create: vi.fn() },
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
import { NotFoundError, AppError } from '../../errors/AppError';

const mp       = prisma as any;
const mockNotif = notificationService as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeSuspendedGuard(overrides: Record<string, any> = {}) {
  return {
    id:               'g1',
    firstName:        'David',
    lastName:         'Ochieng',
    otherNames:       null,
    nationalId:       'CM90210',
    isIncompleteNID:  false,
    phone:            '+256700000001',
    photoUrl:         null,
    dateOfBirth:      new Date('1990-01-01'),
    nextOfKinName:    'Mary',
    nextOfKinPhone:   '+256700000002',
    bankName:         null,
    accountNumber:    null,
    salaryRate:       450000,
    employmentStatus: 'SUSPENDED' as const,
    contractStart:    new Date('2022-01-15'),
    contractEnd:      null,
    psoCertNumber:    null,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    rank:             'GUARD',
    contractType:     'PERMANENT',
    probationStatus:  'CONFIRMED',
    probationEndDate: null,
    reinstatedCount:   0,
    lastReinstatedAt:  null,
    lastReinstatedBy:  null,
    effectiveServiceStart: null,
    incrementCount:    3,
    lastIncrementDate: new Date('2024-01-15'),
    gender: null, tribe: null, placeOfBirth: null, educationLevel: null,
    registeredNames: null, maritalStatus: null, spouseName: null,
    spouseWorkplace: null, spouseTelephone: null, preferredPaymentContact: null,
    village: null, parish: null, subCounty: null, county: null, district: null,
    lc1Zone: null, lcOfficialName: null, lcOfficialPosition: null, lcOfficialPhone: null,
    nssfNumber: null, tinNumber: null, previousEmployer: null, previousPosition: null,
    talentsExperience: null,
    fatherName: null, fatherResidence: null, fatherVillage: null, fatherParish: null,
    fatherSubCounty: null, fatherCounty: null, fatherDistrict: null,
    fatherNationality: null, fatherOccupation: null, fatherPhone: null,
    motherName: null, motherResidence: null, motherVillage: null, motherParish: null,
    motherSubCounty: null, motherCounty: null, motherDistrict: null,
    motherNationality: null, motherOccupation: null, motherPhone: null,
    numberOfDependents: null,
    hasDisability: false, disabilityDetails: null,
    takesAlcohol: false, hasAllergies: false, allergyDetails: null,
    relatives:  [],
    associates: [],
    _count: { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
    ...overrides,
  };
}

function makeActiveGuard(overrides = {}) {
  return { ...makeSuspendedGuard({ employmentStatus: 'ACTIVE' }), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.update.mockResolvedValue(makeActiveGuard({ reinstatedCount: 1, effectiveServiceStart: new Date(), incrementCount: 0, lastIncrementDate: null }));
  mp.disciplinaryRecord.create.mockResolvedValue({});
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);
});

// ── TEST 1: Basic reinstatement ────────────────────────────────────────────────

describe('TEST 1 — basic reinstatement', () => {
  it('sets employmentStatus to ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    await guardService.reinstateGuard('g1', 'Disciplinary cleared', 'user1');
    expect(mp.guard.update.mock.calls[0][0].data.employmentStatus).toBe('ACTIVE');
  });

  it('increments reinstatedCount from the current value', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ reinstatedCount: 2 }));
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    expect(mp.guard.update.mock.calls[0][0].data.reinstatedCount).toBe(3);
  });

  it('sets lastReinstatedAt to now', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    const before = Date.now();
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    const ts = mp.guard.update.mock.calls[0][0].data.lastReinstatedAt as Date;
    expect(ts).toBeInstanceOf(Date);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before);
    expect(ts.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('sets lastReinstatedBy to the acting user', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    await guardService.reinstateGuard('g1', 'Cleared', 'admin-xyz');
    expect(mp.guard.update.mock.calls[0][0].data.lastReinstatedBy).toBe('admin-xyz');
  });
});

// ── TEST 2: effectiveServiceStart reset ───────────────────────────────────────

describe('TEST 2 — effectiveServiceStart set to today (not contractStart)', () => {
  it('sets effectiveServiceStart to a Date instance close to now', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ contractStart: new Date('2022-01-15') }));
    const before = Date.now();
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    const ess = mp.guard.update.mock.calls[0][0].data.effectiveServiceStart as Date;
    expect(ess).toBeInstanceOf(Date);
    expect(Math.abs(ess.getTime() - before)).toBeLessThan(5000);
  });

  it('effectiveServiceStart is NOT the same as original contractStart', async () => {
    const contractStart = new Date('2022-01-15');
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ contractStart }));
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    const ess = mp.guard.update.mock.calls[0][0].data.effectiveServiceStart as Date;
    expect(ess.getTime()).not.toBe(contractStart.getTime());
  });
});

// ── TEST 3: incrementCount reset ──────────────────────────────────────────────

describe('TEST 3 — incrementCount reset to 0', () => {
  it('resets incrementCount regardless of prior value', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ incrementCount: 5 }));
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    expect(mp.guard.update.mock.calls[0][0].data.incrementCount).toBe(0);
  });
});

// ── TEST 4: lastIncrementDate reset ───────────────────────────────────────────

describe('TEST 4 — lastIncrementDate reset to null', () => {
  it('resets lastIncrementDate to null', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ lastIncrementDate: new Date('2024-01-15') }));
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    expect(mp.guard.update.mock.calls[0][0].data.lastIncrementDate).toBeNull();
  });
});

// ── TEST 5: Disciplinary record ───────────────────────────────────────────────

describe('TEST 5 — disciplinaryRecord created with REINSTATEMENT type and next increment in outcome', () => {
  it('creates REINSTATEMENT record with correct fields', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    await guardService.reinstateGuard('g1', 'Case resolved.', 'user1');
    expect(mp.disciplinaryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type:      'REINSTATEMENT',
          guardId:   'g1',
          officerId: 'user1',
          reason:    'Case resolved.',
          outcome:   expect.stringContaining('20,000'),
        }),
      }),
    );
  });
});

// ── TEST 6: Audit log ─────────────────────────────────────────────────────────

describe('TEST 6 — auditLog created with old and new values', () => {
  it('creates audit log with GUARD_REINSTATED action', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ incrementCount: 3 }));
    await guardService.reinstateGuard('g1', 'Cleared.', 'user1');
    const call = mp.auditLog.create.mock.calls[0][0].data;
    expect(call.action).toBe('GUARD_REINSTATED');
    expect(call.entity).toBe('guard');
    expect(call.entityId).toBe('g1');
    expect(call.oldValue.employmentStatus).toBe('SUSPENDED');
    expect(call.oldValue.incrementCount).toBe(3);
    expect(call.newValue.incrementCount).toBe(0);
    expect(call.newValue.employmentStatus).toBe('ACTIVE');
  });
});

// ── TEST 7: Notifications ─────────────────────────────────────────────────────

describe('TEST 7 — notifications sent to OPERATIONS_SUPERVISOR and ASSISTANT_MANAGER', () => {
  it('notifies both roles', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    const roles = mockNotif.sendToRole.mock.calls.map((c: any[]) => c[0].role);
    expect(roles).toContain(ROLES.OPERATIONS_SUPERVISOR);
    expect(roles).toContain(ROLES.ASSISTANT_MANAGER);
  });

  it('notification message mentions the guard name', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    await guardService.reinstateGuard('g1', 'Cleared', 'user1');
    const msg = mockNotif.sendToRole.mock.calls[0][0].message as string;
    expect(msg).toContain('David');
    expect(msg).toContain('Ochieng');
  });
});

// ── TEST 8: Active guard rejected ────────────────────────────────────────────

describe('TEST 8 — throws 400 for ACTIVE guard', () => {
  it('throws AppError 400', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ employmentStatus: 'ACTIVE' }));
    await expect(
      guardService.reinstateGuard('g1', 'No need.', 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── TEST 9: Unknown guard ─────────────────────────────────────────────────────

describe('TEST 9 — throws 404 for unknown guard', () => {
  it('throws NotFoundError', async () => {
    mp.guard.findUnique.mockResolvedValue(null);
    await expect(
      guardService.reinstateGuard('no-such', 'Reason.', 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── TEST 10: TERMINATED guard can be reinstated ───────────────────────────────

describe('TEST 10 — TERMINATED guard can be reinstated', () => {
  it('reinstates a TERMINATED guard successfully', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ employmentStatus: 'TERMINATED' }));
    await guardService.reinstateGuard('g1', 'Termination reversed.', 'user1');
    expect(mp.guard.update.mock.calls[0][0].data.employmentStatus).toBe('ACTIVE');
  });
});

// ── TEST 11: Multiple reinstatements ─────────────────────────────────────────

describe('TEST 11 — multiple reinstatements increment reinstatedCount and reset ESS each time', () => {
  it('reinstatedCount goes from 2 → 3 and effectiveServiceStart is reset', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ reinstatedCount: 2 }));
    await guardService.reinstateGuard('g1', 'Third reinstatement.', 'user1');
    const data = mp.guard.update.mock.calls[0][0].data;
    expect(data.reinstatedCount).toBe(3);
    expect(data.effectiveServiceStart).toBeInstanceOf(Date);
    expect(data.incrementCount).toBe(0);
  });
});

// ── TEST 15: computeNextIncrementDate uses effectiveServiceStart ──────────────

describe('TEST 15 — computeNextIncrementDate uses effectiveServiceStart when set', () => {
  it('returns effectiveServiceStart + 1 year when no lastIncrementDate', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const result: string = (guardService as any).computeNextIncrementDate(
      new Date('2022-01-15'),   // contractStart (ignored when ESS is set)
      null,                     // lastIncrementDate
      sixMonthsAgo,             // effectiveServiceStart
    );

    const expected = new Date(sixMonthsAgo);
    expected.setFullYear(expected.getFullYear() + 1);
    const got = new Date(result);
    expect(got.getFullYear()).toBe(expected.getFullYear());
    expect(got.getMonth()).toBe(expected.getMonth());
    expect(got.getDate()).toBe(expected.getDate());
  });
});

// ── TEST 16: computeNextIncrementDate uses lastIncrementDate after first inc ──

describe('TEST 16 — computeNextIncrementDate uses lastIncrementDate after first increment', () => {
  it('returns lastIncrementDate + 1 year when guard has been incremented', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result: string = (guardService as any).computeNextIncrementDate(
      new Date('2020-01-01'),
      oneYearAgo,   // lastIncrementDate
      twoYearsAgo,  // effectiveServiceStart
    );

    const expected = new Date(oneYearAgo);
    expected.setFullYear(expected.getFullYear() + 1);
    expect(new Date(result).getFullYear()).toBe(expected.getFullYear());
    expect(new Date(result).getMonth()).toBe(expected.getMonth());
  });
});
