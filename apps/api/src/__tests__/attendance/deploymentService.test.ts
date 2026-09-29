import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    site:       { findUnique: vi.fn() },
    guard:      { findMany: vi.fn() },
    user:       { findUnique: vi.fn() },
    shiftTypeConfig:  { findUnique: vi.fn() },
    deployment: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    deploymentHistory: {
      createMany: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
    },
    client:            { findUnique: vi.fn() },
    attendanceRecord:  { findFirst: vi.fn() },
    auditLog:          { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { deploymentService } from '../../services/deploymentService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  site:       { findUnique: ReturnType<typeof vi.fn> };
  guard:      { findMany: ReturnType<typeof vi.fn> };
  user:       { findUnique: ReturnType<typeof vi.fn> };
  shiftTypeConfig:  { findUnique: ReturnType<typeof vi.fn> };
  deployment: {
    findMany:   ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst:  ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
  };
  deploymentHistory: {
    createMany: ReturnType<typeof vi.fn>;
    findMany:   ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
  };
  client:            { findUnique: ReturnType<typeof vi.fn> };
  attendanceRecord:  { findFirst: ReturnType<typeof vi.fn> };
};

const baseSite = { id: 's1', siteName: 'Test Site', client: { clientName: 'Test Client' } };
const baseGuard = { id: 'g1', firstName: 'John', lastName: 'Doe', otherNames: null, isIncompleteNID: false, employmentStatus: 'ACTIVE' };
const baseSupervisor = { id: 'u1', name: 'Supervisor One', role: 'OPERATIONS_SUPERVISOR' };

const baseRosterInput = {
  siteId: 's1',
  guardIds: ['g1'],
  supervisorId: 'u1',
  shiftType: 'DAY' as const,
  startDate: '2026-04-14T00:00:00.000Z',
  recurring: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.shiftTypeConfig.findUnique.mockResolvedValue({ code: 'DAY', isActive: true });
  mockPrisma.site.findUnique.mockResolvedValue(baseSite);
  mockPrisma.guard.findMany.mockResolvedValue([baseGuard]);
  mockPrisma.user.findUnique.mockResolvedValue(baseSupervisor);
  mockPrisma.deployment.findMany.mockResolvedValue([]);
  mockPrisma.deployment.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.deploymentHistory.createMany.mockResolvedValue({ count: 1 });
});

// ── createRoster() ─────────────────────────────────────────────────────────────

