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
    deploymentHistory: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    disciplinaryRecord: {
      create: vi.fn(),
    },
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
  disciplinaryRecord: { create: ReturnType<typeof vi.fn> };
  deploymentHistory: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
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
    mockPrisma.guard.findUnique.mockResolvedValue(null); // no duplicate
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
});
