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
      findMany:   vi.fn(),
      createMany: vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      count:      vi.fn(),
      delete:     vi.fn(),
      findFirst:  vi.fn(),
    },
    deploymentHistory: { createMany: vi.fn() },
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

type MockedPrisma = {
  site:       { findUnique: ReturnType<typeof vi.fn> };
  guard:      { findMany: ReturnType<typeof vi.fn> };
  user:       { findUnique: ReturnType<typeof vi.fn> };
  shiftTypeConfig:  { findUnique: ReturnType<typeof vi.fn> };
  deployment: {
    findMany:   ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
    findFirst:  ReturnType<typeof vi.fn>;
  };
  deploymentHistory: { createMany: ReturnType<typeof vi.fn> };
  attendanceRecord:  { findFirst: ReturnType<typeof vi.fn> };
};

const mp = prisma as unknown as MockedPrisma;

// ── Shared fixtures ────────────────────────────────────────────────────────────

const SITE   = { id: 's1', siteName: 'Alpha HQ', client: { clientName: 'Alpha Corp' } };
const SUPER  = { id: 'u1', name: 'Sup One', role: 'OPERATIONS_SUPERVISOR' };
const GUARD1 = { id: 'g1', firstName: 'John', lastName: 'Doe',   otherNames: null, employmentStatus: 'ACTIVE', isIncompleteNID: false };
const GUARD2 = { id: 'g2', firstName: 'Jane', lastName: 'Smith', otherNames: null, employmentStatus: 'ACTIVE', isIncompleteNID: false };
const GUARD3 = { id: 'g3', firstName: 'Bob',  lastName: 'Jones', otherNames: null, employmentStatus: 'ACTIVE', isIncompleteNID: false };

const BASE_INPUT = {
  siteId:      's1',
  guardIds:    ['g1'],
  supervisorId:'u1',
  shiftType:   'DAY' as const,
  startDate:   '2026-04-14T00:00:00.000Z',
  recurring:   false,
};

const deployed = (guardId: string, siteName = 'Beta Site', clientName = 'Beta Corp') => ({
  guardId,
  siteId: 's2',
  site: { siteName, client: { clientName } },
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.shiftTypeConfig.findUnique.mockResolvedValue({ code: 'DAY', isActive: true });
  mp.site.findUnique.mockResolvedValue(SITE);
  mp.guard.findMany.mockResolvedValue([GUARD1]);
  mp.user.findUnique.mockResolvedValue(SUPER);
  mp.deployment.findMany.mockResolvedValue([]);
  mp.deployment.createMany.mockResolvedValue({ count: 1 });
  mp.deploymentHistory.createMany.mockResolvedValue({ count: 1 });
});

// ── createRoster() conflict detection ─────────────────────────────────────────

describe('createRoster() — conflict detection', () => {
  it('TEST 1: single guard with no conflict → created=1, conflicts=[]', async () => {
    const result = await deploymentService.createRoster(BASE_INPUT, 'user1');

    expect(result.created).toBe(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(mp.deployment.createMany).toHaveBeenCalledTimes(1);
  });

  it('TEST 2: single guard already deployed on that date → created=0, conflicts=[1 entry], skipped=1', async () => {
    mp.deployment.findMany.mockResolvedValue([deployed('g1')]);

    const result = await deploymentService.createRoster(BASE_INPUT, 'user1');

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].guardId).toBe('g1');
    expect(result.conflicts[0].existingSite).toBe('Beta Site');
    expect(result.conflicts[0].existingClient).toBe('Beta Corp');
    expect(mp.deployment.createMany).not.toHaveBeenCalled();
  });

  it('TEST 3: three guards, one conflict → created=2, conflicts=[1 entry]', async () => {
    mp.guard.findMany.mockResolvedValue([GUARD1, GUARD2, GUARD3]);
    mp.deployment.findMany.mockResolvedValue([deployed('g2')]);
    mp.deployment.createMany.mockResolvedValue({ count: 2 });

    const result = await deploymentService.createRoster(
      { ...BASE_INPUT, guardIds: ['g1', 'g2', 'g3'] },
      'user1',
    );

    expect(result.created).toBe(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].guardId).toBe('g2');
    expect(result.skipped).toBe(1);
  });

  it('TEST 4: all three guards have conflicts → created=0, conflicts=[3 entries]', async () => {
    mp.guard.findMany.mockResolvedValue([GUARD1, GUARD2, GUARD3]);
    mp.deployment.findMany.mockResolvedValue([
      deployed('g1', 'Site A', 'Client A'),
      deployed('g2', 'Site B', 'Client B'),
      deployed('g3', 'Site C', 'Client C'),
    ]);

    const result = await deploymentService.createRoster(
      { ...BASE_INPUT, guardIds: ['g1', 'g2', 'g3'] },
      'user1',
    );

    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(3);
    expect(result.skipped).toBe(3);
    expect(mp.deployment.createMany).not.toHaveBeenCalled();
  });
});

// ── createRoster() guard eligibility ──────────────────────────────────────────

