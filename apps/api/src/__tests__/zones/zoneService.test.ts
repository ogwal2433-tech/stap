import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    zone: {
      findMany:  vi.fn(),
      findUnique: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
      delete:    vi.fn(),
    },
    site: {
      findMany:    vi.fn(),
      updateMany:  vi.fn(),
      count:       vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { zoneService } from '../../services/zoneService';
import { AppError, NotFoundError } from '../../errors/AppError';

// ── Typed mock handles ─────────────────────────────────────────────────────────

type MockPrisma = {
  zone: {
    findMany:   ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    update:     ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
  };
  site: {
    findMany:   ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseUser = { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'OPERATIONS_SUPERVISOR' };
const baseUser2 = { id: 'u2', name: 'Bob', email: 'bob@test.com', role: 'FIELD_SUPERVISOR' };

const baseZoneRow = {
  id:          'z1',
  name:        'Central Zone',
  description: 'Main zone',
  supervisorId: 'u1',
  alternateId:  null,
  isActive:    true,
  createdBy:   'admin1',
  createdAt:   new Date('2026-01-01'),
  updatedAt:   new Date('2026-01-01'),
  supervisor:  baseUser,
  alternate:   null,
  sites:       [],
};

const baseZoneSummaryRow = {
  ...baseZoneRow,
  _count: { sites: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.zone.findMany.mockResolvedValue([baseZoneSummaryRow]);
  mock.zone.findUnique.mockResolvedValue(baseZoneRow);
  mock.zone.create.mockResolvedValue(baseZoneRow);
  mock.zone.update.mockResolvedValue(baseZoneRow);
  mock.zone.delete.mockResolvedValue({});
  mock.site.findMany.mockResolvedValue([]);
  mock.site.updateMany.mockResolvedValue({ count: 0 });
  mock.site.count.mockResolvedValue(0);
  mock.user.findUnique.mockResolvedValue(baseUser);
});

// ── list() ────────────────────────────────────────────────────────────────────

describe('zoneService.list()', () => {
  it('returns zone summaries', async () => {
    const result = await zoneService.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Central Zone');
    expect(result[0].siteCount).toBe(0);
  });

  it('passes activeOnly filter when true', async () => {
    await zoneService.list(true);
    expect(mock.zone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('passes no where filter when activeOnly is false', async () => {
    await zoneService.list(false);
    expect(mock.zone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('zoneService.getById()', () => {
  it('returns full zone with sites', async () => {
    const result = await zoneService.getById('z1');
    expect(result.id).toBe('z1');
    expect(result.supervisor?.name).toBe('Alice');
    expect(result.sites).toHaveLength(0);
  });

  it('throws NotFoundError when zone not found', async () => {
    mock.zone.findUnique.mockResolvedValue(null);
    await expect(zoneService.getById('bad')).rejects.toThrow(NotFoundError);
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('zoneService.create()', () => {
  it('creates a zone with name and supervisor', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(null); // no name conflict
    await zoneService.create({ name: 'New Zone', supervisorId: 'u1' }, 'admin1');
    expect(mock.zone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'New Zone', supervisorId: 'u1', createdBy: 'admin1' }),
      }),
    );
  });

  it('throws 409 when zone name already taken', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(baseZoneRow); // name conflict
    await expect(
      zoneService.create({ name: 'Central Zone' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 400 when supervisor user not found', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(null);
    mock.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      zoneService.create({ name: 'New Zone', supervisorId: 'ghost' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when supervisor and alternate are same person', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(null);
    mock.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      zoneService.create({ name: 'New Zone', supervisorId: 'u1', alternateId: 'u1' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates audit log on creation', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(null);
    await zoneService.create({ name: 'Logged Zone' }, 'admin1');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ZONE_CREATED', entity: 'zone' }),
    );
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('zoneService.update()', () => {
  it('updates zone name', async () => {
    mock.zone.findUnique
      .mockResolvedValueOnce(baseZoneRow) // assertZoneExists
      .mockResolvedValueOnce(null)        // name conflict check
      .mockResolvedValue(baseZoneRow);    // ZONE_INCLUDE re-fetch inside update

    await zoneService.update('z1', { name: 'New Name' }, 'admin1');
    expect(mock.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New Name' }) }),
    );
  });

  it('throws NotFoundError when zone not found', async () => {
    mock.zone.findUnique.mockResolvedValueOnce(null);
    await expect(zoneService.update('bad', { name: 'X' }, 'admin1')).rejects.toThrow(NotFoundError);
  });

  it('throws 409 when new name conflicts with existing zone', async () => {
    mock.zone.findUnique
      .mockResolvedValueOnce(baseZoneRow)                   // assertZoneExists
      .mockResolvedValueOnce({ ...baseZoneRow, id: 'z99' }); // conflict

    await expect(
      zoneService.update('z1', { name: 'Taken Name' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── assignSites() ─────────────────────────────────────────────────────────────

describe('zoneService.assignSites()', () => {
  it('assigns sites to zone', async () => {
    mock.site.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    mock.zone.findUnique
      .mockResolvedValueOnce(baseZoneRow)  // assertZoneExists
      .mockResolvedValueOnce(baseZoneRow); // getById

    await zoneService.assignSites('z1', ['s1', 's2'], 'admin1');
    expect(mock.site.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1', 's2'] } },
      data:  { zoneId: 'z1' },
    });
  });

  it('throws 400 when a site ID is not found', async () => {
    mock.site.findMany.mockResolvedValue([{ id: 's1' }]); // only 1, requested 2

    await expect(
      zoneService.assignSites('z1', ['s1', 'missing'], 'admin1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── removeSites() ─────────────────────────────────────────────────────────────

describe('zoneService.removeSites()', () => {
  it('removes sites from zone', async () => {
    mock.zone.findUnique
      .mockResolvedValueOnce(baseZoneRow)
      .mockResolvedValueOnce(baseZoneRow);

    await zoneService.removeSites('z1', ['s1'], 'admin1');
    expect(mock.site.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] }, zoneId: 'z1' },
      data:  { zoneId: null },
    });
  });
});

// ── deactivate() / activate() ─────────────────────────────────────────────────

describe('zoneService.deactivate()', () => {
  it('sets isActive to false', async () => {
    await zoneService.deactivate('z1', 'admin1');
    expect(mock.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
});

describe('zoneService.activate()', () => {
  it('sets isActive to true', async () => {
    await zoneService.activate('z1', 'admin1');
    expect(mock.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });
});

// ── delete() ──────────────────────────────────────────────────────────────────

describe('zoneService.delete()', () => {
  it('deletes zone with no sites', async () => {
    mock.site.count.mockResolvedValue(0);
    await zoneService.delete('z1', 'admin1');
    expect(mock.zone.delete).toHaveBeenCalledWith({ where: { id: 'z1' } });
  });

  it('throws 409 when zone has assigned sites', async () => {
    mock.site.count.mockResolvedValue(3);
    await expect(zoneService.delete('z1', 'admin1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws NotFoundError when zone not found', async () => {
    mock.zone.findUnique.mockResolvedValue(null);
    await expect(zoneService.delete('bad', 'admin1')).rejects.toThrow(NotFoundError);
  });
});
