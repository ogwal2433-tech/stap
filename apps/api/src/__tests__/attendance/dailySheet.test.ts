import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    deployment:      { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
  },
}));

import prisma from '../../db/prisma';
import { deploymentService } from '../../services/deploymentService';

const mockPrisma = prisma as unknown as {
  deployment:       { findMany: ReturnType<typeof vi.fn> };
  attendanceRecord: { findMany: ReturnType<typeof vi.fn> };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDeployment(overrides: Record<string, unknown> = {}) {
  return {
    id:          'dep1',
    guardId:     'guard1',
    siteId:      'site1',
    shiftType:   'DAY',
    date:        new Date('2026-06-02T00:00:00.000Z'),
    createdAt:   new Date('2026-06-02T06:00:00.000Z'),
    guard: {
      id:        'guard1',
      firstName: 'Alice',
      lastName:  'Smith',
      otherNames: null,
      phone:     '0700000001',
      photoUrl:  null,
      rank:      'GUARD',
    },
    site: {
      id:             'site1',
      siteName:       'Alpha Tower',
      location:       'Kampala CBD',
      siteType:       'COMMERCIAL',
      guardsRequired: 2,
      client: { id: 'client1', clientName: 'Acme Corp' },
      zone:   { id: 'zone1',   name: 'Zone North' },
    },
    supervisor: { id: 'sup1', name: 'Bob Manager' },
    ...overrides,
  };
}

function makeAttendance(guardId: string, siteId: string, status: string) {
  return {
    id:      `att-${guardId}`,
    guardId,
    siteId,
    date:    new Date('2026-06-02T00:00:00.000Z'),
    status,
    timeIn:  status === 'PRESENT' ? new Date('2026-06-02T06:00:00.000Z') : null,
    timeOut: null,
    notes:   null,
  };
}

const DATE = '2026-06-02';

describe('deploymentService.getDailySheet()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
  });

  it('returns deployments grouped by zone then site', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].zoneId).toBe('zone1');
    expect(result.zones[0].zoneName).toBe('Zone North');
    expect(result.zones[0].sites).toHaveLength(1);
    expect(result.zones[0].sites[0].site.siteName).toBe('Alpha Tower');
  });

  it('returns empty zones array when no deployments', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.zones).toHaveLength(0);
  });

  it('counts present guards correctly', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([
      makeDeployment({ id: 'dep1', guardId: 'g1' }),
      makeDeployment({ id: 'dep2', guardId: 'g2', guard: { ...makeDeployment().guard, id: 'g2', firstName: 'Bob' } }),
    ]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('g1', 'site1', 'PRESENT'),
    ]);

    const result = await deploymentService.getDailySheet(DATE);
    const site = result.zones[0].sites[0];

    expect(site.presentCount).toBe(1);
    expect(site.unmarkedCount).toBe(1);
    expect(site.absentCount).toBe(0);
  });

  it('counts absent guards correctly', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('guard1', 'site1', 'ABSENT'),
    ]);

    const result = await deploymentService.getDailySheet(DATE);
    const site = result.zones[0].sites[0];

    expect(site.absentCount).toBe(1);
    expect(site.presentCount).toBe(0);
    expect(site.unmarkedCount).toBe(0);
  });

  it('counts AWOL guards in absentCount', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeAttendance('guard1', 'site1', 'AWOL'),
    ]);

    const result = await deploymentService.getDailySheet(DATE);
    const site = result.zones[0].sites[0];

    expect(site.absentCount).toBe(1);
  });

  it('guard with no attendance record shows in unmarkedCount', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    const result = await deploymentService.getDailySheet(DATE);
    const site = result.zones[0].sites[0];

    expect(site.unmarkedCount).toBe(1);
    expect(site.presentCount).toBe(0);
    expect(site.absentCount).toBe(0);
  });

  it('deployments from the same zone+site are grouped together', async () => {
    const dep2 = makeDeployment({
      id: 'dep2', guardId: 'guard2',
      guard: { ...makeDeployment().guard, id: 'guard2', firstName: 'Carol' },
    });
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment(), dep2]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].sites).toHaveLength(1);
    expect(result.zones[0].sites[0].deployments).toHaveLength(2);
  });

  it('deployments from different zones are in separate zone groups', async () => {
    const dep2 = makeDeployment({
      id: 'dep2', guardId: 'guard2', siteId: 'site2',
      site: {
        id: 'site2', siteName: 'Beta Plaza', location: 'Entebbe',
        siteType: 'COMMERCIAL', guardsRequired: 1,
        client: { id: 'client1', clientName: 'Acme Corp' },
        zone: { id: 'zone2', name: 'Zone South' },
      },
      guard: { ...makeDeployment().guard, id: 'guard2', firstName: 'Carol' },
    });
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment(), dep2]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.zones).toHaveLength(2);
    const names = result.zones.map((z) => z.zoneName);
    expect(names).toContain('Zone North');
    expect(names).toContain('Zone South');
  });

  it('sites with no zone land in a null zone group', async () => {
    const dep = makeDeployment({
      site: {
        ...makeDeployment().site, zone: null,
      },
    });
    mockPrisma.deployment.findMany.mockResolvedValue([dep]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.zones[0].zoneId).toBeNull();
    expect(result.zones[0].zoneName).toBeNull();
  });

  it('site data includes clientName and guardsRequired', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);

    const result = await deploymentService.getDailySheet(DATE);
    const site = result.zones[0].sites[0].site;

    expect(site.client.clientName).toBe('Acme Corp');
    expect(site.guardsRequired).toBe(2);
  });

  it('guard rank is included in each deployment', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);

    const result = await deploymentService.getDailySheet(DATE);
    const dep = result.zones[0].sites[0].deployments[0];

    expect(dep.guard.rank).toBe('GUARD');
  });

  it('fullName concatenates firstName and lastName', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);

    const result = await deploymentService.getDailySheet(DATE);
    const dep = result.zones[0].sites[0].deployments[0];

    expect(dep.guard.fullName).toBe('Alice Smith');
  });

  it('date field is normalised to midnight UTC ISO string', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([]);

    const result = await deploymentService.getDailySheet(DATE);

    expect(result.date).toMatch(/^2026-06-02T00:00:00\.000Z$/);
  });

  it('attendance is null when no record exists', async () => {
    mockPrisma.deployment.findMany.mockResolvedValue([makeDeployment()]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    const result = await deploymentService.getDailySheet(DATE);
    const dep = result.zones[0].sites[0].deployments[0];

    expect(dep.attendance).toBeNull();
  });
});