describe('deploymentService.createRoster()', () => {
  it('creates deployments for each guard', async () => {
    const result = await deploymentService.createRoster(baseRosterInput, 'user1');

    expect(result.created).toBe(1);
    expect(result.conflicts).toHaveLength(0);
    expect(mockPrisma.deployment.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.deploymentHistory.createMany).toHaveBeenCalledTimes(1);
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROSTER_CREATED' }),
    );
  });

  it('detects conflicts with existing deployment on same date at any site', async () => {
    // Simulate existing deployment for guard at another site
    mockPrisma.deployment.findMany.mockResolvedValue([
      { guardId: 'g1', siteId: 'other-site', site: { siteName: 'Other Site', client: { clientName: 'Other Client' } } },
    ]);

    const result = await deploymentService.createRoster(baseRosterInput, 'user1');

    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].guardName).toBe('John Doe');
    expect(result.conflicts[0].existingSite).toBe('Other Site');
    expect(result.conflicts[0].existingClient).toBe('Other Client');
  });

  it('throws NotFoundError for invalid siteId', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    await expect(
      deploymentService.createRoster(baseRosterInput, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError if any guard not found', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([]); // no guards found

    await expect(
      deploymentService.createRoster(baseRosterInput, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws AppError if supervisor has wrong role', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Trainer', role: 'TRAINER' });

    await expect(
      deploymentService.createRoster(baseRosterInput, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('recurring roster generates correct number of dates', async () => {
    const recurringInput = {
      ...baseRosterInput,
      recurring: true,
      startDate: '2026-04-14T00:00:00.000Z', // Monday
      endDate: '2026-04-20T23:59:59.999Z',   // Sunday
      daysOfWeek: [1, 2, 3, 4, 5],           // Mon-Fri
    };

    const result = await deploymentService.createRoster(recurringInput, 'user1');

    // Mon 14, Tue 15, Wed 16, Thu 17, Fri 18 = 5 deployments for 1 guard
    expect(result.created).toBe(5);
    // createMany is called once with all records batched
    expect(mockPrisma.deployment.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.deployment.createMany.mock.calls[0][0].data).toHaveLength(5);
  });

  it('caps recurring roster at 90 days', async () => {
    const farFutureInput = {
      ...baseRosterInput,
      recurring: true,
      startDate: '2026-04-14T00:00:00.000Z',
      endDate: '2027-04-14T23:59:59.999Z', // More than 90 days
      daysOfWeek: [1], // Every Monday
    };

    const result = await deploymentService.createRoster(farFutureInput, 'user1');

    // Should be capped at 90 days worth of Mondays (≤ 13 Mondays)
    expect(result.created).toBeLessThanOrEqual(13);
  });
});

// ── getTodaysDeployments() ─────────────────────────────────────────────────────

describe('deploymentService.getTodaysDeployments()', () => {
  it('returns today\'s deployments with attendance status joined', async () => {
    const mockDeployment = {
      id: 'd1',
      guardId: 'g1',
      siteId: 's1',
      shiftType: 'DAY',
      date: new Date(),
      createdAt: new Date(),
      guard: { id: 'g1', firstName: 'John', lastName: 'Doe', otherNames: null, phone: '+256700000001', photoUrl: null },
      site: {
        id: 's1',
        siteName: 'Test Site',
        location: 'Kampala',
        client: { id: 'c1', clientName: 'Test Client' },
      },
      supervisor: { id: 'u1', name: 'Supervisor One' },
    };

    mockPrisma.deployment.findMany.mockResolvedValue([mockDeployment]);
    mockPrisma.deployment.count.mockResolvedValue(1);
    mockPrisma.attendanceRecord.findFirst = vi.fn();

    // Mock attendanceRecord.findMany used inside
    const attRecord = {
      id: 'a1',
      guardId: 'g1',
      siteId: 's1',
      status: 'PRESENT',
      notes: null,
    };

    // Patch prisma.attendanceRecord.findMany
    (prisma as unknown as { attendanceRecord: { findMany: ReturnType<typeof vi.fn> } })
      .attendanceRecord.findMany = vi.fn().mockResolvedValue([attRecord]);

    const result = await deploymentService.getTodaysDeployments({
      page: 1,
      limit: 50,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].guard.fullName).toBe('John Doe');
    expect(result.data[0].attendance?.status).toBe('PRESENT');
    expect(result.pagination.total).toBe(1);
  });
});

// ── deleteDeployment() ────────────────────────────────────────────────────────

describe('deploymentService.deleteDeployment()', () => {
  it('throws 409 if attendance already marked for this deployment', async () => {
    mockPrisma.deployment.findUnique.mockResolvedValue({
      id: 'd1',
      guardId: 'g1',
      siteId: 's1',
      date: new Date(),
      guard: { firstName: 'John', lastName: 'Doe' },
    });
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'a1' });

    await expect(
      deploymentService.deleteDeployment('d1', 'user1'),
    ).rejects.toThrow(AppError);

    await expect(
      deploymentService.deleteDeployment('d1', 'user1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deletes deployment when no attendance marked', async () => {
    mockPrisma.deployment.findUnique.mockResolvedValue({
      id: 'd1',
      guardId: 'g1',
      siteId: 's1',
      date: new Date(),
      guard: { firstName: 'John', lastName: 'Doe' },
    });
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
    mockPrisma.deployment.delete.mockResolvedValue({});

    await deploymentService.deleteDeployment('d1', 'user1');

    expect(mockPrisma.deployment.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEPLOYMENT_DELETED' }),
    );
  });
});

// ── copyPreviousRoster() ──────────────────────────────────────────────────────

describe('deploymentService.copyPreviousRoster()', () => {
  const sourceDeployment = {
    id:             'd1',
    guardId:        'g1',
    siteId:         's1',
    supervisorId:   'u1',
    shiftType:      'DAY',
    date:           new Date('2026-04-14T00:00:00.000Z'),
    deploymentType: 'UNARMED',
    weaponsDetails: null,
    guard:          { id: 'g1', employmentStatus: 'ACTIVE' },
  };

  it('copies active-guard deployments to target date', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([sourceDeployment]);
    mockPrisma.deployment.findUnique.mockResolvedValue(null); // no existing on target date
    mockPrisma.deployment.create.mockResolvedValue({});

    const result = await deploymentService.copyPreviousRoster(
      '2026-04-14',
      '2026-04-15',
      'user1',
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockPrisma.deployment.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.deployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardId:        'g1',
          siteId:         's1',
          copiedFromDate: expect.any(Date),
        }),
      }),
    );
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROSTER_COPIED' }),
    );
  });

  it('skips inactive guards', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([
      { ...sourceDeployment, guard: { id: 'g1', employmentStatus: 'TERMINATED' } },
    ]);

    const result = await deploymentService.copyPreviousRoster('2026-04-14', '2026-04-15', 'user1');

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPrisma.deployment.create).not.toHaveBeenCalled();
  });

  it('skips guards already deployed on target date', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([sourceDeployment]);
    mockPrisma.deployment.findUnique.mockResolvedValue({ id: 'd-existing' }); // already deployed

    const result = await deploymentService.copyPreviousRoster('2026-04-14', '2026-04-15', 'user1');

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('throws AppError when source date has no deployments', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([]);

    await expect(
      deploymentService.copyPreviousRoster('2026-04-14', '2026-04-15', 'user1'),
    ).rejects.toThrow(AppError);
  });
});

