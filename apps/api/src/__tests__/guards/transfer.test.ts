import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@security360/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findUnique: vi.fn(),
    },
    site: {
      findUnique: vi.fn(),
    },
    guardTransfer: {
      create:   vi.fn(),
      findMany: vi.fn(),
    },
    deploymentHistory: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    deployment: {
      updateMany: vi.fn(),
    },
    attendanceRecord: {
      findMany:   vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    shiftTypeConfig: {
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

vi.mock('../../services/settingsService', () => ({
  settingsService: { get: vi.fn().mockResolvedValue(null) },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { guardService } from '../../services/guardService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mp      = prisma as any;
const mockNotif = notificationService as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const activeGuard = {
  id:               'g1',
  firstName:        'Samuel',
  lastName:         'Wanyama',
  employmentStatus: 'ACTIVE' as const,
};

const toSite = {
  id:       'site-2',
  siteName: 'City Mall',
  client:   { clientName: 'Mall Corp' },
};

const currentDeployment = {
  id:        'dh-1',
  guardId:   'g1',
  siteId:    'site-1',
  endDate:   null,
  startDate: new Date('2026-01-01'),
  site: {
    id:       'site-1',
    siteName: 'Warehouse A',
    client:   { clientName: 'Storage Ltd' },
  },
};

const transferRecord = {
  id:          'tr-1',
  guardId:     'g1',
  fromSiteId:  null,
  toSiteId:    'site-2',
  reason:      'Operational requirement',
  transferDate: new Date('2026-05-18'),
  authorisedBy: 'user1',
  createdAt:   new Date(),
  guard:       { firstName: 'Samuel', lastName: 'Wanyama', otherNames: null },
  fromSite:    null,
  toSite:      { id: 'site-2', siteName: 'City Mall', client: { clientName: 'Mall Corp' } },
  authorisedByUser: { name: 'Alice Admin' },
};

const transferInput = {
  toSiteId:     'site-2',
  reason:       'Operational requirement',
  transferDate: new Date('2026-05-18').toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.deploymentHistory.create.mockResolvedValue({});
  mp.deploymentHistory.findFirst.mockResolvedValue(currentDeployment);
  mp.deploymentHistory.update.mockResolvedValue({});
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);

  // Attendance relocation: nothing rostered ahead unless a test says otherwise.
  mp.deployment.updateMany.mockResolvedValue({ count: 0 });
  mp.attendanceRecord.findMany.mockResolvedValue([]);
  mp.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
  mp.attendanceRecord.deleteMany.mockResolvedValue({ count: 0 });
  mp.shiftTypeConfig.findMany.mockResolvedValue([{ code: 'DAY' }, { code: 'NIGHT' }, { code: 'FULL_24' }]);
});

// ── transferGuard(): happy path ────────────────────────────────────────────────

describe('guardService.transferGuard() — success', () => {
  beforeEach(() => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.site.findUnique.mockResolvedValue(toSite);
    mp.guardTransfer.create.mockResolvedValue(transferRecord);
  });

  it('creates a GuardTransfer record', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.guardTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardId:  'g1',
          toSiteId: 'site-2',
          reason:   'Operational requirement',
          authorisedBy: 'user1',
        }),
      }),
    );
  });

  it('creates a deploymentHistory entry for the new site', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.deploymentHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardId: 'g1',
          siteId:  'site-2',
        }),
      }),
    );
  });

  it('returns a GuardTransferResponse shaped object', async () => {
    const result = await guardService.transferGuard('g1', transferInput, 'user1');

    expect(result).toMatchObject({
      id:     'tr-1',
      guard:  expect.objectContaining({ fullName: 'Samuel Wanyama' }),
      toSite: expect.objectContaining({ siteName: 'City Mall' }),
      reason: 'Operational requirement',
    });
  });
});

// ── transferGuard(): error cases ───────────────────────────────────────────────

