import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client:            { findUnique: vi.fn() },
    shiftTypeConfig: { findUnique: vi.fn(), findMany: vi.fn() },
    site:              { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    siteEquipmentItem: { createMany: vi.fn(), deleteMany: vi.fn() },
    deployment:        { count: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { siteService } from '../../services/siteService';
import { AppError, NotFoundError } from '../../errors/AppError';

// ── Typed mock handles ─────────────────────────────────────────────────────────

type MockPrisma = {
  client:            { findUnique: ReturnType<typeof vi.fn> };
  shiftTypeConfig: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  site:              {
    findUnique: ReturnType<typeof vi.fn>;
    findMany:   ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    update:     ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
  };
  siteEquipmentItem: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  deployment:        { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseClient = { id: 'c1', clientName: 'KCCA' };
const baseShift  = { code: 'DAY', isActive: true };

const baseSiteRow = {
  id:                  's1',
  clientId:            'c1',
  siteName:            'City Hall',
  location:            'Kampala CBD',
  gpsLat:              null,
  gpsLon:              null,
  siteManagerName:     null,
  siteManagerContact:  null,
  specialInstructions: null,
  guardsRequired:      4,
  siteType:            'PERMANENT',
  armedGuardsRequired: 0,
  firearmsRequired:    0,
  batonRequired:       0,
  otherWeaponsNotes:   null,
  equipmentDetails:    null,
  allowedShiftTypes:   [],
  defaultShiftType:    null,
  equipmentItems:      [],
  createdAt:           new Date('2026-01-01'),
  updatedAt:           new Date('2026-01-01'),
  client:              { clientName: 'KCCA' },
  _count:              { deployments: 0, attendance: 0, incidents: 0 },
};

const baseCreateInput = {
  clientId:            'c1',
  siteName:            'City Hall',
  location:            'Kampala CBD',
  guardsRequired:      4,
  siteType:            'PERMANENT' as const,
  armedGuardsRequired: 0,
  firearmsRequired:    0,
  batonRequired:       0,
  allowedShiftTypes:   [],
  equipmentItems:      [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.client.findUnique.mockResolvedValue(baseClient);
  mock.shiftTypeConfig.findUnique.mockResolvedValue(baseShift);
  mock.shiftTypeConfig.findMany.mockResolvedValue([baseShift]);
  mock.site.findUnique.mockResolvedValue(baseSiteRow);
  mock.site.create.mockResolvedValue(baseSiteRow);
  mock.site.update.mockResolvedValue(baseSiteRow);
  mock.site.delete.mockResolvedValue({});
  mock.siteEquipmentItem.createMany.mockResolvedValue({ count: 0 });
  mock.siteEquipmentItem.deleteMany.mockResolvedValue({ count: 0 });
  mock.deployment.count.mockResolvedValue(0);
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('siteService.create()', () => {
  it('persists the selected zoneId', async () => {
    await siteService.create({ ...baseCreateInput, zoneId: 'zone-1' }, 'user1');

    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ zoneId: 'zone-1' }),
      }),
    );
  });

  it('creates site with siteType = PERMANENT by default', async () => {
    await siteService.create(baseCreateInput, 'user1');

    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siteType: 'PERMANENT' }),
      }),
    );
  });

  it('creates site with siteType = TEMPORARY (with period dates)', async () => {
    await siteService.create({
      ...baseCreateInput, siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-09-30T00:00:00.000Z',
    }, 'user1');

    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siteType: 'TEMPORARY' }),
      }),
    );
  });

  it('creates site with siteType = SPECIAL_DUTIES', async () => {
    await siteService.create({
      ...baseCreateInput,
      siteType:             'SPECIAL_DUTIES',
      sitePeriodStart: '2026-07-10T00:00:00.000Z',
      sitePeriodEnd:   '2026-07-12T00:00:00.000Z',
    }, 'user1');

    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siteType: 'SPECIAL_DUTIES' }),
      }),
    );
  });

  it('creates site with armedGuardsRequired = 3', async () => {
    await siteService.create({ ...baseCreateInput, armedGuardsRequired: 3 }, 'user1');
    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ armedGuardsRequired: 3 }) }),
    );
  });

  it('creates site with firearmsRequired = 2 and armedGuardsRequired = 2', async () => {
    await siteService.create({ ...baseCreateInput, armedGuardsRequired: 2, firearmsRequired: 2 }, 'user1');
    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ firearmsRequired: 2 }) }),
    );
  });

  it('throws 400 when firearmsRequired > 0 but armedGuardsRequired = 0', async () => {
    await expect(
      siteService.create({ ...baseCreateInput, firearmsRequired: 2, armedGuardsRequired: 0 }, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('creates site with batonRequired = 5', async () => {
    await siteService.create({ ...baseCreateInput, batonRequired: 5 }, 'user1');
    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batonRequired: 5 }) }),
    );
  });

  it('creates equipment items when provided', async () => {
    const items = [
      { itemName: 'Baton', quantity: 4, notes: undefined },
      { itemName: 'Radio', quantity: 2, notes: 'Channel 5' },
    ];

    await siteService.create({ ...baseCreateInput, equipmentItems: items }, 'user1');

    expect(mock.siteEquipmentItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ itemName: 'Baton', quantity: 4, siteId: 's1' }),
          expect.objectContaining({ itemName: 'Radio', quantity: 2, siteId: 's1' }),
        ]),
      }),
    );
  });

  it('creates site with no equipment items — skips createMany', async () => {
    await siteService.create({ ...baseCreateInput, equipmentItems: [] }, 'user1');

    expect(mock.siteEquipmentItem.createMany).not.toHaveBeenCalled();
  });

  it('creates site with allowedShiftTypes = [DAY, NIGHT]', async () => {
    mock.shiftTypeConfig.findMany.mockResolvedValue([
      { code: 'DAY', isActive: true },
      { code: 'NIGHT', isActive: true },
    ]);

    await siteService.create({ ...baseCreateInput, allowedShiftTypes: ['DAY', 'NIGHT'] }, 'user1');

    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ allowedShiftTypes: ['DAY', 'NIGHT'] }),
      }),
    );
  });

  it('always writes null for defaultShiftType (field removed from form)', async () => {
    await siteService.create(baseCreateInput, 'user1');
    expect(mock.site.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ defaultShiftType: null }) }),
    );
  });

  it('throws 400 when allowedShiftTypes contains invalid code', async () => {
    mock.shiftTypeConfig.findMany.mockResolvedValue([]); // no matching valid codes

    await expect(
      siteService.create({ ...baseCreateInput, allowedShiftTypes: ['BOGUS'] }, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('creates audit log entry on creation', async () => {
    await siteService.create(baseCreateInput, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SITE_CREATED', entity: 'site' }),
    );
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('siteService.update()', () => {
  it('updates siteType from PERMANENT to TEMPORARY (with period dates)', async () => {
    const updated = { ...baseSiteRow, siteType: 'TEMPORARY', sitePeriodStart: new Date('2026-07-01'), sitePeriodEnd: new Date('2026-09-30') };
    mock.site.update.mockResolvedValue(updated);
    mock.site.findUnique.mockResolvedValueOnce(baseSiteRow).mockResolvedValue({ ...updated, deployments: [] });

    await siteService.update('s1', {
      siteType: 'TEMPORARY',
      sitePeriodStart: '2026-07-01T00:00:00.000Z',
      sitePeriodEnd:   '2026-09-30T00:00:00.000Z',
    }, 'user1');

    expect(mock.site.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ siteType: 'TEMPORARY' }) }),
    );
  });

  it('replaces equipment items with new set', async () => {
    await siteService.update('s1', { equipmentItems: [{ itemName: 'Radio', quantity: 1 }] }, 'user1');

    expect(mock.siteEquipmentItem.deleteMany).toHaveBeenCalledWith({ where: { siteId: 's1' } });
    expect(mock.siteEquipmentItem.createMany).toHaveBeenCalledTimes(1);
  });

  it('clears equipment items when empty array passed', async () => {
    await siteService.update('s1', { equipmentItems: [] }, 'user1');

    expect(mock.siteEquipmentItem.deleteMany).toHaveBeenCalledWith({ where: { siteId: 's1' } });
    expect(mock.siteEquipmentItem.createMany).not.toHaveBeenCalled();
  });

  it('does not touch equipmentItems when field is undefined', async () => {
    await siteService.update('s1', { siteName: 'New Name' }, 'user1');

    expect(mock.siteEquipmentItem.deleteMany).not.toHaveBeenCalled();
  });

  it('updates allowedShiftTypes', async () => {
    mock.shiftTypeConfig.findMany.mockResolvedValue([{ code: 'NIGHT', isActive: true }]);

    await siteService.update('s1', { allowedShiftTypes: ['NIGHT'] }, 'user1');

    expect(mock.site.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowedShiftTypes: ['NIGHT'] }) }),
    );
  });

  it('creates audit log on update', async () => {
    await siteService.update('s1', { siteName: 'Updated' }, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SITE_UPDATED' }),
    );
  });

  it('throws NotFoundError when site not found', async () => {
    mock.site.findUnique.mockResolvedValue(null);

    await expect(siteService.update('bad', { siteName: 'X' }, 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('siteService.getById()', () => {
  it('includes equipmentItems in response', async () => {
    mock.site.findUnique.mockResolvedValue({
      ...baseSiteRow,
      equipmentItems: [{ id: 'ei1', itemName: 'Baton', quantity: 2, notes: null }],
      deployments:    [],
    });

    const result = await siteService.getById('s1');

    expect(result.equipmentItems).toHaveLength(1);
    expect(result.equipmentItems[0].itemName).toBe('Baton');
  });

  it('throws NotFoundError when site not found', async () => {
    mock.site.findUnique.mockResolvedValue(null);

    await expect(siteService.getById('bad')).rejects.toThrow(NotFoundError);
  });
});
