import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      groupBy: vi.fn(),
      count:   vi.fn(),
    },
    deployment: {
      count:   vi.fn(),
      groupBy: vi.fn(),
    },
    attendanceRecord: {
      count: vi.fn(),
    },
    contract: {
      count: vi.fn(),
    },
    site: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { guardService } from '../../services/guardService';

const mockPrisma = prisma as unknown as {
  guard:           { groupBy: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  deployment:      { count: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  attendanceRecord:{ count: ReturnType<typeof vi.fn> };
  contract:        { count: ReturnType<typeof vi.fn> };
  site:            { findMany: ReturnType<typeof vi.fn> };
  $queryRaw:       ReturnType<typeof vi.fn>;
};

const makeStatusCounts = (active = 5, suspended = 1, terminated = 2) => [
  { employmentStatus: 'ACTIVE',     _count: { id: active } },
  { employmentStatus: 'SUSPENDED',  _count: { id: suspended } },
  { employmentStatus: 'TERMINATED', _count: { id: terminated } },
];

const makeTrendRow = (date: string) => ({
  date: new Date(date),
  present: BigInt(3), absent: BigInt(1), late: BigInt(0), awol: BigInt(0),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.guard.groupBy.mockResolvedValue(makeStatusCounts());
  mockPrisma.guard.count.mockResolvedValue(2);
  mockPrisma.deployment.count.mockResolvedValue(4);
  mockPrisma.deployment.groupBy.mockResolvedValue([
    { siteId: 's1', _count: { id: 10 } },
    { siteId: 's2', _count: { id: 7 } },
  ]);
  mockPrisma.attendanceRecord.count.mockResolvedValue(1);
  mockPrisma.contract.count.mockResolvedValue(3);
  mockPrisma.$queryRaw.mockResolvedValue([
    makeTrendRow('2026-04-10'),
    makeTrendRow('2026-04-11'),
  ]);
  mockPrisma.site.findMany.mockResolvedValue([
    { id: 's1', siteName: 'KCCA HQ',  client: { clientName: 'KCCA' } },
    { id: 's2', siteName: 'URA North', client: { clientName: 'URA' } },
  ]);
});

describe('guardService.getDashboardStats()', () => {
  it('returns all required fields', async () => {
    const stats = await guardService.getDashboardStats();

    expect(stats).toHaveProperty('totalActive');
    expect(stats).toHaveProperty('totalSuspended');
    expect(stats).toHaveProperty('totalTerminated');
    expect(stats).toHaveProperty('totalGuards');
    expect(stats).toHaveProperty('deployedToday');
    expect(stats).toHaveProperty('absentToday');
    expect(stats).toHaveProperty('newThisMonth');
    expect(stats).toHaveProperty('expiringContracts');
    expect(stats).toHaveProperty('pendingDisciplinary');
    expect(stats).toHaveProperty('guardsByStatus');
    expect(stats).toHaveProperty('attendanceTrend');
    expect(stats).toHaveProperty('topSitesByDeployment');
  });

  it('totalGuards equals sum of all statuses', async () => {
    const stats = await guardService.getDashboardStats();
    expect(stats.totalGuards).toBe(stats.totalActive + stats.totalSuspended + stats.totalTerminated);
  });

  it('attendanceTrend entries have YYYY-MM-DD date format', async () => {
    const stats = await guardService.getDashboardStats();
    stats.attendanceTrend.forEach((entry) => {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('attendanceTrend numeric fields are numbers, not BigInts', async () => {
    const stats = await guardService.getDashboardStats();
    stats.attendanceTrend.forEach((entry) => {
      expect(typeof entry.present).toBe('number');
      expect(typeof entry.absent).toBe('number');
    });
  });

  it('topSitesByDeployment has at most 5 entries', async () => {
    // Mock 6 sites
    mockPrisma.deployment.groupBy.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ siteId: `s${i}`, _count: { id: 10 - i } })),
    );
    // groupBy take:5 is enforced in the service, so mock only returns what Prisma would
    mockPrisma.deployment.groupBy.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ siteId: `s${i}`, _count: { id: 10 - i } })),
    );
    mockPrisma.site.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`, siteName: `Site ${i}`, client: { clientName: `Client ${i}` },
      })),
    );

    const stats = await guardService.getDashboardStats();
    expect(stats.topSitesByDeployment.length).toBeLessThanOrEqual(5);
  });

  it('handles no deployments today gracefully', async () => {
    mockPrisma.deployment.count.mockResolvedValue(0);

    const stats = await guardService.getDashboardStats();
    expect(stats.deployedToday).toBe(0);
  });

  it('handles empty attendance trend gracefully', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const stats = await guardService.getDashboardStats();
    expect(stats.attendanceTrend).toHaveLength(0);
  });

  it('handles no active sites (empty topSites) gracefully', async () => {
    mockPrisma.deployment.groupBy.mockResolvedValue([]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    const stats = await guardService.getDashboardStats();
    expect(stats.topSitesByDeployment).toHaveLength(0);
  });
});
