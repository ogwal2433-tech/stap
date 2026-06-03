import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    deployment:        { count: vi.fn(), findMany: vi.fn() },
    attendanceRecord:  { findMany: vi.fn() },
    supervisorCheckin: { findMany: vi.fn() },
  },
}));

import prisma from '../../db/prisma';
import { deploymentService } from '../../services/deploymentService';

const mockPrisma = prisma as unknown as {
  deployment:        { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  attendanceRecord:  { findMany: ReturnType<typeof vi.fn> };
  supervisorCheckin: { findMany: ReturnType<typeof vi.fn> };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDeployment(guardId = 'g1', siteId = 'site1', overrides = {}) {
  return {
    guardId,
    siteId,
    site: {
      id:             siteId,
      siteName:       'Alpha Tower',
      guardsRequired: 2,
      client:         { clientName: 'Acme Corp' },
      zone:           { name: 'CBD Zone' },
    },
    ...overrides,
  };
}

function makeAttendance(guardId = 'g1', siteId = 'site1', status = 'PRESENT') {
  return { guardId, siteId, status };
}

function makeCheckin(overrides = {}) {
  return {
    id:         'checkin1',
    supervisorId: 'sup1',
    siteId:     'site1',
    dateTime:   new Date(),
    notes:      null,
    supervisor: { id: 'sup1', name: 'John Sup', role: 'FIELD_SUPERVISOR' },
    site:       { id: 'site1', siteName: 'Alpha Tower', client: { clientName: 'Acme Corp' } },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('deploymentService.getAttendanceDashboard()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: 0 deployments, empty attendance
    mockPrisma.deployment.count.mockResolvedValue(0);
    mockPrisma.deployment.findMany.mockResolvedValue([]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    mockPrisma.supervisorCheckin.findMany.mockResolvedValue([]);
  });

  it('returns totalDeployed count from prisma.deployment.count', async () => {
    mockPrisma.deployment.count.mockResolvedValue(10);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.totalDeployed).toBe(10);
  });

  it('presentCount counts only PRESENT status', async () => {
    mockPrisma.deployment.count.mockResolvedValue(3);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
      makeAttendance('g2', 'site1', 'LATE'),
      makeAttendance('g3', 'site1', 'ABSENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.presentCount).toBe(1);
  });

  it('lateCount counts only LATE status', async () => {
    mockPrisma.deployment.count.mockResolvedValue(2);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'LATE'),
      makeAttendance('g2', 'site1', 'PRESENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.lateCount).toBe(1);
  });

  it('absentCount counts only ABSENT status', async () => {
    mockPrisma.deployment.count.mockResolvedValue(2);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'ABSENT'),
      makeAttendance('g2', 'site1', 'AWOL'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.absentCount).toBe(1);
  });

  it('awolCount counts only AWOL status', async () => {
    mockPrisma.deployment.count.mockResolvedValue(2);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'AWOL'),
      makeAttendance('g2', 'site1', 'PRESENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.awolCount).toBe(1);
  });

  it('unmarkedCount = totalDeployed - markedCount', async () => {
    mockPrisma.deployment.count.mockResolvedValue(5);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
      makeAttendance('g2', 'site1', 'ABSENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.markedCount).toBe(2);
    expect(result.unmarkedCount).toBe(3);
  });

  it('attendanceRate = (present + late) / deployed * 100', async () => {
    mockPrisma.deployment.count.mockResolvedValue(4);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
      makeAttendance('g2', 'site1', 'LATE'),
      makeAttendance('g3', 'site1', 'ABSENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.attendanceRate).toBe(50); // 2 of 4
  });

  it('attendanceRate is 0 when totalDeployed is 0', async () => {
    mockPrisma.deployment.count.mockResolvedValue(0);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.attendanceRate).toBe(0);
  });

  it('weeklyTrend has exactly 7 entries', async () => {
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.weeklyTrend).toHaveLength(7);
  });

  it('weeklyTrend entries are ordered oldest first', async () => {
    const result = await deploymentService.getAttendanceDashboard();
    const dates = result.weeklyTrend.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('isToday = true only on the last (today) entry', async () => {
    const result = await deploymentService.getAttendanceDashboard();
    const todayEntries = result.weeklyTrend.filter((d) => d.isToday);
    expect(todayEntries).toHaveLength(1);
    expect(result.weeklyTrend[6].isToday).toBe(true);
    result.weeklyTrend.slice(0, 6).forEach((d) => {
      expect(d.isToday).toBe(false);
    });
  });

  it('sitesWithMissingAttendance only includes sites with at least 1 unmarked guard', async () => {
    mockPrisma.deployment.count.mockResolvedValue(3);
    mockPrisma.deployment.findMany.mockResolvedValue([
      makeDeployment('g1', 'site1'),
      makeDeployment('g2', 'site1'),
      makeDeployment('g3', 'site2', { site: { id: 'site2', siteName: 'Beta Plaza', guardsRequired: 1, client: { clientName: 'Corp B' }, zone: null } }),
    ]);
    // site1: g1 marked, g2 not — should appear
    // site2: g3 marked — should NOT appear
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
      makeAttendance('g3', 'site2', 'PRESENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.sitesWithMissingAttendance).toHaveLength(1);
    expect(result.sitesWithMissingAttendance[0].siteName).toBe('Alpha Tower');
  });

  it('sitesWithMissingAttendance sorted by unmarkedCount descending', async () => {
    mockPrisma.deployment.count.mockResolvedValue(4);
    mockPrisma.deployment.findMany.mockResolvedValue([
      makeDeployment('g1', 'site1'),
      makeDeployment('g2', 'site1'),
      makeDeployment('g3', 'site2', { site: { id: 'site2', siteName: 'Beta Plaza', guardsRequired: 2, client: { clientName: 'Corp B' }, zone: null } }),
      makeDeployment('g4', 'site2', { site: { id: 'site2', siteName: 'Beta Plaza', guardsRequired: 2, client: { clientName: 'Corp B' }, zone: null } }),
    ]);
    // site1: 0 marked → 2 unmarked; site2: 1 marked → 1 unmarked
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g3', 'site2', 'PRESENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.sitesWithMissingAttendance[0].unmarkedCount).toBeGreaterThanOrEqual(
      result.sitesWithMissingAttendance[1].unmarkedCount,
    );
  });

  it('site with all guards marked does NOT appear in sitesWithMissingAttendance', async () => {
    mockPrisma.deployment.count.mockResolvedValue(2);
    mockPrisma.deployment.findMany.mockResolvedValue([
      makeDeployment('g1', 'site1'),
      makeDeployment('g2', 'site1'),
    ]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
      makeAttendance('g2', 'site1', 'PRESENT'),
    ]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.sitesWithMissingAttendance).toHaveLength(0);
  });

  it('weeklyAvgRate is the average of 7 daily rates', async () => {
    // All days return 0 deployed (default mock), so all rates = 0
    const result = await deploymentService.getAttendanceDashboard();
    const expectedAvg = Math.round(result.weeklyTrend.reduce((s, d) => s + d.rate, 0) / 7);
    expect(result.weeklyAvgRate).toBe(expectedAvg);
  });

  it('supervisor check-ins are returned with checkinTime from dateTime field', async () => {
    const dt = new Date('2026-06-03T08:00:00.000Z');
    mockPrisma.supervisorCheckin.findMany.mockResolvedValue([makeCheckin({ dateTime: dt })]);
    const result = await deploymentService.getAttendanceDashboard();
    expect(result.supervisorCheckins).toHaveLength(1);
    expect(result.supervisorCheckins[0].checkinTime).toBe(dt.toISOString());
  });
});