// ── getAvailableReplacements() ────────────────────────────────────────────────

describe('deploymentService.getAvailableReplacements()', () => {
  it('returns active guards not deployed on the date, excluding absent guard', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([{ guardId: 'g1' }, { guardId: 'g2' }]);
    (prisma as unknown as { guard: { findMany: ReturnType<typeof vi.fn> } }).guard.findMany =
      vi.fn().mockResolvedValue([
        { id: 'g3', firstName: 'Jane', lastName: 'Smith', otherNames: null, phone: null, photoUrl: null, rank: null },
      ]);

    const result = await deploymentService.getAvailableReplacements('s1', '2026-04-14', 'g-absent');

    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe('Jane Smith');
    expect(result[0].id).toBe('g3');
  });

  it('returns empty array when no guards available', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([]);
    (prisma as unknown as { guard: { findMany: ReturnType<typeof vi.fn> } }).guard.findMany =
      vi.fn().mockResolvedValue([]);

    const result = await deploymentService.getAvailableReplacements('s1', '2026-04-14', 'g-absent');

    expect(result).toHaveLength(0);
  });
});

// ── listByClient() ────────────────────────────────────────────────────────────

const historyStint = (over: Record<string, unknown> = {}) => ({
  id:        'dh1',
  shiftType: 'DAY',
  startDate: new Date('2026-03-01'),
  endDate:   null,
  guard:      { id: 'g1', firstName: 'John', otherNames: null, lastName: 'Doe', systemId: 'SSLG0001', rank: 'GUARD' },
  site:       { id: 's1', siteName: 'Fort Bet Warehouse' },
  supervisor: { id: 'u1', name: 'Supervisor One' },
  ...over,
});

const CLIENT_QUERY = { page: 1, limit: 20, status: 'ALL' as const };

describe('deploymentService.listByClient()', () => {
  beforeEach(() => {
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    mockPrisma.deploymentHistory.findMany.mockResolvedValue([historyStint()]);
    mockPrisma.deploymentHistory.count.mockResolvedValue(1);
  });

  it('names the guard, the site and the supervisor who posted them', async () => {
    const result = await deploymentService.listByClient('c1', CLIENT_QUERY);

    expect(result.data[0]).toEqual({
      id:        'dh1',
      guard:     { id: 'g1', fullName: 'John Doe', systemId: 'SSLG0001', rank: 'GUARD' },
      site:      { id: 's1', siteName: 'Fort Bet Warehouse' },
      shiftType: 'DAY',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate:   null,
      supervisor: { id: 'u1', name: 'Supervisor One' },
    });
    expect(result.pagination).toEqual({
      page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false,
    });
  });

  it('joins every name part, so a guard with other names is not truncated', async () => {
    mockPrisma.deploymentHistory.findMany.mockResolvedValue([
      historyStint({ guard: { id: 'g1', firstName: 'John', otherNames: 'Peter', lastName: 'Doe', systemId: null, rank: null } }),
    ]);

    const result = await deploymentService.listByClient('c1', CLIENT_QUERY);

    expect(result.data[0].guard.fullName).toBe('John Peter Doe');
    expect(result.data[0].guard.systemId).toBeNull();
  });

  it('scopes to this client and keeps stints on its current sites only', async () => {
    await deploymentService.listByClient('c1', CLIENT_QUERY);

    const args = mockPrisma.deploymentHistory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ site: { clientId: 'c1', deletedAt: null } });
    // Descending puts the open stints (no end date) first under Postgres.
    expect(args.orderBy).toEqual([{ endDate: 'desc' }, { startDate: 'desc' }]);
    expect(mockPrisma.deploymentHistory.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('CURRENT narrows the list to the guards still on post', async () => {
    await deploymentService.listByClient('c1', { ...CLIENT_QUERY, status: 'CURRENT' });

    const args = mockPrisma.deploymentHistory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ site: { clientId: 'c1', deletedAt: null }, endDate: null });
  });

  it('refuses an unknown client rather than returning an empty tab', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);

    await expect(deploymentService.listByClient('gone', CLIENT_QUERY)).rejects.toThrow(NotFoundError);
    expect(mockPrisma.deploymentHistory.findMany).not.toHaveBeenCalled();
  });
});
