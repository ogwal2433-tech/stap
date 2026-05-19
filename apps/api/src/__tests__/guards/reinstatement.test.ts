import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@stap/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    disciplinaryRecord: { create: vi.fn() },
    auditLog:           { create: vi.fn() },
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

const mp      = prisma as any;
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
    contractStart:    new Date('2026-01-01'),
    contractEnd:      null,
    psoCertNumber:    null,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    rank:             'GUARD',
    contractType:     'PERMANENT',
    probationStatus:  'CONFIRMED',
    probationEndDate: null,
    reinstatedCount:  0,
    lastReinstatedAt: null,
    lastReinstatedBy: null,
    incrementCount:   0,
    lastIncrementDate: null,
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
    relatives:   [],
    associates:  [],
    _count: { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
    ...overrides,
  };
}

const reinstatedGuard = {
  ...makeSuspendedGuard(),
  employmentStatus: 'ACTIVE' as const,
  reinstatedCount:  1,
  lastReinstatedAt: new Date(),
  lastReinstatedBy: 'user1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.update.mockResolvedValue(reinstatedGuard);
  mp.disciplinaryRecord.create.mockResolvedValue({});
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);
});

// ── Status transition ──────────────────────────────────────────────────────────

describe('guardService.reinstateGuard() — status and counters', () => {
  it('sets employmentStatus to ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());

    await guardService.reinstateGuard('g1', 'Disciplinary cleared', 'user1');

    const updateData = mp.guard.update.mock.calls[0][0].data;
    expect(updateData.employmentStatus).toBe('ACTIVE');
  });

  it('increments reinstatedCount by 1 from the current value', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ reinstatedCount: 2 }));

    await guardService.reinstateGuard('g1', 'Cleared', 'user1');

    const updateData = mp.guard.update.mock.calls[0][0].data;
    expect(updateData.reinstatedCount).toBe(3);
  });

  it('sets lastReinstatedAt to a recent date', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());
    const before = new Date();

    await guardService.reinstateGuard('g1', 'Cleared', 'user1');

    const updateData = mp.guard.update.mock.calls[0][0].data;
    const after = new Date();
    expect(updateData.lastReinstatedAt).toBeInstanceOf(Date);
    expect(updateData.lastReinstatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updateData.lastReinstatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('sets lastReinstatedBy to the acting user id', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());

    await guardService.reinstateGuard('g1', 'Cleared', 'user-abc');

    const updateData = mp.guard.update.mock.calls[0][0].data;
    expect(updateData.lastReinstatedBy).toBe('user-abc');
  });
});

// ── Disciplinary record ────────────────────────────────────────────────────────

describe('guardService.reinstateGuard() — disciplinary record', () => {
  it('creates a REINSTATEMENT disciplinary record', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());

    await guardService.reinstateGuard('g1', 'Disciplinary cleared', 'user1');

    expect(mp.disciplinaryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardId: 'g1',
          type:    'REINSTATEMENT',
          reason:  'Disciplinary cleared',
        }),
      }),
    );
  });
});

// ── Error cases ────────────────────────────────────────────────────────────────

describe('guardService.reinstateGuard() — error cases', () => {
  it('throws 400 AppError when guard is already ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ employmentStatus: 'ACTIVE' }));

    await expect(
      guardService.reinstateGuard('g1', 'Reason', 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws AppError with descriptive message when guard is ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard({ employmentStatus: 'ACTIVE' }));

    await expect(
      guardService.reinstateGuard('g1', 'Reason', 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('throws NotFoundError when guard does not exist', async () => {
    mp.guard.findUnique.mockResolvedValue(null);

    await expect(
      guardService.reinstateGuard('no-such-id', 'Reason', 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── Notification ──────────────────────────────────────────────────────────────

describe('guardService.reinstateGuard() — notification', () => {
  it('sends notification to OPERATIONS_SUPERVISOR', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());

    await guardService.reinstateGuard('g1', 'Cleared', 'user1');

    expect(mockNotif.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({
        role:  ROLES.OPERATIONS_SUPERVISOR,
        type:  'SYSTEM',
        title: 'Guard Reinstated',
      }),
    );
    const [call] = mockNotif.sendToRole.mock.calls;
    expect(call[0].message).toContain('David');
    expect(call[0].message).toContain('Ochieng');
  });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

describe('guardService.reinstateGuard() — audit log', () => {
  it('creates an audit log entry with GUARD_REINSTATED action', async () => {
    mp.guard.findUnique.mockResolvedValue(makeSuspendedGuard());

    await guardService.reinstateGuard('g1', 'Cleared reason', 'user-xyz');

    expect(mp.auditLog.create).toHaveBeenCalledWith({
      data: {
        action:   'GUARD_REINSTATED',
        entity:   'guard',
        entityId: 'g1',
        newValue: { reason: 'Cleared reason', reinstatedBy: 'user-xyz' },
      },
    });
  });
});
