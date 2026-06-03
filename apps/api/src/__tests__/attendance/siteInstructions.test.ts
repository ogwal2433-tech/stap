import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    deployment:       { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    zone:             { findUnique: vi.fn() },
    site:             { findMany: vi.fn() },
    guard:            { findMany: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/settingsService', () => ({
  settingsService: { get: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { deploymentService } from '../../services/deploymentService';
import { zoneService } from '../../services/zoneService';

const mp = prisma as any;

// ── Helpers ───────────────────────────────────────────────────────────────────

const LONG_INSTRUCTIONS =
  'Guards must sign in with reception on arrival. No mobile phones on duty. ' +
  'Patrol the car park every 30 minutes. In case of emergency contact Mr. Okello. ' +
  'Strict no-entry policy after 22:00.';

function makeDeployment(specialInstructions: string | null = null) {
  return {
    id:        'dep1',
    guardId:   'guard1',
    siteId:    'site1',
    shiftType: 'DAY',
    date:      new Date('2026-06-03T00:00:00.000Z'),
    createdAt: new Date(),
    guard: {
      id: 'guard1', firstName: 'Alice', lastName: 'Smith',
      otherNames: null, phone: '0700000001', photoUrl: null, rank: 'GUARD',
    },
    site: {
      id:                  'site1',
      siteName:            'Alpha Tower',
      location:            'Kampala CBD',
      siteType:            'COMMERCIAL',
      guardsRequired:      2,
      specialInstructions,
      client: { id: 'c1', clientName: 'Acme Corp' },
      zone:   { id: 'z1', name: 'Zone North' },
    },
    supervisor: { id: 'sup1', name: 'Bob Manager' },
  };
}

function makeZoneWithSites(specialInstructions: string | null = null) {
  return {
    id:          'zone1',
    name:        'Zone North',
    description: null,
    supervisorId: null,
    alternateId:  null,
    isActive:    true,
    createdBy:   'admin',
    createdAt:   new Date(),
    updatedAt:   new Date(),
    supervisor:  null,
    alternate:   null,
    _count:      { sites: 1 },
    sites: [
      {
        id:                  'site1',
        siteName:            'Alpha Tower',
        location:            'Kampala CBD',
        guardsRequired:      2,
        siteType:            'COMMERCIAL',
        defaultShiftType:    'DAY',
        requiresArmedGuards: false,
        requiresFirearms:    false,
        specialInstructions,
        client: { id: 'c1', clientName: 'Acme Corp' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.attendanceRecord.findMany.mockResolvedValue([]);
  mp.guard.findMany.mockResolvedValue([]);
  mp.deployment.findMany.mockResolvedValue([]);
});

// ── getDailySheet — specialInstructions in site object ────────────────────────

describe('getDailySheet() — specialInstructions in site object', () => {
  it('includes specialInstructions when set on the site', async () => {
    mp.deployment.findMany.mockResolvedValue([makeDeployment(LONG_INSTRUCTIONS)]);

    const result = await deploymentService.getDailySheet('2026-06-03');

    const site = result.zones[0].sites[0].site;
    expect(site.specialInstructions).toBe(LONG_INSTRUCTIONS);
  });

  it('returns null when site has no special instructions', async () => {
    mp.deployment.findMany.mockResolvedValue([makeDeployment(null)]);

    const result = await deploymentService.getDailySheet('2026-06-03');

    const site = result.zones[0].sites[0].site;
    expect(site.specialInstructions).toBeNull();
  });

  it('returns empty zones when no deployments', async () => {
    mp.deployment.findMany.mockResolvedValue([]);

    const result = await deploymentService.getDailySheet('2026-06-03');

    expect(result.zones).toHaveLength(0);
  });
});

// ── getRosterData — specialInstructions in sites array ────────────────────────

describe('getRosterData() — specialInstructions in sites array', () => {
  it('includes specialInstructions per site when set', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZoneWithSites(LONG_INSTRUCTIONS));

    const result = await zoneService.getRosterData('zone1');

    expect(result.sites).toHaveLength(1);
    expect(result.sites[0].specialInstructions).toBe(LONG_INSTRUCTIONS);
  });

  it('returns null when site has no special instructions', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZoneWithSites(null));

    const result = await zoneService.getRosterData('zone1');

    expect(result.sites[0].specialInstructions).toBeNull();
  });

  it('specialInstructions field is present on the ZoneSite shape', async () => {
    mp.zone.findUnique.mockResolvedValue(makeZoneWithSites(null));

    const result = await zoneService.getRosterData('zone1');

    expect(Object.prototype.hasOwnProperty.call(result.sites[0], 'specialInstructions')).toBe(true);
  });
});
