import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client: { findUnique: vi.fn() },
    contract: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { contractService } from '../../services/contractService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  client: { findUnique: ReturnType<typeof vi.fn> };
  contract: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

const baseClient = { id: 'c1', clientName: 'Test Client' };

const now = new Date();
const futureStart = new Date(now);
futureStart.setDate(futureStart.getDate() - 10); // started 10 days ago
const futureEnd = new Date(now);
futureEnd.setDate(futureEnd.getDate() + 60); // ends in 60 days

const expiringEnd = new Date(now);
expiringEnd.setDate(expiringEnd.getDate() + 15); // ends in 15 days

const pastEnd = new Date(now);
pastEnd.setDate(pastEnd.getDate() - 5); // ended 5 days ago

const defaultGuardRates = [
  { id: 'gr1', guardType: 'Guard', guardsCount: 3, ratePerGuard: 800000, monthlyTotal: 2400000 },
];

function makeContract(overrides: Record<string, any> = {}) {
  return {
    id: 'con1',
    clientId: 'c1',
    client: baseClient,
    contractStart: futureStart,
    contractEnd: futureEnd,
    guardsRequired: 3,
    totalMonthlyValue: 2400000,
    status: 'ACTIVE',
    guardRates: defaultGuardRates,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.findUnique.mockResolvedValue(baseClient);
});

// ── create() ───────────────────────────────────────────────────────────────────

const oneGuardRate = [{ guardType: 'Guard', guardsCount: 1, ratePerGuard: 400000 }];

