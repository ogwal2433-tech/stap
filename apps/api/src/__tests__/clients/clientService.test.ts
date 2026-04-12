import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contract: { count: vi.fn() },
    clientComplaint: { count: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { clientService } from '../../services/clientService';
import { NotFoundError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  client: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  contract: { count: ReturnType<typeof vi.fn> };
  clientComplaint: { count: ReturnType<typeof vi.fn> };
};

const baseClient = {
  id: 'c1',
  clientName: 'KCCA',
  contactPerson: 'James Sserwanga',
  contactPhone: '+256414123456',
  email: 'security@kcca.go.ug',
  physicalAddress: 'City Hall, Kampala',
  billingAddress: null,
  billingTerms: 30,
  contractStatus: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { sites: 2, contracts: 1, complaints: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── list() ─────────────────────────────────────────────────────────────────────

describe('clientService.list()', () => {
  it('returns paginated results with correct structure', async () => {
    mockPrisma.client.findMany.mockResolvedValue([baseClient]);
    mockPrisma.client.count.mockResolvedValue(1);

    const result = await clientService.list({
      page: 1, limit: 20, sortBy: 'clientName', sortOrder: 'asc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].clientName).toBe('KCCA');
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.hasNext).toBe(false);
  });

  it('applies search filter correctly', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await clientService.list({
      page: 1, limit: 20, search: 'KCCA', sortBy: 'clientName', sortOrder: 'asc',
    });

    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(whereArg.OR.length).toBeGreaterThan(0);
  });

  it('filters by contractStatus when provided', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await clientService.list({
      page: 1, limit: 20, contractStatus: 'ACTIVE', sortBy: 'clientName', sortOrder: 'asc',
    });

    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.contractStatus).toBe('ACTIVE');
  });
});

// ── getById() ──────────────────────────────────────────────────────────────────

describe('clientService.getById()', () => {
  it('returns client with sites and contracts', async () => {
    mockPrisma.client.findUnique.mockResolvedValue({
      ...baseClient,
      sites: [{ id: 's1', siteName: 'City Hall Entrance' }],
      contracts: [],
      complaints: [],
    });

    const result = await clientService.getById('c1');
    expect(result.id).toBe('c1');
    expect(result.clientName).toBe('KCCA');
  });

  it('throws NotFoundError for unknown id', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    await expect(clientService.getById('missing')).rejects.toThrow(NotFoundError);
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('clientService.create()', () => {
  const input = {
    clientName: 'KCCA',
    contactPerson: 'James Sserwanga',
    contactPhone: '+256414123456',
    email: 'security@kcca.go.ug' as const,
    physicalAddress: 'City Hall, Kampala',
    billingTerms: 30,
    contractStatus: 'ACTIVE' as const,
  };

  it('creates client and enqueues audit', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    const result = await clientService.create(input, 'user1');
    expect(result.id).toBe('c1');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_CREATED' }),
    );
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('clientService.update()', () => {
  it('updates and enqueues audit with old/new values', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue({ ...baseClient, billingTerms: 45 });

    await clientService.update('c1', { billingTerms: 45 }, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_UPDATED',
        oldValue: expect.objectContaining({ clientName: 'KCCA' }),
      }),
    );
  });

  it('throws NotFoundError for unknown id', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    await expect(clientService.update('missing', {}, 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── archive() ─────────────────────────────────────────────────────────────────

describe('clientService.archive()', () => {
  it('sets contractStatus to INACTIVE', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue({ ...baseClient, contractStatus: 'INACTIVE' });

    const result = await clientService.archive('c1', 'user1');
    expect(result.contractStatus).toBe('INACTIVE');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_ARCHIVED' }),
    );
  });
});

// ── getSummary() ───────────────────────────────────────────────────────────────

describe('clientService.getSummary()', () => {
  it('returns correct counts', async () => {
    mockPrisma.client.count
      .mockResolvedValueOnce(10) // totalActive
      .mockResolvedValueOnce(3);  // totalInactive
    mockPrisma.contract.count.mockResolvedValue(2);
    mockPrisma.clientComplaint.count.mockResolvedValue(5);

    const summary = await clientService.getSummary();
    expect(summary.totalActive).toBe(10);
    expect(summary.totalInactive).toBe(3);
    expect(summary.expiringContracts).toBe(2);
    expect(summary.openComplaints).toBe(5);
  });
});
