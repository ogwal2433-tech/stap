import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@stap/shared';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    guardDocument: {
      count: vi.fn(),
      create: vi.fn(),
    },
    guardRelative: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    guardAssociate: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    deploymentHistory: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    disciplinaryRecord: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { guardService } from '../../services/guardService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  guard: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  guardRelative: {
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  guardAssociate: {
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  disciplinaryRecord: { create: ReturnType<typeof vi.fn> };
  deploymentHistory: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const baseGuard = {
  id: 'g1',
  firstName: 'David',
  lastName: 'Ochieng',
  otherNames: null,
  nationalId: 'CM90210',
  phone: '+256772345678',
  photoUrl: null,
  dateOfBirth: new Date('1990-03-15'),
  nextOfKinName: 'Mary',
  nextOfKinPhone: '+256701234567',
  bankName: null,
  accountNumber: null,
  salaryRate: 450000,
  employmentStatus: 'ACTIVE' as const,
  contractStart: new Date('2026-01-01'),
  contractEnd: null,
  psoCertNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
  // Vetting fields
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── list() ─────────────────────────────────────────────────────────────────────

describe('guardService.list()', () => {
  it('returns paginated results with correct structure', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([baseGuard]);
    mockPrisma.guard.count.mockResolvedValue(1);

    const result = await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].fullName).toBe('David Ochieng');
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.hasNext).toBe(false);
  });

  it('applies search filter correctly', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]);
    mockPrisma.guard.count.mockResolvedValue(0);

    await guardService.list(
      { page: 1, limit: 20, search: 'david', sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const whereArg = mockPrisma.guard.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(whereArg.OR.length).toBeGreaterThan(0);
  });

  it('applies status filter correctly', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]);
    mockPrisma.guard.count.mockResolvedValue(0);

    await guardService.list(
      { page: 1, limit: 20, status: 'ACTIVE', sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    const whereArg = mockPrisma.guard.findMany.mock.calls[0][0].where;
    expect(whereArg.employmentStatus).toBe('ACTIVE');
  });
});

// ── getById() ──────────────────────────────────────────────────────────────────

describe('guardService.getById()', () => {
  const guardWithRelations = {
    ...baseGuard,
    documents: [],
    deploymentHistory: [],
  };

  it('returns guard with related data', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue(guardWithRelations);
    const result = await guardService.getById('g1', ROLES.DIRECTOR);
    expect(result.id).toBe('g1');
    expect(result.fullName).toBe('David Ochieng');
  });

  it('throws NotFoundError for unknown id', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue(null);
    await expect(guardService.getById('missing', ROLES.DIRECTOR)).rejects.toThrow(NotFoundError);
  });

  it('excludes accountNumber for non-privileged roles', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue({
      ...guardWithRelations,
      accountNumber: 'ACC123',
    });
    const result = await guardService.getById('g1', ROLES.ACCOUNTS_OFFICER);
    expect(result.accountNumber).toBeUndefined();
  });

  it('includes accountNumber for DIRECTOR role', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue({
      ...guardWithRelations,
      accountNumber: '[ENCRYPTED]',
    });
    const result = await guardService.getById('g1', ROLES.DIRECTOR);
    expect(result.accountNumber).toBe('[ENCRYPTED]');
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('guardService.create()', () => {
  const input = {
    firstName: 'David',
    lastName: 'Ochieng',
    nationalId: 'CM90210',
    phone: '+256772345678',
    dateOfBirth: '1990-03-15T00:00:00.000Z',
    nextOfKinName: 'Mary',
    nextOfKinPhone: '+256701234567',
    salaryRate: 450000,
    contractStart: '2026-01-01T00:00:00.000Z',
  };

  it('creates guard and enqueues audit log', async () => {
    // First findUnique: duplicate nationalId check → null (no conflict)
    // Second findUnique: getById() called after create → return full guard
    mockPrisma.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseGuard, documents: [], deploymentHistory: [] });
    mockPrisma.guard.create.mockResolvedValue({ ...baseGuard });

    const result = await guardService.create(input, 'user1');
    expect(result.id).toBe('g1');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GUARD_CREATED' }),
    );
  });

  it('throws 409 on duplicate nationalId', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(guardService.create(input, 'user1')).rejects.toThrow(AppError);
    await expect(guardService.create(input, 'user1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('guardService.update()', () => {
  it('updates guard and enqueues audit log with oldValue', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue(baseGuard);
    mockPrisma.guard.update.mockResolvedValue({ ...baseGuard, firstName: 'Dave' });

    await guardService.update('g1', { firstName: 'Dave' }, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GUARD_UPDATED',
        oldValue: expect.objectContaining({ firstName: 'David' }),
      }),
    );
  });
});

