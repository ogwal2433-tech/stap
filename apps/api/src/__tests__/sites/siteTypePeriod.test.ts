import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    client:            { findUnique: vi.fn() },
    shiftTypeConfig:   { findUnique: vi.fn(), findMany: vi.fn() },
    site:              { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
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
  site:              { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  siteEquipmentItem: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  deployment:        { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;

function makeSiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', clientId: 'c1', siteName: 'Test Site', location: 'Kampala',
    gpsLat: null, gpsLon: null, siteManagerName: null, siteManagerContact: null,
    specialInstructions: null, guardsRequired: 2,
    siteType: 'REGULAR', sitePeriodStart: null, sitePeriodEnd: null, sitePeriodNotes: null,
    armedGuardsRequired: 0, firearmsRequired: 0, batonRequired: 0, otherWeaponsNotes: null,
    equipmentDetails: null, allowedShiftTypes: [], defaultShiftType: null,
    equipmentItems: [], createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    client: { clientName: 'ACME' }, zone: null,
    _count: { deployments: 0, attendance: 0, incidents: 0 },
    ...overrides,
  };
}

const baseInput = { clientId: 'c1', siteName: 'Test Site', location: 'Kampala', guardsRequired: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mock.client.findUnique.mockResolvedValue({ id: 'c1', clientName: 'ACME' });
  mock.shiftTypeConfig.findMany.mockResolvedValue([]);
  mock.siteEquipmentItem.createMany.mockResolvedValue({ count: 0 });
  mock.siteEquipmentItem.deleteMany.mockResolvedValue({ count: 0 });
});

// ── create() — period validation ────────────────────────────────────────────────

describe('siteService.create() — site period', () => {
  it('TEMPORARY without dates → 400', async () => {
    await expect(siteService.create({ ...baseInput, siteType: 'TEMPORARY' }, 'u1')).rejects.toThrow(AppError);
  });

  it('TEMPORARY with both dates → succeeds', async () => {
    const row = makeSiteRow({ siteType: 'TEMPORARY', sitePeriodStart: new Date('2026-07-01'), sitePeriodEnd: new Date('2026-09-30') });
    mock.site.create.mockResolvedValue(row);
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });

    const result = await siteService.create({
      ...baseInput, siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-09-30T00:00:00.000Z',
    }, 'u1');

    expect(result.siteType).toBe('TEMPORARY');
    expect(result.hasPeriod).toBe(true);
    expect(result.sitePeriodStart).toContain('2026-07-01');
  });

  it('SPECIAL_DUTIES without dates → 400', async () => {
    await expect(siteService.create({ ...baseInput, siteType: 'SPECIAL_DUTIES' }, 'u1')).rejects.toThrow(AppError);
  });

  it('SPECIAL_DUTIES with both dates → succeeds', async () => {
    const row = makeSiteRow({ siteType: 'SPECIAL_DUTIES', sitePeriodStart: new Date('2026-07-10'), sitePeriodEnd: new Date('2026-07-12') });
    mock.site.create.mockResolvedValue(row);
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });

    const result = await siteService.create({
      ...baseInput, siteType: 'SPECIAL_DUTIES',
      sitePeriodStart: '2026-07-10T00:00:00.000Z',
      sitePeriodEnd:   '2026-07-12T00:00:00.000Z',
    }, 'u1');

    expect(result.hasPeriod).toBe(true);
    expect(result.periodDays).toBe(3);
  });

  it('REGULAR with period dates → dates cleared to null', async () => {
    const row = makeSiteRow();
    const captured: Record<string, unknown>[] = [];
    mock.site.create.mockImplementation((args: { data: Record<string, unknown> }) => { captured.push(args.data); return Promise.resolve(row); });
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });

    await siteService.create({
      ...baseInput, siteType: 'REGULAR',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-09-30T00:00:00.000Z',
    }, 'u1');

    expect(captured[0]!['sitePeriodStart']).toBeNull();
    expect(captured[0]!['sitePeriodEnd']).toBeNull();
  });

  it('PERMANENT with period dates → cleared to null', async () => {
    const row = makeSiteRow({ siteType: 'PERMANENT' });
    const captured: Record<string, unknown>[] = [];
    mock.site.create.mockImplementation((args: { data: Record<string, unknown> }) => { captured.push(args.data); return Promise.resolve(row); });
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });

    await siteService.create({
      ...baseInput, siteType: 'PERMANENT',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-07-12T00:00:00.000Z',
    }, 'u1');

    expect(captured[0]!['sitePeriodStart']).toBeNull();
  });

  it('end before start → 400', async () => {
    await expect(siteService.create({
      ...baseInput, siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-15T00:00:00.000Z',
      sitePeriodEnd:   '2026-07-10T00:00:00.000Z',
    }, 'u1')).rejects.toThrow(AppError);
  });

  it('same day start and end → 1 day, succeeds', async () => {
    const row = makeSiteRow({ siteType: 'TEMPORARY', sitePeriodStart: new Date('2026-07-10'), sitePeriodEnd: new Date('2026-07-10') });
    mock.site.create.mockResolvedValue(row);
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });

    const result = await siteService.create({
      ...baseInput, siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-10T00:00:00.000Z',
      sitePeriodEnd:   '2026-07-10T00:00:00.000Z',
    }, 'u1');

    expect(result.periodDays).toBe(1);
  });
});

