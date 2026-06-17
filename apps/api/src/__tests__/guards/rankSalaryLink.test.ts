import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    guardRank: {
      findFirst: vi.fn(),
    },
    guardRelative: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    guardAssociate: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    guardDocument: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../lib/systemId', () => ({
  generateGuardId: vi.fn().mockResolvedValue('GRD-0001'),
}));

vi.mock('../../lib/idCard/generateIdCardPdf', () => ({
  generateIdCardPdf: vi.fn().mockResolvedValue('/tmp/test.pdf'),
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { createNotification: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/settingsService', () => ({
  settingsService: { getSetting: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { guardService } from '../../services/guardService';

const mp = prisma as any;

const CORPORAL_RANK = { id: 'rank-1', name: 'Corporal', defaultSalary: 550000, displayOrder: 2, isActive: true };
const GUARD_RANK    = { id: 'rank-2', name: 'Guard',    defaultSalary: 450000, displayOrder: 1, isActive: true };
const RANK_NO_SAL   = { id: 'rank-3', name: 'Trainee',  defaultSalary: null,   displayOrder: 0, isActive: true };

function makeGuard(overrides: Record<string, any> = {}) {
  return {
    id:             'guard-1',
    systemId:       'GRD-0001',
    firstName:      'John',
    lastName:       'Doe',
    otherNames:     null,
    nationalId:     'CM12345678ABCD',
    phone:          '0700000000',
    dateOfBirth:    new Date('1995-01-01'),
    rank:           'Guard',
    salaryRate:     null,
    status:         'ACTIVE',
    isIncompleteNID: false,
    probationStatus: 'ON_PROBATION',
    probationEndDate: null,
    relatives:      [],
    associates:     [],
    disciplinary:   [],
    documents:      [],
    _count:         { deployments: 0, attendance: 0, disciplinary: 0, documents: 0 },
    createdAt:      new Date(),
    updatedAt:      new Date(),
    ...overrides,
  };
}

const MIN_CREATE_INPUT = {
  firstName:     'John',
  lastName:      'Doe',
  nationalId:    'CM12345678ABCD',
  phone:         '0700000000',
  dateOfBirth:   '1995-01-01',
  contractStart: '2024-01-01',
  gender:        'MALE' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.guard.findUnique.mockResolvedValue(null);      // no duplicate NID
  mp.guard.create.mockResolvedValue(makeGuard());
  mp.guard.update.mockResolvedValue(makeGuard());
  mp.guardRank.findFirst.mockResolvedValue(null);
  mp.guardRelative.createMany.mockResolvedValue({ count: 0 });
  mp.guardRelative.deleteMany.mockResolvedValue({ count: 0 });
  mp.guardAssociate.createMany.mockResolvedValue({ count: 0 });
  mp.guardAssociate.deleteMany.mockResolvedValue({ count: 0 });
  mp.guardDocument.count.mockResolvedValue(0);
  mp.$transaction.mockImplementation((fn: any) =>
    typeof fn === 'function' ? fn(mp) : Promise.all(fn),
  );
});

// ── create(): auto-fill from rank ─────────────────────────────────────────────

describe('guardService.create() — rank salary auto-fill', () => {
  it('auto-fills salaryRate from rank defaultSalary when no salary provided', async () => {
    mp.guardRank.findFirst.mockResolvedValue(GUARD_RANK);
    mp.guard.findUnique
      .mockResolvedValueOnce(null)   // NID uniqueness check
      .mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));

    await guardService.create({ ...MIN_CREATE_INPUT, rank: 'Guard' }, 'user-1');

    const createCall = mp.guard.create.mock.calls[0][0];
    expect(createCall.data.salaryRate).toBe(450000);
    expect(mp.guardRank.findFirst).toHaveBeenCalledWith({ where: { name: 'Guard' } });
  });

  it('does NOT override an explicit salary with the rank default', async () => {
    mp.guardRank.findFirst.mockResolvedValue(GUARD_RANK);
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 600000 }));

    await guardService.create({ ...MIN_CREATE_INPUT, rank: 'Guard', salaryRate: 600000 }, 'user-1');

    const createCall = mp.guard.create.mock.calls[0][0];
    expect(createCall.data.salaryRate).toBe(600000);
    // rank lookup should NOT happen since explicit salary was provided
    expect(mp.guardRank.findFirst).not.toHaveBeenCalled();
  });

  it('leaves salaryRate undefined when rank has no defaultSalary', async () => {
    mp.guardRank.findFirst.mockResolvedValue(RANK_NO_SAL);
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeGuard({ rank: 'Trainee', salaryRate: null }));

    await guardService.create({ ...MIN_CREATE_INPUT, rank: 'Trainee' }, 'user-1');

    const createCall = mp.guard.create.mock.calls[0][0];
    expect(createCall.data.salaryRate).toBeUndefined();
  });

  it('leaves salaryRate undefined when no rank provided', async () => {
    mp.guard.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeGuard({ salaryRate: null }));

    await guardService.create({ ...MIN_CREATE_INPUT }, 'user-1');

    const createCall = mp.guard.create.mock.calls[0][0];
    expect(createCall.data.salaryRate).toBeUndefined();
    expect(mp.guardRank.findFirst).not.toHaveBeenCalled();
  });
});

// ── update(): auto-fill when rank changes ─────────────────────────────────────

describe('guardService.update() — rank salary auto-fill on rank change', () => {
  it('auto-fills salary when rank changes and no explicit salary in payload', async () => {
    mp.guard.findUnique.mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));
    mp.guardRank.findFirst.mockResolvedValue(CORPORAL_RANK);

    await guardService.update('guard-1', { rank: 'Corporal' }, 'user-1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    expect(updateCall.data.salaryRate).toBe(550000);
    expect(mp.guardRank.findFirst).toHaveBeenCalledWith({ where: { name: 'Corporal' } });
  });

  it('does NOT auto-fill when rank changes but explicit salary is also provided', async () => {
    mp.guard.findUnique.mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));
    mp.guardRank.findFirst.mockResolvedValue(CORPORAL_RANK);

    await guardService.update('guard-1', { rank: 'Corporal', salaryRate: 700000 }, 'user-1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    expect(updateCall.data.salaryRate).toBe(700000);
    // explicit salary takes precedence; rank lookup may still happen but salary must be the explicit one
  });

  it('does NOT overwrite salary when rank does not change', async () => {
    mp.guard.findUnique.mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));

    // Only updating phone, not rank
    await guardService.update('guard-1', { phone: '0711111111' }, 'user-1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    expect(updateCall.data.salaryRate).toBeUndefined();
    expect(mp.guardRank.findFirst).not.toHaveBeenCalled();
  });

  it('does not auto-fill when new rank has no defaultSalary', async () => {
    mp.guard.findUnique.mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));
    mp.guardRank.findFirst.mockResolvedValue(RANK_NO_SAL);

    await guardService.update('guard-1', { rank: 'Trainee' }, 'user-1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    expect(updateCall.data.salaryRate).toBeUndefined();
  });

  it('does not auto-fill when assigning same rank as current', async () => {
    mp.guard.findUnique.mockResolvedValue(makeGuard({ rank: 'Guard', salaryRate: 450000 }));

    await guardService.update('guard-1', { rank: 'Guard' }, 'user-1');

    const updateCall = mp.guard.update.mock.calls[0][0];
    expect(updateCall.data.salaryRate).toBeUndefined();
    expect(mp.guardRank.findFirst).not.toHaveBeenCalled();
  });
});
