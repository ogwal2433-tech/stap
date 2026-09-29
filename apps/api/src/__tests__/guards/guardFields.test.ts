import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@security360/shared';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    guardRelative:  { createMany: vi.fn(), deleteMany: vi.fn() },
    guardAssociate: { createMany: vi.fn(), deleteMany: vi.fn() },
    disciplinaryRecord: { create: vi.fn() },
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
import { guardService } from '../../services/guardService';

const mp = prisma as any;

// ── Base fixtures ──────────────────────────────────────────────────────────────

const baseGuard = {
  id: 'g1',
  firstName: 'John',
  lastName: 'Doe',
  otherNames: null,
  nationalId: 'CM90210',
  isIncompleteNID: false,
  phone: '+256700000001',
  photoUrl: null,
  dateOfBirth: new Date('1990-01-01'),
  nextOfKinName: 'Jane',
  nextOfKinPhone: '+256700000002',
  bankName: null,
  accountNumber: null,
  salaryRate: 450000,
  employmentStatus: 'ACTIVE' as const,
  contractStart: new Date('2026-01-01'),
  contractEnd: null,
  psoCertNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  rank: 'GUARD',
  contractType: 'PERMANENT',
  probationStatus: 'ON_PROBATION',
  probationEndDate: null,
  reinstatedCount: 0,
  lastReinstatedAt: null,
  lastReinstatedBy: null,
  incrementCount: 0,
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
  relatives: [],
  associates: [],
  _count: { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
};

const guardWithRelations = {
  ...baseGuard,
  documents: [],
  deploymentHistory: [],
  disciplinaryRecords: [],
};

const baseInput = {
  firstName: 'John',
  lastName: 'Doe',
  nationalId: 'CM90210',
  phone: '+256700000001',
  dateOfBirth: '1990-01-01T00:00:00.000Z',
  nextOfKinName: 'Jane',
  nextOfKinPhone: '+256700000002',
  salaryRate: 450000,
  contractStart: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.update.mockResolvedValue({});
  mp.guard.count.mockResolvedValue(0);
});

// ── create(): rank field ───────────────────────────────────────────────────────

describe('guardService.create() — rank field', () => {
  beforeEach(() => {
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(guardWithRelations);
  });

  it('saves rank = CORPORAL when provided', async () => {
    mp.guard.create.mockResolvedValue({ ...baseGuard, rank: 'CORPORAL' });

    await guardService.create({ ...baseInput, rank: 'CORPORAL' }, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.rank).toBe('CORPORAL');
  });

  it('defaults rank to GUARD when not provided', async () => {
    mp.guard.create.mockResolvedValue({ ...baseGuard, rank: 'GUARD' });

    await guardService.create(baseInput, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.rank).toBe('GUARD');
  });
});

// ── create(): contractType field ───────────────────────────────────────────────

describe('guardService.create() — contractType field', () => {
  beforeEach(() => {
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(guardWithRelations);
  });

  it('saves contractType = TEMPORARY when provided', async () => {
    mp.guard.create.mockResolvedValue({ ...baseGuard, contractType: 'TEMPORARY' });

    await guardService.create({ ...baseInput, contractType: 'TEMPORARY' }, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.contractType).toBe('TEMPORARY');
  });

  it('defaults contractType to PERMANENT when not provided', async () => {
    mp.guard.create.mockResolvedValue({ ...baseGuard, contractType: 'PERMANENT' });

    await guardService.create(baseInput, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.contractType).toBe('PERMANENT');
  });
});

// ── create(): isIncompleteNID flag ─────────────────────────────────────────────

describe('guardService.create() — isIncompleteNID flag', () => {
  it('sets isIncompleteNID = true when nationalId is not provided', async () => {
    mp.guard.findUnique
      .mockResolvedValueOnce(guardWithRelations); // getById (no NID check when nationalId absent)
    mp.guard.create.mockResolvedValue({ ...baseGuard, nationalId: null, isIncompleteNID: true });

    const { nationalId: _nid, ...inputWithoutNid } = baseInput;
    await guardService.create(inputWithoutNid, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.isIncompleteNID).toBe(true);
  });

  it('sets isIncompleteNID = false when nationalId is provided', async () => {
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(guardWithRelations);
    mp.guard.create.mockResolvedValue({ ...baseGuard, isIncompleteNID: false });

    await guardService.create(baseInput, 'user1');

    const createData = mp.guard.create.mock.calls[0][0].data;
    expect(createData.isIncompleteNID).toBe(false);
  });
});

// ── list(): rank filter ────────────────────────────────────────────────────────

describe('guardService.list() — filters', () => {
  beforeEach(() => {
    mp.guard.findMany.mockResolvedValue([]);
    mp.guard.count.mockResolvedValue(0);
  });

  it('filters by rank when rank param provided', async () => {
    await guardService.list(
      { page: 1, limit: 20, rank: 'CORPORAL', sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.rank).toBe('CORPORAL');
  });

  it('filters by contractType when contractType param provided', async () => {
    await guardService.list(
      { page: 1, limit: 20, contractType: 'TEMPORARY', sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.contractType).toBe('TEMPORARY');
  });

  it('filters by isIncompleteNID = true when isIncompleteNID param is true', async () => {
    await guardService.list(
      { page: 1, limit: 20, isIncompleteNID: true, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.isIncompleteNID).toBe(true);
  });

  it('filters by isIncompleteNID = false when isIncompleteNID param is false', async () => {
    await guardService.list(
      { page: 1, limit: 20, isIncompleteNID: false, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.isIncompleteNID).toBe(false);
  });

  it('does not set rank filter when rank param is absent', async () => {
    await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.rank).toBeUndefined();
  });

  it('does not set contractType filter when contractType param is absent', async () => {
    await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const where = mp.guard.findMany.mock.calls[0][0].where;
    expect(where.contractType).toBeUndefined();
  });
});