describe('createRoster() — guard eligibility validation', () => {
  it('TEST 5: SUSPENDED guard → throws AppError 400', async () => {
    mp.guard.findMany.mockResolvedValue([
      { ...GUARD1, employmentStatus: 'SUSPENDED' },
    ]);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toThrow(AppError);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('TEST 6: TERMINATED guard → throws AppError 400', async () => {
    mp.guard.findMany.mockResolvedValue([
      { ...GUARD1, employmentStatus: 'TERMINATED' },
    ]);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toThrow(AppError);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('TEST 7: a guard with an incomplete NID can be rostered', async () => {
    // This used to be refused. Blocking it also kept those guards out of the
    // roster builder — on one database 186 of 485 active guards, absent with
    // nothing saying why. The gap is still recorded on the guard and still
    // reported; it no longer stops them working.
    mp.guard.findMany.mockResolvedValue([
      { ...GUARD1, isIncompleteNID: true },
    ]);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).resolves.toBeDefined();
  });

  it('TEST 8: guard ID does not exist → throws NotFoundError', async () => {
    mp.guard.findMany.mockResolvedValue([]); // guard not in DB

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('TEST 9: site does not exist → throws NotFoundError', async () => {
    mp.site.findUnique.mockResolvedValue(null);

    await expect(
      deploymentService.createRoster(BASE_INPUT, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── createRoster() date & message details ─────────────────────────────────────

describe('createRoster() — date normalisation & conflict message', () => {
  it('TEST 10: non-midnight startDate is normalised to midnight UTC in created records', async () => {
    const result = await deploymentService.createRoster(
      { ...BASE_INPUT, startDate: '2026-04-14T15:30:45.123Z' },
      'user1',
    );

    expect(result.created).toBe(1);
    const createdData = mp.deployment.createMany.mock.calls[0][0].data as Array<{ date: Date }>;
    const createdDate = createdData[0].date;
    expect(createdDate.getUTCHours()).toBe(0);
    expect(createdDate.getUTCMinutes()).toBe(0);
    expect(createdDate.getUTCSeconds()).toBe(0);
    expect(createdDate.getUTCMilliseconds()).toBe(0);
  });

  it('TEST 11: conflict message contains guard name, site name, and client name', async () => {
    mp.deployment.findMany.mockResolvedValue([
      deployed('g1', 'Nakivubo Market', 'Shoprite Uganda'),
    ]);

    const result = await deploymentService.createRoster(BASE_INPUT, 'user1');

    expect(result.conflicts[0].message).toContain('John Doe');
    expect(result.conflicts[0].message).toContain('Nakivubo Market');
    expect(result.conflicts[0].message).toContain('Shoprite Uganda');
  });
});

// ── isGuardAvailable() ─────────────────────────────────────────────────────────

describe('deploymentService.isGuardAvailable()', () => {
  it('TEST 12: guard not deployed on that date → { available: true }', async () => {
    mp.deployment.findUnique.mockResolvedValue(null);

    const result = await deploymentService.isGuardAvailable('g1', '2026-04-14');

    expect(result.available).toBe(true);
    expect(result.deployment).toBeUndefined();
  });

  it('TEST 13: guard already deployed → { available: false, deployment: {...} }', async () => {
    mp.deployment.findUnique.mockResolvedValue({
      id: 'd1',
      guardId: 'g1',
      shiftType: 'NIGHT',
      site: { siteName: 'Central Prison', client: { clientName: 'UPS Ltd' } },
    });

    const result = await deploymentService.isGuardAvailable('g1', '2026-04-14');

    expect(result.available).toBe(false);
    expect(result.deployment?.siteName).toBe('Central Prison');
    expect(result.deployment?.clientName).toBe('UPS Ltd');
    expect(result.deployment?.shiftType).toBe('NIGHT');
  });
});

// ── copyPreviousRoster() with unique-constraint awareness ─────────────────────

describe('copyPreviousRoster() — target date conflict checks', () => {
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

  it('TEST 14: guard already deployed on target date → skipped=1, created=0', async () => {
    mp.deployment.findMany.mockResolvedValue([sourceDeployment]);
    mp.deployment.findUnique.mockResolvedValue({ id: 'd-existing' });

    const result = await deploymentService.copyPreviousRoster('2026-04-14', '2026-04-15', 'user1');

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mp.deployment.create).not.toHaveBeenCalled();
  });

  it('TEST 15: all guards available on target date → all copied, skipped=0', async () => {
    const source2 = { ...sourceDeployment, id: 'd2', guardId: 'g2', guard: { id: 'g2', employmentStatus: 'ACTIVE' } };
    mp.deployment.findMany.mockResolvedValue([sourceDeployment, source2]);
    mp.deployment.findUnique.mockResolvedValue(null);
    mp.deployment.create.mockResolvedValue({});

    const result = await deploymentService.copyPreviousRoster('2026-04-14', '2026-04-15', 'user1');

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mp.deployment.create).toHaveBeenCalledTimes(2);
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROSTER_COPIED' }),
    );
  });
});