describe('guardService.transferGuard() — error cases', () => {
  it('throws 400 when guard is not ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue({ ...activeGuard, employmentStatus: 'SUSPENDED' });

    await expect(
      guardService.transferGuard('g1', transferInput, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws AppError with descriptive message when guard is not ACTIVE', async () => {
    mp.guard.findUnique.mockResolvedValue({ ...activeGuard, employmentStatus: 'TERMINATED' });

    await expect(
      guardService.transferGuard('g1', transferInput, 'user1'),
    ).rejects.toThrow(AppError);
  });

  it('throws NotFoundError when guard does not exist', async () => {
    mp.guard.findUnique.mockResolvedValue(null);

    await expect(
      guardService.transferGuard('no-such-guard', transferInput, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when toSite does not exist', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.site.findUnique.mockResolvedValue(null);

    await expect(
      guardService.transferGuard('g1', transferInput, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws 400 when guard has no active deployment', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.deploymentHistory.findFirst.mockResolvedValue(null);

    await expect(
      guardService.transferGuard('g1', transferInput, 'user1'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('not currently deployed'),
    });
  });

  it('throws 400 when guard is SUSPENDED regardless of deployment status', async () => {
    mp.guard.findUnique.mockResolvedValue({ ...activeGuard, employmentStatus: 'SUSPENDED' });
    mp.deploymentHistory.findFirst.mockResolvedValue(currentDeployment);

    await expect(
      guardService.transferGuard('g1', transferInput, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
    // the deployment status was never even queried — employment status is checked first
    expect(mp.deploymentHistory.findFirst).not.toHaveBeenCalled();
  });

  it('throws 400 when fromSiteId does not match the guard\'s actual current deployment site', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.deploymentHistory.findFirst.mockResolvedValue(currentDeployment);

    await expect(
      guardService.transferGuard('g1', { ...transferInput, fromSiteId: 'wrong-site' }, 'user1'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Warehouse A'),
    });
  });

  it('throws 400 when toSiteId is the same as the resolved fromSiteId', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.deploymentHistory.findFirst.mockResolvedValue(currentDeployment);

    await expect(
      guardService.transferGuard('g1', { ...transferInput, toSiteId: 'site-1' }, 'user1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── transferGuard(): deployment auto-detection ────────────────────────────────

describe('guardService.transferGuard() — deployment auto-detection', () => {
  beforeEach(() => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.site.findUnique.mockResolvedValue(toSite);
    mp.deploymentHistory.findFirst.mockResolvedValue(currentDeployment);
    mp.guardTransfer.create.mockResolvedValue(transferRecord);
  });

  it('succeeds when guard has an active deployment and toSiteId is a different valid site', async () => {
    const result = await guardService.transferGuard('g1', transferInput, 'user1');
    expect(result).toMatchObject({ id: 'tr-1' });
  });

  it('auto-populates fromSiteId from the guard\'s most recent deployment when not provided', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.guardTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromSiteId: 'site-1' }),
      }),
    );
  });

  it('closes the previous deployment history entry (sets endDate)', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.deploymentHistory.update).toHaveBeenCalledWith({
      where: { id: 'dh-1' },
      data:  { endDate: new Date(transferInput.transferDate) },
    });
  });
});

// ── transferGuard(): side effects ─────────────────────────────────────────────

describe('guardService.transferGuard() — side effects', () => {
  beforeEach(() => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.site.findUnique.mockResolvedValue(toSite);
    mp.guardTransfer.create.mockResolvedValue(transferRecord);
  });

  it('sends notification to OPERATIONS_SUPERVISOR', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mockNotif.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({
        role:  ROLES.OPERATIONS_SUPERVISOR,
        type:  'SYSTEM',
        title: 'Guard Transferred',
      }),
    );
    const msg: string = mockNotif.sendToRole.mock.calls[0][0].message;
    expect(msg).toContain('Samuel');
    expect(msg).toContain('City Mall');
  });

  it('creates audit log with GUARD_TRANSFERRED action', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action:   'GUARD_TRANSFERRED',
        entity:   'guard',
        entityId: 'g1',
        newValue: expect.objectContaining({
          fromSiteId:    'site-1',
          fromSiteName:  'Warehouse A',
          toSiteId:      'site-2',
          toSiteName:    'City Mall',
          reason:        'Operational requirement',
          effectiveDate: '2026-05-18T00:00:00.000Z',
          transferredBy: 'user1',
        }),
      }),
    });
  });
});

// ── Attendance follows the transfer ────────────────────────────────────────────