// ── toSiteResponse: hasPeriod + periodDays ──────────────────────────────────────

describe('siteService — hasPeriod and periodDays', () => {
  it('hasPeriod = true for TEMPORARY', async () => {
    const row = makeSiteRow({ siteType: 'TEMPORARY', sitePeriodStart: new Date('2026-07-01'), sitePeriodEnd: new Date('2026-07-03') });
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });
    const result = await siteService.getById('s1');
    expect(result.hasPeriod).toBe(true);
    expect(result.periodDays).toBe(3);
  });

  it('hasPeriod = true for SPECIAL_DUTIES', async () => {
    const row = makeSiteRow({ siteType: 'SPECIAL_DUTIES', sitePeriodStart: new Date('2026-01-01'), sitePeriodEnd: new Date('2026-01-01') });
    mock.site.findUnique.mockResolvedValue({ ...row, deployments: [] });
    const result = await siteService.getById('s1');
    expect(result.hasPeriod).toBe(true);
    expect(result.periodDays).toBe(1);
  });

  it('hasPeriod = false for REGULAR', async () => {
    mock.site.findUnique.mockResolvedValue({ ...makeSiteRow(), deployments: [] });
    const result = await siteService.getById('s1');
    expect(result.hasPeriod).toBe(false);
    expect(result.periodDays).toBeNull();
  });

  it('hasPeriod = false for PERMANENT', async () => {
    mock.site.findUnique.mockResolvedValue({ ...makeSiteRow({ siteType: 'PERMANENT' }), deployments: [] });
    const result = await siteService.getById('s1');
    expect(result.hasPeriod).toBe(false);
  });
});

// ── update() type change ────────────────────────────────────────────────────────

describe('siteService.update() — period type change', () => {
  it('TEMPORARY → PERMANENT clears period dates', async () => {
    const existing = makeSiteRow({ siteType: 'TEMPORARY', sitePeriodStart: new Date('2026-07-01'), sitePeriodEnd: new Date('2026-09-30') });
    mock.site.findUnique.mockResolvedValueOnce(existing).mockResolvedValue({ ...makeSiteRow({ siteType: 'PERMANENT' }), deployments: [] });
    const captured: Record<string, unknown>[] = [];
    mock.site.update.mockImplementation((args: { data: Record<string, unknown> }) => { captured.push(args.data); return Promise.resolve(makeSiteRow()); });

    await siteService.update('s1', { siteType: 'PERMANENT' }, 'u1');
    expect(captured[0]!['sitePeriodStart']).toBeNull();
    expect(captured[0]!['sitePeriodEnd']).toBeNull();
  });

  it('PERMANENT → TEMPORARY without dates → 400', async () => {
    mock.site.findUnique.mockResolvedValue(makeSiteRow({ siteType: 'PERMANENT' }));
    await expect(siteService.update('s1', { siteType: 'TEMPORARY' }, 'u1')).rejects.toThrow(AppError);
  });

  it('PERMANENT → TEMPORARY with dates → succeeds', async () => {
    const existing = makeSiteRow({ siteType: 'PERMANENT' });
    mock.site.findUnique.mockResolvedValueOnce(existing).mockResolvedValue({ ...makeSiteRow({ siteType: 'TEMPORARY' }), deployments: [] });
    mock.site.update.mockResolvedValue(makeSiteRow());

    await expect(siteService.update('s1', {
      siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-09-30T00:00:00.000Z',
    }, 'u1')).resolves.toBeDefined();
  });
});