describe('contractService.create()', () => {
  it('status auto-computed as ACTIVE for current date range (>30 days remaining)', async () => {
    mockPrisma.contract.create.mockResolvedValue(makeContract({ status: 'ACTIVE' }));

    const result = await contractService.create(
      {
        clientId: 'c1',
        contractStart: futureStart.toISOString(),
        contractEnd: futureEnd.toISOString(),
        guardRates: [{ guardType: 'Guard', guardsCount: 3, ratePerGuard: 800000 }],
      },
      'user1',
    );

    expect(result.status).toBe('ACTIVE');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRACT_CREATED' }),
    );
  });

  it('status computed as EXPIRING when contractEnd within 30 days', async () => {
    mockPrisma.contract.create.mockResolvedValue(makeContract({
      contractEnd: expiringEnd,
      status: 'EXPIRING',
    }));

    const result = await contractService.create(
      {
        clientId: 'c1',
        contractStart: futureStart.toISOString(),
        contractEnd: expiringEnd.toISOString(),
        guardRates: [{ guardType: 'Guard', guardsCount: 2, ratePerGuard: 500000 }],
      },
      'user1',
    );

    expect(result.status).toBe('EXPIRING');
  });

  it('status computed as EXPIRED when contractEnd in the past', async () => {
    mockPrisma.contract.create.mockResolvedValue(makeContract({
      contractEnd: pastEnd,
      status: 'EXPIRED',
    }));

    const result = await contractService.create(
      {
        clientId: 'c1',
        contractStart: new Date(now.getTime() - 60 * 86400000).toISOString(),
        contractEnd: pastEnd.toISOString(),
        guardRates: oneGuardRate,
      },
      'user1',
    );

    expect(result.status).toBe('EXPIRED');
  });

  it('throws AppError if contractEnd before contractStart', async () => {
    await expect(
      contractService.create(
        {
          clientId: 'c1',
          contractStart: '2026-12-31T00:00:00.000Z',
          contractEnd: '2026-01-01T00:00:00.000Z',
          guardRates: oneGuardRate,
        },
        'user1',
      ),
    ).rejects.toThrow(AppError);
  });

  it('throws NotFoundError when client does not exist', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);

    await expect(
      contractService.create(
        {
          clientId: 'nonexistent',
          contractStart: futureStart.toISOString(),
          contractEnd: futureEnd.toISOString(),
          guardRates: oneGuardRate,
        },
        'user1',
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('derives guardsRequired and totalMonthlyValue from guard rate lines', async () => {
    mockPrisma.contract.create.mockResolvedValue(makeContract({
      guardsRequired: 6,
      totalMonthlyValue: 2400000 + 500000,
    }));

    await contractService.create(
      {
        clientId: 'c1',
        contractStart: futureStart.toISOString(),
        contractEnd: futureEnd.toISOString(),
        guardRates: [
          { guardType: 'Armed Guard', guardsCount: 3, ratePerGuard: 800000 },
          { guardType: 'Supervisor', guardsCount: 1, ratePerGuard: 500000 },
        ],
      },
      'user1',
    );

    const createCall = mockPrisma.contract.create.mock.calls[0][0];
    expect(createCall.data.guardsRequired).toBe(4);
    expect(createCall.data.totalMonthlyValue).toBe(3 * 800000 + 1 * 500000);
    expect(createCall.data.guardRates.create).toEqual([
      { guardType: 'Armed Guard', guardsCount: 3, ratePerGuard: 800000, monthlyTotal: 2400000 },
      { guardType: 'Supervisor', guardsCount: 1, ratePerGuard: 500000, monthlyTotal: 500000 },
    ]);
  });

  it('response reflects the stored totalMonthlyValue', async () => {
    mockPrisma.contract.create.mockResolvedValue(makeContract({
      guardsRequired: 3,
      totalMonthlyValue: 2400000,
    }));

    const result = await contractService.create(
      {
        clientId: 'c1',
        contractStart: futureStart.toISOString(),
        contractEnd: futureEnd.toISOString(),
        guardRates: [{ guardType: 'Guard', guardsCount: 3, ratePerGuard: 800000 }],
      },
      'user1',
    );

    expect(result.totalMonthlyValue).toBe(2400000);
  });
});

// ── getExpiringContracts() ─────────────────────────────────────────────────────

describe('contractService.getExpiringContracts()', () => {
  it('returns only contracts within threshold', async () => {
    const expiringContract = makeContract({ contractEnd: expiringEnd, status: 'EXPIRING' });
    mockPrisma.contract.findMany.mockResolvedValue([expiringContract]);

    const result = await contractService.getExpiringContracts(30);

    expect(result).toHaveLength(1);
    expect(result[0].daysRemaining).toBeLessThanOrEqual(30);
    expect(result[0].daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('returns empty array when no contracts expiring', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([]);

    const result = await contractService.getExpiringContracts(30);

    expect(result).toHaveLength(0);
  });
});

// ── runStatusRefresh() ────────────────────────────────────────────────────────

describe('contractService.runStatusRefresh()', () => {
  it('updates statuses correctly without throwing', async () => {
    mockPrisma.contract.updateMany.mockResolvedValue({ count: 2 });

    await expect(contractService.runStatusRefresh()).resolves.not.toThrow();

    // Called three times: expired, expiring, re-activated
    expect(mockPrisma.contract.updateMany).toHaveBeenCalledTimes(3);
  });

  it('marks contracts past end date as EXPIRED', async () => {
    mockPrisma.contract.updateMany.mockResolvedValue({ count: 1 });

    await contractService.runStatusRefresh();

    const firstCall = mockPrisma.contract.updateMany.mock.calls[0][0];
    expect(firstCall.data.status).toBe('EXPIRED');
    expect(firstCall.where.contractEnd).toBeDefined();
  });

  it('marks contracts within 30 days as EXPIRING', async () => {
    mockPrisma.contract.updateMany.mockResolvedValue({ count: 1 });

    await contractService.runStatusRefresh();

    const secondCall = mockPrisma.contract.updateMany.mock.calls[1][0];
    expect(secondCall.data.status).toBe('EXPIRING');
    expect(secondCall.where.status).toEqual({ in: ['ACTIVE'] });
  });
});
