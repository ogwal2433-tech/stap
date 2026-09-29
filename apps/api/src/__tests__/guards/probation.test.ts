import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@security360/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      count:      vi.fn(),
    },
    guardRelative:  { createMany: vi.fn(), deleteMany: vi.fn() },
    guardAssociate: { createMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/settingsService', () => ({
  settingsService: { get: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { guardService } from '../../services/guardService';

const mp = prisma as any;
const mockNotif = notificationService as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CONTRACT_START = new Date('2026-01-15');

const baseGuard = {
  id: 'g1',
  firstName: 'Alice',
  lastName: 'Mwangi',
  otherNames: null,
  nationalId: 'CM12345',
  isIncompleteNID: false,
  phone: '+256700000001',
  photoUrl: null,
  dateOfBirth: new Date('1995-01-01'),
  nextOfKinName: 'Bob',
  nextOfKinPhone: '+256700000002',
  bankName: null,
  accountNumber: null,
  salaryRate: 400000,
  employmentStatus: 'ACTIVE' as const,
  contractStart: CONTRACT_START,
  contractEnd: null,
  psoCertNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  rank: 'GUARD',
  contractType: 'PERMANENT',
  probationStatus: 'ON_PROBATION',
  probationEndDate: null,
  reinstatedCount: 0, lastReinstatedAt: null, lastReinstatedBy: null,
  incrementCount: 0, lastIncrementDate: null,
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
  relatives: [], associates: [],
  _count: { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
};

const baseInput = {
  firstName: 'Alice',
  lastName:  'Mwangi',
  nationalId: 'CM12345',
  phone:      '+256700000001',
  dateOfBirth: '1995-01-01T00:00:00.000Z',
  nextOfKinName:  'Bob',
  nextOfKinPhone: '+256700000002',
  salaryRate: 400000,
  contractStart: CONTRACT_START.toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.update.mockResolvedValue({});
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);
});

// ── create(): probation date calculation ───────────────────────────────────────

describe('guardService.create() — probationEndDate', () => {
  it('sets probationEndDate to exactly 6 months after contractStart', async () => {
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseGuard, documents: [], deploymentHistory: [], disciplinaryRecords: [] });
    mp.guard.create.mockResolvedValue({ ...baseGuard });

    await guardService.create(baseInput, 'user1');

    // update() is called to set probationEndDate
    const updateCall = mp.guard.update.mock.calls[0][0];
    const probEnd: Date = updateCall.data.probationEndDate;
    expect(probEnd).toBeInstanceOf(Date);

    const expected = new Date(CONTRACT_START);
    expected.setMonth(expected.getMonth() + 6);
    expect(probEnd.getFullYear()).toBe(expected.getFullYear());
    expect(probEnd.getMonth()).toBe(expected.getMonth());
    expect(probEnd.getDate()).toBe(expected.getDate());
  });

  it('probationEndDate is 6 months from contractStart across a year boundary', async () => {
    const octStart = '2026-10-01T00:00:00.000Z';
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseGuard, contractStart: new Date(octStart), documents: [], deploymentHistory: [], disciplinaryRecords: [] });
    mp.guard.create.mockResolvedValue({ ...baseGuard, contractStart: new Date(octStart) });

    await guardService.create({ ...baseInput, contractStart: octStart }, 'user1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    const probEnd: Date = updateCall.data.probationEndDate;
    // Oct 2026 + 6 months = Apr 2027
    expect(probEnd.getFullYear()).toBe(2027);
    expect(probEnd.getMonth()).toBe(3); // April = index 3
  });
});

// ── runProbationCheck() ────────────────────────────────────────────────────────

describe('guardService.runProbationCheck()', () => {
  function makeGuard(overrides: Partial<{ id: string; firstName: string; lastName: string }> = {}) {
    return { id: 'g-prob-1', firstName: 'John', lastName: 'Doe', ...overrides };
  }

  it('upgrades ON_PROBATION guard past end date to CONFIRMED', async () => {
    const guard = makeGuard();
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runProbationCheck();

    expect(mp.guard.update).toHaveBeenCalledWith({
      where: { id: guard.id },
      data:  { probationStatus: 'CONFIRMED' },
    });
  });

  it('skips guard with future probation end date (returns none from DB)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips already CONFIRMED guard (DB filter excludes them)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips SUSPENDED guard (DB filter requires employmentStatus=ACTIVE)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('skips TERMINATED guard (DB filter requires employmentStatus=ACTIVE)', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    expect(mp.guard.update).not.toHaveBeenCalled();
  });

  it('queries only ACTIVE guards ON_PROBATION with probationEndDate <= today', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await guardService.runProbationCheck();

    const [callArg] = mp.guard.findMany.mock.calls[0];
    expect(callArg.where.probationStatus).toBe('ON_PROBATION');
    expect(callArg.where.employmentStatus).toBe('ACTIVE');
    expect(callArg.where.probationEndDate).toHaveProperty('lte');
    const lte: Date = callArg.where.probationEndDate.lte;
    expect(lte).toBeInstanceOf(Date);
    expect(lte.getHours()).toBe(0);
    expect(lte.getSeconds()).toBe(0);
  });

  it('sends notification per upgraded guard', async () => {
    const guards = [
      makeGuard({ id: 'g1', firstName: 'Alice', lastName: 'A' }),
      makeGuard({ id: 'g2', firstName: 'Bob',   lastName: 'B' }),
    ];
    mp.guard.findMany.mockResolvedValue(guards);

    await guardService.runProbationCheck();

    expect(mockNotif.sendToRole).toHaveBeenCalledTimes(2);
    expect(mockNotif.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: ROLES.ASSISTANT_MANAGER, title: 'Probation Period Ended' }),
    );
    const messages: string[] = mockNotif.sendToRole.mock.calls.map((c: any[]) => c[0].message);
    expect(messages.some((m) => m.includes('Alice'))).toBe(true);
    expect(messages.some((m) => m.includes('Bob'))).toBe(true);
  });

  it('creates audit log entry per upgraded guard', async () => {
    const guard = makeGuard({ id: 'g-99' });
    mp.guard.findMany.mockResolvedValue([guard]);

    await guardService.runProbationCheck();

    expect(mp.auditLog.create).toHaveBeenCalledOnce();
    expect(mp.auditLog.create).toHaveBeenCalledWith({
      data: {
        action:   'PROBATION_COMPLETED',
        entity:   'guard',
        entityId: guard.id,
        newValue: { probationStatus: 'CONFIRMED' },
      },
    });
  });

  it('runs without error when 0 guards are eligible', async () => {
    mp.guard.findMany.mockResolvedValue([]);

    await expect(guardService.runProbationCheck()).resolves.toBeUndefined();
    expect(mp.guard.update).not.toHaveBeenCalled();
    expect(mockNotif.sendToRole).not.toHaveBeenCalled();
    expect(mp.auditLog.create).not.toHaveBeenCalled();
  });
});