describe('guardService.transferGuard() — attendance follows the guard', () => {
  beforeEach(() => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.site.findUnique.mockResolvedValue(toSite);
    mp.guardTransfer.create.mockResolvedValue(transferRecord);
  });

  it('repoints deployments at the old site from the effective date onwards', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.deployment.updateMany).toHaveBeenCalledWith({
      where: {
        guardId: 'g1',
        siteId:  'site-1',
        date:    { gte: new Date('2026-05-18T00:00:00.000Z') },
      },
      data: expect.objectContaining({ siteId: 'site-2' }),
    });
  });

  it('leaves deployments before the effective date at the old site', async () => {
    await guardService.transferGuard('g1', transferInput, 'user1');

    // The only filter on date is `gte` the transfer date — nothing earlier is touched.
    const where = mp.deployment.updateMany.mock.calls[0][0].where;
    expect(where.date.lt).toBeUndefined();
    expect(where.date.gte).toEqual(new Date('2026-05-18T00:00:00.000Z'));
  });

  it('moves forward-dated attendance to the new site', async () => {
    mp.attendanceRecord.findMany
      .mockResolvedValueOnce([
        { id: 'a1', date: new Date('2026-05-19T00:00:00.000Z') },
        { id: 'a2', date: new Date('2026-05-20T00:00:00.000Z') },
      ])
      .mockResolvedValueOnce([]);   // nothing already recorded at the new site

    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.attendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] } },
      data:  { siteId: 'site-2' },
    });
    expect(mp.attendanceRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('drops the old row when the new site already has attendance for that day', async () => {
    const clashDate = new Date('2026-05-19T00:00:00.000Z');
    mp.attendanceRecord.findMany
      .mockResolvedValueOnce([
        { id: 'a1', date: clashDate },
        { id: 'a2', date: new Date('2026-05-20T00:00:00.000Z') },
      ])
      .mockResolvedValueOnce([{ date: clashDate }]);

    await guardService.transferGuard('g1', transferInput, 'user1');

    // The destination's own record wins; only the non-clashing row is moved.
    expect(mp.attendanceRecord.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a1'] } } });
    expect(mp.attendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a2'] } },
      data:  { siteId: 'site-2' },
    });
  });

  it('records what was moved on the audit entry', async () => {
    mp.deployment.updateMany.mockResolvedValue({ count: 3 });
    mp.attendanceRecord.findMany
      .mockResolvedValueOnce([{ id: 'a1', date: new Date('2026-05-19T00:00:00.000Z') }])
      .mockResolvedValueOnce([]);

    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.auditLog.create.mock.calls[0][0].data.newValue).toMatchObject({
      deploymentsMoved:  3,
      attendanceMoved:   1,
      attendanceDropped: 0,
    });
  });

  it('posts the guard on the destination site\'s own shift, not an assumed day shift', async () => {
    mp.site.findUnique.mockResolvedValue({ ...toSite, defaultShiftType: 'NIGHT', allowedShiftTypes: [] });

    await guardService.transferGuard('g1', transferInput, 'user1');

    expect(mp.deploymentHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shiftType: 'NIGHT' }) }),
    );
  });
});

// ── getTransferHistory() ───────────────────────────────────────────────────────

describe('guardService.getTransferHistory()', () => {
  it('returns transfer list ordered newest first', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    const older = {
      ...transferRecord,
      id: 'tr-old',
      transferDate: new Date('2026-01-01'),
    };
    const newer = {
      ...transferRecord,
      id: 'tr-new',
      transferDate: new Date('2026-05-18'),
    };
    mp.guardTransfer.findMany.mockResolvedValue([newer, older]);

    const result = await guardService.getTransferHistory('g1');

    expect(result[0].id).toBe('tr-new');
    expect(result[1].id).toBe('tr-old');
  });

  it('queries with orderBy transferDate desc', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.guardTransfer.findMany.mockResolvedValue([]);

    await guardService.getTransferHistory('g1');

    const callArg = mp.guardTransfer.findMany.mock.calls[0][0];
    expect(callArg.orderBy).toMatchObject({ transferDate: 'desc' });
  });

  it('returns empty array when no transfers exist', async () => {
    mp.guard.findUnique.mockResolvedValue(activeGuard);
    mp.guardTransfer.findMany.mockResolvedValue([]);

    const result = await guardService.getTransferHistory('g1');

    expect(result).toEqual([]);
  });

  it('throws NotFoundError when guard does not exist', async () => {
    mp.guard.findUnique.mockResolvedValue(null);

    await expect(guardService.getTransferHistory('no-such')).rejects.toThrow(NotFoundError);
  });
});
