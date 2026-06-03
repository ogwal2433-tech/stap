import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client:            { findUnique: vi.fn() },
    shiftTypeConfig:   { findUnique: vi.fn(), findMany: vi.fn() },
    site:              { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    siteEquipmentItem: { createMany: vi.fn(), deleteMany: vi.fn() },
    deployment:        { count: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { siteService } from '../../services/siteService';
import { AppError } from '../../errors/AppError';

type MockPrisma = {
  client:            { findUnique: ReturnType<typeof vi.fn> };
  shiftTypeConfig:   { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  site:              { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  siteEquipmentItem: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  deployment:        { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseClient = { id: 'c1', clientName: 'URA' };

function makeSiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                   's1',
    clientId:             'c1',
    siteName:             'Serena Hotel',
    location:             'Kampala',
    gpsLat:               null,
    gpsLon:               null,
    siteManagerName:      null,
    siteManagerContact:   null,
    specialInstructions:  null,
    guardsRequired:       4,
    siteType:             'REGULAR',
    specialDutyStartDate: null,
    specialDutyEndDate:   null,
    specialDutyNotes:     null,
    requiresFirearms:     false,
    requiresArmedGuards:  false,
    requiresWeapons:      false,
    equipmentDetails:     null,
    allowedShiftTypes:    [],
    defaultShiftType:     null,
    equipmentItems:       [],
    createdAt:            new Date('2026-01-01'),
    updatedAt:            new Date('2026-01-01'),
    client:               { clientName: 'URA' },
    zone:                 null,
    _count:               { deployments: 0, attendance: 0, incidents: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.client.findUnique.mockResolvedValue(baseClient);
  mock.shiftTypeConfig.findUnique.mockResolvedValue(undefined);
  mock.shiftTypeConfig.findMany.mockResolvedValue([]);
  mock.siteEquipmentItem.createMany.mockResolvedValue({ count: 0 });
  mock.siteEquipmentItem.deleteMany.mockResolvedValue({ count: 0 });
});

// ── create() ───────────────────────────────────────────────────────────────────

describe('siteService.create() — SPECIAL_DUTIES', () => {
  it('creates site with duty dates when siteType = SPECIAL_DUTIES', async () => {
    const created = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-07-10'),
      specialDutyEndDate:   new Date('2026-07-12'),
      specialDutyNotes:     'URA Gala',
    });
    mock.site.create.mockResolvedValue(created);
    mock.site.findUnique.mockResolvedValue({ ...created, deployments: [] });
    mock.site.count.mockResolvedValue(0);

    const result = await siteService.create({
      clientId:             'c1',
      siteName:             'Serena Hotel',
      location:             'Kampala',
      guardsRequired:       4,
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: '2026-07-10T00:00:00.000Z',
      specialDutyEndDate:   '2026-07-12T00:00:00.000Z',
      specialDutyNotes:     'URA Gala',
    }, 'user1');

    expect(result.siteType).toBe('SPECIAL_DUTIES');
    expect(result.specialDutyStartDate).toBeTruthy();
    expect(result.specialDutyEndDate).toBeTruthy();
    expect(result.specialDutyNotes).toBe('URA Gala');
    expect(result.dutyDurationDays).toBe(3);
  });

  it('throws 400 when SPECIAL_DUTIES but no start date', async () => {
    await expect(
      siteService.create({
        clientId:           'c1',
        siteName:           'Serena Hotel',
        location:           'Kampala',
        guardsRequired:     4,
        siteType:           'SPECIAL_DUTIES',
        specialDutyEndDate: '2026-07-12T00:00:00.000Z',
      }, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('throws 400 when SPECIAL_DUTIES but no end date', async () => {
    await expect(
      siteService.create({
        clientId:             'c1',
        siteName:             'Serena Hotel',
        location:             'Kampala',
        guardsRequired:       4,
        siteType:             'SPECIAL_DUTIES',
        specialDutyStartDate: '2026-07-10T00:00:00.000Z',
      }, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('throws 400 when end date is before start date', async () => {
    await expect(
      siteService.create({
        clientId:             'c1',
        siteName:             'Serena Hotel',
        location:             'Kampala',
        guardsRequired:       4,
        siteType:             'SPECIAL_DUTIES',
        specialDutyStartDate: '2026-07-15T00:00:00.000Z',
        specialDutyEndDate:   '2026-07-10T00:00:00.000Z',
      }, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('accepts same day as start and end (1-day duty)', async () => {
    const created = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-07-10'),
      specialDutyEndDate:   new Date('2026-07-10'),
    });
    mock.site.create.mockResolvedValue(created);
    mock.site.findUnique.mockResolvedValue({ ...created, deployments: [] });

    const result = await siteService.create({
      clientId:             'c1',
      siteName:             'Serena Hotel',
      location:             'Kampala',
      guardsRequired:       4,
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: '2026-07-10T00:00:00.000Z',
      specialDutyEndDate:   '2026-07-10T00:00:00.000Z',
    }, 'user1');

    expect(result.dutyDurationDays).toBe(1);
  });

  it('clears duty dates when siteType = REGULAR', async () => {
    const created = makeSiteRow();
    mock.site.create.mockResolvedValue(created);
    mock.site.findUnique.mockResolvedValue({ ...created, deployments: [] });

    const captured: Record<string, unknown>[] = [];
    mock.site.create.mockImplementation((args: { data: Record<string, unknown> }) => {
      captured.push(args.data);
      return Promise.resolve(created);
    });

    await siteService.create({
      clientId:             'c1',
      siteName:             'City Hall',
      location:             'Kampala',
      guardsRequired:       2,
      siteType:             'REGULAR',
      specialDutyStartDate: '2026-07-10T00:00:00.000Z',
      specialDutyEndDate:   '2026-07-12T00:00:00.000Z',
    }, 'user1');

    expect(captured[0]!['specialDutyStartDate']).toBeNull();
    expect(captured[0]!['specialDutyEndDate']).toBeNull();
  });

  it('logs warning when duty period > 30 days', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const created = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-07-01'),
      specialDutyEndDate:   new Date('2026-08-15'),
    });
    mock.site.create.mockResolvedValue(created);
    mock.site.findUnique.mockResolvedValue({ ...created, deployments: [] });

    await siteService.create({
      clientId:             'c1',
      siteName:             'Long Event',
      location:             'Kampala',
      guardsRequired:       2,
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: '2026-07-01T00:00:00.000Z',
      specialDutyEndDate:   '2026-08-15T00:00:00.000Z',
    }, 'user1');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unusually long'));
    spy.mockRestore();
  });

  it('dutyDurationDays: Jan 1 → Jan 3 = 3 days', async () => {
    const created = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-01-01'),
      specialDutyEndDate:   new Date('2026-01-03'),
    });
    mock.site.create.mockResolvedValue(created);
    mock.site.findUnique.mockResolvedValue({ ...created, deployments: [] });

    const result = await siteService.create({
      clientId:             'c1',
      siteName:             'Event Site',
      location:             'Kampala',
      guardsRequired:       2,
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: '2026-01-01T00:00:00.000Z',
      specialDutyEndDate:   '2026-01-03T00:00:00.000Z',
    }, 'user1');

    expect(result.dutyDurationDays).toBe(3);
  });
});

// ── update() ───────────────────────────────────────────────────────────────────

describe('siteService.update() — SPECIAL_DUTIES', () => {
  it('clearing duty dates when switching from SPECIAL_DUTIES to REGULAR', async () => {
    const existing = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-07-10'),
      specialDutyEndDate:   new Date('2026-07-12'),
    });
    mock.site.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValue({ ...makeSiteRow(), deployments: [] });

    const captured: Record<string, unknown>[] = [];
    mock.site.update.mockImplementation((args: { data: Record<string, unknown> }) => {
      captured.push(args.data);
      return Promise.resolve(makeSiteRow());
    });

    await siteService.update('s1', { siteType: 'REGULAR' }, 'user1');

    expect(captured[0]!['specialDutyStartDate']).toBeNull();
    expect(captured[0]!['specialDutyEndDate']).toBeNull();
    expect(captured[0]!['specialDutyNotes']).toBeNull();
  });

  it('requires duty dates when changing to SPECIAL_DUTIES without providing them', async () => {
    // Existing site is REGULAR with no duty dates
    mock.site.findUnique.mockResolvedValue(makeSiteRow());

    await expect(
      siteService.update('s1', { siteType: 'SPECIAL_DUTIES' }, 'user1'),
    ).rejects.toThrow(AppError);
  });
});

// ── GET /clients/sites/all (toSiteResponse) ────────────────────────────────────

describe('toSiteResponse — special duty fields', () => {
  it('returns specialDutyStartDate and dutyDurationDays for SPECIAL_DUTIES sites', async () => {
    const row = makeSiteRow({
      siteType:             'SPECIAL_DUTIES',
      specialDutyStartDate: new Date('2026-07-10'),
      specialDutyEndDate:   new Date('2026-07-12'),
      specialDutyNotes:     'URA Gala',
    });
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });
    mock.site.count.mockResolvedValue(0);

    const result = await siteService.getById('s1');
    expect(result.specialDutyStartDate).toContain('2026-07-10');
    expect(result.specialDutyEndDate).toContain('2026-07-12');
    expect(result.dutyDurationDays).toBe(3);
    expect(result.specialDutyNotes).toBe('URA Gala');
  });

  it('returns null for all duty fields on non-special-duty sites', async () => {
    mock.site.findUnique.mockResolvedValue({ ...makeSiteRow(), deployments: [] });

    const result = await siteService.getById('s1');
    expect(result.specialDutyStartDate).toBeNull();
    expect(result.specialDutyEndDate).toBeNull();
    expect(result.dutyDurationDays).toBeNull();
  });
});