// ── updateStatus() ────────────────────────────────────────────────────────────

describe('guardService.updateStatus()', () => {
  it('TERMINATED sets contractEnd if not already set', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue({ ...baseGuard, contractEnd: null });
    mockPrisma.guard.update.mockResolvedValue({ ...baseGuard, employmentStatus: 'TERMINATED' });
    mockPrisma.disciplinaryRecord.create.mockResolvedValue({});

    await guardService.updateStatus('g1', 'TERMINATED', 'Contract ended', 'user1');

    const updateArg = mockPrisma.guard.update.mock.calls[0][0];
    expect(updateArg.data.contractEnd).toBeDefined();
  });

  it('creates disciplinaryRecord on SUSPENDED', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue(baseGuard);
    mockPrisma.guard.update.mockResolvedValue({ ...baseGuard, employmentStatus: 'SUSPENDED' });
    mockPrisma.disciplinaryRecord.create.mockResolvedValue({});

    await guardService.updateStatus('g1', 'SUSPENDED', 'Misconduct', 'user1');

    expect(mockPrisma.disciplinaryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SUSPENSION', reason: 'Misconduct' }),
      }),
    );
  });
});

// ── sanitiseGuard() via list ───────────────────────────────────────────────────

describe('guardService sanitiseGuard()', () => {
  it('computes fullName correctly with otherNames', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([
      { ...baseGuard, otherNames: 'Junior' },
    ]);
    mockPrisma.guard.count.mockResolvedValue(1);

    const result = await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    expect(result.data[0].fullName).toBe('David Junior Ochieng');
  });

  it('computes fullName correctly without otherNames', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([baseGuard]);
    mockPrisma.guard.count.mockResolvedValue(1);

    const result = await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    expect(result.data[0].fullName).toBe('David Ochieng');
  });

  it('maps new vetting fields to response', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([
      { ...baseGuard, gender: 'MALE', tribe: 'Muganda', educationLevel: 'O_LEVEL', district: 'Kampala' },
    ]);
    mockPrisma.guard.count.mockResolvedValue(1);

    const result = await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    expect(result.data[0].gender).toBe('MALE');
    expect(result.data[0].tribe).toBe('Muganda');
    expect(result.data[0].educationLevel).toBe('O_LEVEL');
    expect(result.data[0].district).toBe('Kampala');
  });

  it('returns empty arrays for relatives and associates when none exist', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([{ ...baseGuard, relatives: [], associates: [] }]);
    mockPrisma.guard.count.mockResolvedValue(1);

    const result = await guardService.list(
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      ROLES.DIRECTOR,
    );

    expect(result.data[0].relatives).toEqual([]);
    expect(result.data[0].associates).toEqual([]);
  });
});

// ── create() — extended vetting fields ────────────────────────────────────────

describe('guardService.create() — extended vetting fields', () => {
  const baseInput = {
    firstName: 'David',
    lastName: 'Ochieng',
    nationalId: 'CM90210',
    phone: '+256772345678',
    dateOfBirth: '1990-03-15T00:00:00.000Z',
    nextOfKinName: 'Mary',
    nextOfKinPhone: '+256701234567',
    salaryRate: 450000,
    contractStart: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    // create() calls getById() to return the final guard
    mockPrisma.guard.findUnique
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce({ ...baseGuard, relatives: [], associates: [], documents: [], deploymentHistory: [] }); // getById re-fetch
  });

  it('saves gender, tribe, educationLevel when provided', async () => {
    mockPrisma.guard.create.mockResolvedValue({
      ...baseGuard,
      gender: 'MALE',
      tribe: 'Muganda',
      educationLevel: 'O_LEVEL',
    });

    await guardService.create(
      { ...baseInput, gender: 'MALE', tribe: 'Muganda', educationLevel: 'O_LEVEL' },
      'user1',
    );

    const createArg = mockPrisma.guard.create.mock.calls[0][0].data;
    expect(createArg.gender).toBe('MALE');
    expect(createArg.tribe).toBe('Muganda');
    expect(createArg.educationLevel).toBe('O_LEVEL');
  });

  it('saves father and mother details when provided', async () => {
    mockPrisma.guard.create.mockResolvedValue({ ...baseGuard, fatherName: 'Robert', motherName: 'Grace' });

    await guardService.create(
      { ...baseInput, fatherName: 'Robert', fatherDistrict: 'Masaka', motherName: 'Grace', motherOccupation: 'Trader' },
      'user1',
    );

    const createArg = mockPrisma.guard.create.mock.calls[0][0].data;
    expect(createArg.fatherName).toBe('Robert');
    expect(createArg.fatherDistrict).toBe('Masaka');
    expect(createArg.motherName).toBe('Grace');
    expect(createArg.motherOccupation).toBe('Trader');
  });

  it('creates relatives records when vettingData.relatives provided', async () => {
    mockPrisma.guard.create.mockResolvedValue({ ...baseGuard });
    mockPrisma.guardRelative.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.guardAssociate.createMany.mockResolvedValue({ count: 0 });

    await guardService.create(
      {
        ...baseInput,
        vettingData: {
          relatives: [{ relativeName: 'Paul', relationship: 'Brother' }],
        },
      },
      'user1',
    );

    expect(mockPrisma.guardRelative.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ relativeName: 'Paul', relationship: 'Brother', guardId: 'g1' }),
      ]),
    });
  });

  it('creates associates records when vettingData.associates provided', async () => {
    mockPrisma.guard.create.mockResolvedValue({ ...baseGuard });
    mockPrisma.guardRelative.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.guardAssociate.createMany.mockResolvedValue({ count: 1 });

    await guardService.create(
      {
        ...baseInput,
        vettingData: {
          associates: [{ associateName: 'David Mukasa', placeOfWork: 'City Supermarket' }],
        },
      },
      'user1',
    );

    expect(mockPrisma.guardAssociate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ associateName: 'David Mukasa', guardId: 'g1' }),
      ]),
    });
  });

  it('succeeds with only original required fields — backward compatibility', async () => {
    mockPrisma.guard.create.mockResolvedValue({ ...baseGuard });

    const result = await guardService.create(baseInput, 'user1');
    expect(result.id).toBe('g1');
    expect(mockPrisma.guardRelative.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.guardAssociate.createMany).not.toHaveBeenCalled();
  });
});

