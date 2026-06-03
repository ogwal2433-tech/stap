import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    zone:       { findUnique: vi.fn() },
    deployment: { findMany: vi.fn() },
    guard:      { findMany: vi.fn() },
  },
}));

import prisma from '../../db/prisma';
import { zoneService } from '../../services/zoneService';

const mp = prisma as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ZONE_ID   = 'zone-1';
const DATE_STR  = '2026-06-02T00:00:00.000Z';

function makeZone(overrides: Record<string, unknown> = {}) {
  return {
    id:          ZONE_ID,
    name:        'North Zone',
    supervisor:  { id: 'u-1', name: 'Alice Nambi',  role: 'OPERATIONS_SUPERVISOR' },
    alternate:   { id: 'u-2', name: 'Bob Okello',   role: 'FIELD_SUPERVISOR'       },
    sites: [
      {
        id:                  's-1',
        siteName:            'City Hall',
        location:            'Kampala',
        guardsRequired:      3,
        siteType:            'GOVERNMENT',
        defaultShiftType:    'DAY',
        armedGuardsRequired: 0,
        firearmsRequired:    0,
        isActive:            true,
        client: { id: 'c-1', clientName: 'KCCA' },
      },
    ],
    ...overrides,
  };
}

function makeGuard(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    firstName: 'Guard',
    lastName:  id.toUpperCase(),
    rank:      'GUARD',
    photoUrl:  null,
    phone:     '+256700000001',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.deployment.findMany.mockResolvedValue([]);
  mp.guard.findMany.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('zoneService.getRosterData()', () => {

  it('TEST 1 — returns zone info, sites, and all active guards', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    mp.guard.findMany.mockResolvedValue([makeGuard('g-1'), makeGuard('g-2')]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.zone.id).toBe(ZONE_ID);
    expect(result.zone.name).toBe('North Zone');
    expect(result.sites).toHaveLength(1);
    expect(result.sites[0].siteName).toBe('City Hall');
    expect(result.guards).toHaveLength(2);
  });

  it('TEST 2 — marks guards already deployed on the date as alreadyDeployed: true', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    mp.guard.findMany.mockResolvedValue([makeGuard('g-deployed'), makeGuard('g-free')]);
    mp.deployment.findMany.mockResolvedValue([{ guardId: 'g-deployed' }]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    const deployed = result.guards.find((g) => g.id === 'g-deployed');
    const free     = result.guards.find((g) => g.id === 'g-free');
    expect(deployed?.alreadyDeployed).toBe(true);
    expect(free?.alreadyDeployed).toBe(false);
  });

  it('TEST 3 — guards not deployed show alreadyDeployed: false', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    mp.guard.findMany.mockResolvedValue([makeGuard('g-1'), makeGuard('g-2')]);
    mp.deployment.findMany.mockResolvedValue([]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    result.guards.forEach((g) => expect(g.alreadyDeployed).toBe(false));
  });

  it('TEST 4 — guards on leave excluded (DB filter responsibility)', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    // The service filters onLeave: false in the Prisma query; mock returns only non-leave guards
    mp.guard.findMany.mockResolvedValue([makeGuard('g-active')]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.guards).toHaveLength(1);
    const queryArg = mp.guard.findMany.mock.calls[0][0];
    expect(queryArg.where.onLeave).toBe(false);
  });

  it('TEST 5 — guards with incomplete NID excluded', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    mp.guard.findMany.mockResolvedValue([makeGuard('g-complete-nid')]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    const queryArg = mp.guard.findMany.mock.calls[0][0];
    expect(queryArg.where.isIncompleteNID).toBe(false);
    expect(result.guards).toHaveLength(1);
  });

  it('TEST 6 — SUSPENDED/TERMINATED guards excluded', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    // Service uses employmentStatus: 'ACTIVE' — mock returns only active guard
    mp.guard.findMany.mockResolvedValue([makeGuard('g-active')]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    const queryArg = mp.guard.findMany.mock.calls[0][0];
    expect(queryArg.where.employmentStatus).toBe('ACTIVE');
    expect(result.guards).toHaveLength(1);
  });

  it('TEST 7 — sites returned belong to the zone only', async () => {
    const zone = makeZone({
      sites: [
        { id: 's-1', siteName: 'Zone A Site', location: 'Kampala', guardsRequired: 2,
          siteType: 'COMMERCIAL', defaultShiftType: null, armedGuardsRequired: 0,
          firearmsRequired: 0, isActive: true, client: { id: 'c-1', clientName: 'ACME' } },
      ],
    });
    mp.zone.findUnique.mockResolvedValue(zone);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.sites).toHaveLength(1);
    expect(result.sites[0].id).toBe('s-1');
    // Confirms Prisma query uses where: { id: zoneId }
    const queryArg = mp.zone.findUnique.mock.calls[0][0];
    expect(queryArg.where.id).toBe(ZONE_ID);
  });

  it('TEST 8 — returns 404 when zone not found', async () => {
    mp.zone.findUnique.mockResolvedValue(null);

    await expect(zoneService.getRosterData('nonexistent', DATE_STR))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('TEST 9 — zone with no sites returns empty sites array', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone({ sites: [] }));

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.sites).toHaveLength(0);
    expect(result.guards).toHaveLength(0);
  });

  it('TEST 10 — date defaults to today when not provided', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());

    const before = new Date();
    before.setUTCHours(0, 0, 0, 0);

    await zoneService.getRosterData(ZONE_ID, undefined);

    const after = new Date();
    after.setUTCHours(0, 0, 0, 0);

    const deploymentQuery = mp.deployment.findMany.mock.calls[0][0];
    const queryDate = new Date(deploymentQuery.where.date as Date);
    queryDate.setUTCHours(0, 0, 0, 0);

    expect(queryDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(queryDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('TEST 11 — fullName is concatenated from firstName + lastName', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone());
    mp.guard.findMany.mockResolvedValue([
      { id: 'g-1', firstName: 'David', lastName: 'Ochieng', rank: 'CORPORAL', photoUrl: null, phone: '+256700000001' },
    ]);

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.guards[0].fullName).toBe('David Ochieng');
  });

  it('TEST 12 — zone with no supervisor returns null supervisor', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZone({ supervisor: null, alternate: null }));

    const result = await zoneService.getRosterData(ZONE_ID, DATE_STR);

    expect(result.zone.supervisor).toBeNull();
    expect(result.zone.alternate).toBeNull();
  });
});
