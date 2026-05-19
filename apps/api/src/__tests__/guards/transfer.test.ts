import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLES } from '@stap/shared';

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
      create: vi.fn(),
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
  mp.auditLog.create.mockResolvedValue({});
  mockNotif.sendToRole.mockResolvedValue(undefined);
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
      data: {
        action:   'GUARD_TRANSFERRED',
        entity:   'guard',
        entityId: 'g1',
        newValue: {
          toSiteId:   'site-2',
          toSiteName: 'City Mall',
          reason:     'Operational requirement',
        },
      },
    });
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