// ── getById() — includes relatives and associates ─────────────────────────────

describe('guardService.getById() — vetting data', () => {
  it('includes relatives and associates in response', async () => {
    const relativeRecord = {
      id: 'rel1', guardId: 'g1', relativeName: 'Paul', phone: '+256703000001',
      relationship: 'Brother', occupation: 'Driver', placeOfResidence: 'Nateete',
      createdAt: new Date(),
    };
    const associateRecord = {
      id: 'asc1', guardId: 'g1', associateName: 'David Mukasa', placeOfWork: 'City Supermarket',
      workDetails: null, residence: 'Najjanankumbi', phone: '+256704000001',
      createdAt: new Date(),
    };

    mockPrisma.guard.findUnique.mockResolvedValue({
      ...baseGuard,
      documents: [],
      deploymentHistory: [],
      relatives:  [relativeRecord],
      associates: [associateRecord],
    });

    const result = await guardService.getById('g1', ROLES.DIRECTOR);

    expect(result.relatives).toHaveLength(1);
    expect(result.relatives[0].relativeName).toBe('Paul');
    expect(result.relatives[0].relationship).toBe('Brother');
    expect(result.associates).toHaveLength(1);
    expect(result.associates[0].associateName).toBe('David Mukasa');
  });
});

// ── updateVettingData() ────────────────────────────────────────────────────────

describe('guardService.updateVettingData()', () => {
  beforeEach(() => {
    mockPrisma.guard.findUnique.mockResolvedValue(baseGuard);
    // $transaction executes each operation in the array
    mockPrisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
    mockPrisma.guardRelative.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.guardRelative.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.guardAssociate.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.guardAssociate.createMany.mockResolvedValue({ count: 0 });
  });

  it('replaces existing relatives with new set', async () => {
    const newRelatives = [
      { relativeName: 'Paul', relationship: 'Brother' },
      { relativeName: 'Sarah', relationship: 'Sister' },
    ];

    await guardService.updateVettingData('g1', newRelatives, [], 'user1');

    expect(mockPrisma.guardRelative.deleteMany).toHaveBeenCalledWith({ where: { guardId: 'g1' } });
    expect(mockPrisma.guardRelative.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ relativeName: 'Paul', guardId: 'g1' }),
        expect.objectContaining({ relativeName: 'Sarah', guardId: 'g1' }),
      ]),
    });
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VETTING_DATA_UPDATED', entityId: 'g1' }),
    );
  });

  it('replaces existing associates with new set', async () => {
    const newAssociates = [{ associateName: 'John', placeOfWork: 'Market' }];

    await guardService.updateVettingData('g1', [], newAssociates, 'user1');

    expect(mockPrisma.guardAssociate.deleteMany).toHaveBeenCalledWith({ where: { guardId: 'g1' } });
    expect(mockPrisma.guardAssociate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ associateName: 'John', guardId: 'g1' }),
      ]),
    });
  });

  it('throws NotFoundError for unknown guardId', async () => {
    mockPrisma.guard.findUnique.mockResolvedValue(null);
    await expect(guardService.updateVettingData('bad-id', [], [], 'user1'))
      .rejects.toThrow(NotFoundError);
  });
});
