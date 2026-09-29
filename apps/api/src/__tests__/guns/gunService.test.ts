import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GUN_STATUSES, RegisterGunSchema, WithdrawGunSchema } from '@security360/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    gun:         { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    gunMovement: { findMany: vi.fn(), create: vi.fn() },
    site:        { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    // The gun's system ID is now issued from the shared generator, which reads
    // the highest number already used through a raw query.
    $queryRaw:    vi.fn().mockResolvedValue([{ max_num: 0 }]),
    systemSetting: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { gunService } from '../../services/gunService';

const mp = prisma as any;

const TRAINER = 'user-trainer';
const SITE_A  = 'site-a';
const SITE_B  = 'site-b';

const armouryGun = {
  id: 'gun-1', serialNumber: 'AK-2026-001', gunType: 'AK-47',
  manufacturer: 'Kalashnikov', calibre: '7.62mm',
  condition: 'GOOD', status: GUN_STATUSES.IN_ARMOURY,
  currentSiteId: null, currentBullets: 30, notes: null,
  registeredById: TRAINER, createdAt: new Date(), updatedAt: new Date(),
};

const deployedGun = { ...armouryGun, status: GUN_STATUSES.DEPLOYED, currentSiteId: SITE_A };

const movementRow = (over: Record<string, any> = {}) => ({
  id: 'mv-1', gunId: 'gun-1', movementType: 'DEPLOYMENT',
  fromSiteId: null, toSiteId: SITE_A, bullets: 30,
  movementDate: new Date('2026-08-11'), reason: null, notes: null,
  recordedById: TRAINER,
  gun:            { id: 'gun-1', serialNumber: 'AK-2026-001', gunType: 'AK-47' },
  site:           { id: SITE_A, siteName: 'KCCA City Hall' },
  recordedByUser: { id: TRAINER, name: 'Immaculate Nalubega' },
  createdAt: new Date('2026-08-11'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.site.findUnique.mockResolvedValue({ id: SITE_A, siteName: 'KCCA City Hall' });
  mp.site.findMany.mockResolvedValue([{ id: SITE_A, siteName: 'KCCA City Hall' }]);
  mp.$transaction.mockImplementation(async () => [movementRow(), {}]);
  // No gun numbered yet, so registration issues GUN-001.
  mp.gun.findFirst.mockResolvedValue(null);
});

// ── Registration ───────────────────────────────────────────────────────────────

describe('registerGun()', () => {
  it('registers a gun straight into the armoury', async () => {
    mp.gun.findUnique.mockResolvedValue(null);
    mp.gun.create.mockResolvedValue({ ...armouryGun, registeredByUser: { id: TRAINER, name: 'Trainer' }, currentSite: null });

    const gun = await gunService.registerGun(
      { serialNumber: 'AK-2026-001', gunType: 'AK-47', ownership: 'COMPANY', condition: 'GOOD', totalBullets: 30 } as any,
      TRAINER,
    );

    const created = mp.gun.create.mock.calls[0][0].data;
    expect(created.status).toBe(GUN_STATUSES.IN_ARMOURY);
    // The rounds it was issued with are also what it currently holds.
    expect(created.totalBullets).toBe(30);
    expect(created.currentBullets).toBe(30);
    // Fee comes from the ownership, not from the request.
    expect(created.licenceFee).toBe(160_000);
    expect(created.licencePeriod).toBe('YEARLY');
    expect(gun.serialNumber).toBe('AK-2026-001');
    expect((QueueService.logAudit as any).mock.calls[0][0].action).toBe('GUN_REGISTERED');
  });

  it('refuses a duplicate serial number', async () => {
    mp.gun.findUnique.mockResolvedValue(armouryGun);

    await expect(
      gunService.registerGun({ serialNumber: 'AK-2026-001', gunType: 'AK-47' } as any, TRAINER),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mp.gun.create).not.toHaveBeenCalled();
  });
});

// ── Deploy: armoury → site ─────────────────────────────────────────────────────

describe('deployGun()', () => {
  it('sends a gun from the armoury to a site and records the movement', async () => {
    mp.gun.findUnique.mockResolvedValue(armouryGun);

    const movement = await gunService.deployGun(
      { gunId: 'gun-1', siteId: SITE_A, bullets: 30 } as any, TRAINER,
    );

    expect(movement.movementType).toBe('DEPLOYMENT');
    expect(movement.fromSite).toBeNull();
    expect(movement.toSite?.siteName).toBe('KCCA City Hall');

    const gunUpdate = mp.gun.update.mock.calls[0][0].data;
    expect(gunUpdate.status).toBe(GUN_STATUSES.DEPLOYED);
    expect(gunUpdate.currentSiteId).toBe(SITE_A);
    expect(gunUpdate.currentBullets).toBe(30);
  });

  it('refuses to deploy a gun that is already out', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    await expect(
      gunService.deployGun({ gunId: 'gun-1', siteId: SITE_B, bullets: 5 } as any, TRAINER),
    ).rejects.toThrow(/already deployed/);

    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to deploy a retired gun', async () => {
    mp.gun.findUnique.mockResolvedValue({ ...armouryGun, condition: 'RETIRED' });

    await expect(
      gunService.deployGun({ gunId: 'gun-1', siteId: SITE_A, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow(/retired/);
  });

  it('refuses an unknown destination site', async () => {
    mp.gun.findUnique.mockResolvedValue(armouryGun);
    mp.site.findUnique.mockResolvedValue(null);

    await expect(
      gunService.deployGun({ gunId: 'gun-1', siteId: 'nope', bullets: 0 } as any, TRAINER),
    ).rejects.toThrow('Destination site not found');
  });

  it('throws when the gun does not exist', async () => {
    mp.gun.findUnique.mockResolvedValue(null);

    await expect(
      gunService.deployGun({ gunId: 'nope', siteId: SITE_A, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow('Gun not found');
  });
});

// ── Withdraw: site → armoury ───────────────────────────────────────────────────

describe('withdrawGun()', () => {
  beforeEach(() => {
    mp.$transaction.mockImplementation(async () => [
      movementRow({ movementType: 'WITHDRAWAL', fromSiteId: SITE_A, toSiteId: null, site: null, bullets: 28 }),
      {},
    ]);
  });

  it('returns the gun to the armoury', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    const movement = await gunService.withdrawGun(
      { gunId: 'gun-1', fromSiteId: SITE_A, bullets: 28 } as any, TRAINER,
    );

    expect(movement.movementType).toBe('WITHDRAWAL');
    expect(movement.toSite).toBeNull();
    expect(movement.fromSite?.siteName).toBe('KCCA City Hall');

    const gunUpdate = mp.gun.update.mock.calls[0][0].data;
    expect(gunUpdate.status).toBe(GUN_STATUSES.IN_ARMOURY);
    expect(gunUpdate.currentSiteId).toBeNull();
    expect(gunUpdate.currentBullets).toBe(28);
  });

  it('refuses to withdraw a gun that is already in the armoury', async () => {
    mp.gun.findUnique.mockResolvedValue(armouryGun);

    await expect(
      gunService.withdrawGun({ gunId: 'gun-1', fromSiteId: SITE_A, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow(/already in the armoury/);
  });

  it('refuses when the named site is not where the gun is', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    await expect(
      gunService.withdrawGun({ gunId: 'gun-1', fromSiteId: SITE_B, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow(/not at that site/);
  });

  it('refuses to return more rounds than were issued', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    await expect(
      gunService.withdrawGun({ gunId: 'gun-1', fromSiteId: SITE_A, bullets: 99 } as any, TRAINER),
    ).rejects.toThrow(/only 30 were issued/);

    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('allows returning fewer rounds than were issued', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    await gunService.withdrawGun({ gunId: 'gun-1', fromSiteId: SITE_A, bullets: 28 } as any, TRAINER);

    expect(mp.$transaction).toHaveBeenCalled();
  });
});

// ── Transfer: site → site ──────────────────────────────────────────────────────

describe('transferGun()', () => {
  beforeEach(() => {
    mp.$transaction.mockImplementation(async () => [
      movementRow({ movementType: 'TRANSFER', fromSiteId: SITE_A, toSiteId: SITE_B,
                    site: { id: SITE_B, siteName: 'URA Nakawa' } }),
      {},
    ]);
    mp.site.findUnique.mockResolvedValue({ id: SITE_B, siteName: 'URA Nakawa' });
  });

  it('moves a deployed gun straight to another site', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    const movement = await gunService.transferGun(
      { gunId: 'gun-1', toSiteId: SITE_B, bullets: 30 } as any, TRAINER,
    );

    expect(movement.movementType).toBe('TRANSFER');
    // Origin is taken from where the gun actually is, never from the request,
    // so a caller cannot rewrite the chain of custody.
    expect(mp.gunMovement.create.mock.calls[0][0].data.fromSiteId).toBe(SITE_A);
    expect(mp.gun.update.mock.calls[0][0].data.currentSiteId).toBe(SITE_B);
  });

  it('refuses to transfer a gun sitting in the armoury', async () => {
    mp.gun.findUnique.mockResolvedValue(armouryGun);

    await expect(
      gunService.transferGun({ gunId: 'gun-1', toSiteId: SITE_B, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow(/Use Deploy/);
  });

  it('refuses a transfer to the site the gun is already on', async () => {
    mp.gun.findUnique.mockResolvedValue(deployedGun);

    await expect(
      gunService.transferGun({ gunId: 'gun-1', toSiteId: SITE_A, bullets: 0 } as any, TRAINER),
    ).rejects.toThrow(/already at that site/);
  });
});

// ── Inventory ──────────────────────────────────────────────────────────────────

describe('getInventory()', () => {
  it('always lists the armoury first, even when empty', async () => {
    mp.gun.findMany.mockResolvedValue([]);

    const rows = await gunService.getInventory();

    expect(rows).toHaveLength(1);
    expect(rows[0].siteId).toBeNull();
    expect(rows[0].gunCount).toBe(0);
  });

  it('groups guns by location with serials, types and bullet totals', async () => {
    mp.gun.findMany.mockResolvedValue([
      { ...armouryGun, id: 'g1', serialNumber: 'AK-001', currentBullets: 30, currentSite: null },
      { ...armouryGun, id: 'g2', serialNumber: 'PS-002', gunType: 'Pistol', currentBullets: 10, currentSite: null },
      { ...deployedGun, id: 'g3', serialNumber: 'AK-003', currentBullets: 25,
        currentSite: { id: SITE_A, siteName: 'KCCA City Hall' } },
    ]);

    const [armoury, site] = await gunService.getInventory();

    expect(armoury.gunCount).toBe(2);
    expect(armoury.serialNumbers).toEqual(['AK-001', 'PS-002']);
    expect(armoury.gunTypes).toEqual(['AK-47', 'Pistol']);
    expect(armoury.totalBullets).toBe(40);

    expect(site.siteName).toBe('KCCA City Hall');
    expect(site.gunCount).toBe(1);
    expect(site.totalBullets).toBe(25);
  });
});

// ── Chain of custody ───────────────────────────────────────────────────────────

describe('getGun()', () => {
  it('returns every movement, newest first, in one ledger', async () => {
    mp.gun.findUnique.mockResolvedValue({
      ...armouryGun,
      registeredByUser: { id: TRAINER, name: 'Trainer' },
      currentSite:      null,
      movements: [
        movementRow({ id: 'm3', movementType: 'WITHDRAWAL', fromSiteId: SITE_A, toSiteId: null, site: null }),
        movementRow({ id: 'm2', movementType: 'TRANSFER',   fromSiteId: SITE_A, toSiteId: SITE_B,
                      site: { id: SITE_B, siteName: 'URA Nakawa' } }),
        movementRow({ id: 'm1', movementType: 'DEPLOYMENT', fromSiteId: null,   toSiteId: SITE_A }),
      ],
    });

    const gun = await gunService.getGun('gun-1');

    expect(gun.movements.map(m => m.movementType)).toEqual(['WITHDRAWAL', 'TRANSFER', 'DEPLOYMENT']);
    // Origin site names are resolved even though the row only stores the id.
    expect(gun.movements[0].fromSite?.siteName).toBe('KCCA City Hall');
    expect(gun.movements[2].fromSite).toBeNull();
    expect(mp.gun.findUnique.mock.calls[0][0].include.movements.orderBy).toEqual({ movementDate: 'desc' });
  });

  it('throws when the gun does not exist', async () => {
    mp.gun.findUnique.mockResolvedValue(null);
    await expect(gunService.getGun('nope')).rejects.toThrow('Gun not found');
  });
});

// ── Schemas ────────────────────────────────────────────────────────────────────

describe('gun schemas', () => {
  it('requires a serial number', () => {
    expect(RegisterGunSchema.safeParse({ serialNumber: '', gunType: 'AK-47' }).success).toBe(false);
  });

  it('defaults a new gun to GOOD with no rounds', () => {
    const r = RegisterGunSchema.parse({ serialNumber: 'X-1', gunType: 'AK-47', ownership: 'COMPANY' });
    expect(r.condition).toBe('GOOD');
    expect(r.totalBullets).toBe(0);
  });

  it('rejects a negative bullet count', () => {
    expect(RegisterGunSchema.safeParse({ serialNumber: 'X-1', gunType: 'AK-47', ownership: 'COMPANY', totalBullets: -1 }).success).toBe(false);
    expect(WithdrawGunSchema.safeParse({ gunId: 'g', fromSiteId: 's', bullets: -5 }).success).toBe(false);
  });

  it('rejects a gun type that is not on the list', () => {
    expect(RegisterGunSchema.safeParse({ serialNumber: 'X-1', gunType: 'BAZOOKA', ownership: 'COMPANY' }).success).toBe(false);
  });

  it('requires an ownership', () => {
    expect(RegisterGunSchema.safeParse({ serialNumber: 'X-1', gunType: 'AK-47' }).success).toBe(false);
  });
});
