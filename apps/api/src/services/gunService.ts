import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { AppError, NotFoundError } from '../errors/AppError';
import { GUN_STATUSES, GUN_MOVEMENT_TYPES, ARMOURY_LABEL } from '@stap/shared';
import type {
  RegisterGunInput,
  DeployGunInput,
  WithdrawGunInput,
  TransferGunInput,
  GunResponse,
  GunMovementResponse,
  GunWithHistory,
  GunInventoryRow,
  GunMovementType,
} from '@stap/shared';

const GUN_INCLUDE = {
  registeredByUser: { select: { id: true, name: true } },
  currentSite:      { select: { id: true, siteName: true } },
} as const;

const MOVEMENT_INCLUDE = {
  gun:            { select: { id: true, serialNumber: true, gunType: true } },
  site:           { select: { id: true, siteName: true } },
  recordedByUser: { select: { id: true, name: true } },
} as const;

function sanitise(gun: any): GunResponse {
  return {
    id:              gun.id,
    serialNumber:    gun.serialNumber,
    gunType:         gun.gunType,
    manufacturer:    gun.manufacturer ?? null,
    calibre:         gun.calibre ?? null,
    condition:       gun.condition,
    status:          gun.status,
    currentSiteId:   gun.currentSiteId ?? null,
    currentSiteName: gun.currentSite?.siteName ?? null,
    currentBullets:  gun.currentBullets,
    notes:           gun.notes ?? null,
    registeredBy:    gun.registeredByUser
      ? { id: gun.registeredByUser.id, name: gun.registeredByUser.name }
      : null,
    createdAt: gun.createdAt.toISOString(),
    updatedAt: gun.updatedAt.toISOString(),
  };
}

/**
 * `fromSite` is resolved separately: the movement stores the origin site id but
 * only carries a relation for the destination, since a withdrawal has no
 * destination site and Prisma would need a second relation for a field that is
 * null on most rows.
 */
function sanitiseMovement(m: any, siteNames: Map<string, string>): GunMovementResponse {
  return {
    id:           m.id,
    gunId:        m.gunId,
    serialNumber: m.gun?.serialNumber ?? '',
    gunType:      m.gun?.gunType ?? '',
    movementType: m.movementType as GunMovementType,
    fromSite:     m.fromSiteId
      ? { id: m.fromSiteId, siteName: siteNames.get(m.fromSiteId) ?? 'Unknown site' }
      : null,
    toSite:       m.site ? { id: m.site.id, siteName: m.site.siteName } : null,
    bullets:      m.bullets,
    movementDate: m.movementDate.toISOString(),
    reason:       m.reason ?? null,
    notes:        m.notes ?? null,
    recordedBy:   { id: m.recordedByUser.id, name: m.recordedByUser.name },
    createdAt:    m.createdAt.toISOString(),
  };
}

/** Looks up the names of every origin site referenced by a set of movements. */
async function originSiteNames(movements: { fromSiteId: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(movements.map(m => m.fromSiteId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const sites = await prisma.site.findMany({
    where:  { id: { in: ids } },
    select: { id: true, siteName: true },
  });
  return new Map(sites.map(s => [s.id, s.siteName]));
}

class GunService {
  async registerGun(data: RegisterGunInput, registeredById: string): Promise<GunResponse> {
    const serialNumber = data.serialNumber.trim();

    const existing = await prisma.gun.findUnique({ where: { serialNumber } });
    if (existing) {
      throw new AppError(
        `A gun with serial number "${serialNumber}" is already registered.`,
        409,
      );
    }

    const gun = await prisma.gun.create({
      data: {
        serialNumber,
        gunType:        data.gunType,
        manufacturer:   data.manufacturer?.trim() || null,
        calibre:        data.calibre?.trim() || null,
        condition:      data.condition ?? 'GOOD',
        status:         GUN_STATUSES.IN_ARMOURY,
        currentBullets: data.currentBullets ?? 0,
        notes:          data.notes?.trim() || null,
        registeredById,
      },
      include: GUN_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   registeredById,
      action:   'GUN_REGISTERED',
      entity:   'gun',
      entityId: gun.id,
      newValue: { serialNumber, gunType: gun.gunType, bullets: gun.currentBullets },
    });

    return sanitise(gun);
  }

  /**
   * Records one movement and moves the gun with it, in a single transaction so
   * a gun can never be left in a state the ledger does not account for.
   */
  private async move(params: {
    gunId:        string;
    movementType: GunMovementType;
    fromSiteId:   string | null;
    toSiteId:     string | null;
    bullets:      number;
    movementDate?: string;
    reason?:      string | null;
    notes?:       string | null;
    recordedById: string;
  }): Promise<GunMovementResponse> {
    const { gunId, movementType, fromSiteId, toSiteId, bullets, recordedById } = params;

    const [movement] = await prisma.$transaction([
      prisma.gunMovement.create({
        data: {
          gunId,
          movementType,
          fromSiteId,
          toSiteId,
          bullets,
          movementDate: params.movementDate ? new Date(params.movementDate) : new Date(),
          reason:       params.reason?.trim() || null,
          notes:        params.notes?.trim() || null,
          recordedById,
        },
        include: MOVEMENT_INCLUDE,
      }),
      prisma.gun.update({
        where: { id: gunId },
        data:  {
          status:         toSiteId ? GUN_STATUSES.DEPLOYED : GUN_STATUSES.IN_ARMOURY,
          currentSiteId:  toSiteId,
          currentBullets: bullets,
        },
      }),
    ]);

    await QueueService.logAudit({
      userId:   recordedById,
      action:   `GUN_${movementType}`,
      entity:   'gun',
      entityId: gunId,
      newValue: {
        serialNumber: movement.gun.serialNumber,
        movementType,
        fromSiteId,
        toSiteId,
        bullets,
      },
    });

    return sanitiseMovement(movement, await originSiteNames([movement]));
  }

  private async loadDeployableGun(gunId: string) {
    const gun = await prisma.gun.findUnique({ where: { id: gunId } });
    if (!gun) throw new NotFoundError('Gun not found');
    if (gun.condition === 'RETIRED' || gun.status === GUN_STATUSES.RETIRED) {
      throw new AppError(`Gun ${gun.serialNumber} is retired and cannot be moved.`, 400);
    }
    return gun;
  }

  private async requireSite(siteId: string, label = 'Site') {
    const site = await prisma.site.findUnique({
      where:  { id: siteId },
      select: { id: true, siteName: true },
    });
    if (!site) throw new NotFoundError(`${label} not found`);
    return site;
  }

  /** Armoury → site. */
  async deployGun(data: DeployGunInput, recordedById: string): Promise<GunMovementResponse> {
    const gun = await this.loadDeployableGun(data.gunId);

    if (gun.status !== GUN_STATUSES.IN_ARMOURY) {
      throw new AppError(
        `Gun ${gun.serialNumber} is already deployed. Withdraw it to the armoury first, ` +
        `or transfer it directly to the new site.`,
        400,
      );
    }

    await this.requireSite(data.siteId, 'Destination site');

    return this.move({
      gunId:        data.gunId,
      movementType: GUN_MOVEMENT_TYPES.DEPLOYMENT,
      fromSiteId:   null,
      toSiteId:     data.siteId,
      bullets:      data.bullets ?? 0,
      movementDate: data.movementDate,
      notes:        data.notes,
      recordedById,
    });
  }

  /** Site → armoury. */
  async withdrawGun(data: WithdrawGunInput, recordedById: string): Promise<GunMovementResponse> {
    const gun = await this.loadDeployableGun(data.gunId);

    if (gun.status !== GUN_STATUSES.DEPLOYED) {
      throw new AppError(
        `Gun ${gun.serialNumber} is not deployed — it is already in the armoury.`,
        400,
      );
    }
    if (gun.currentSiteId !== data.fromSiteId) {
      const actual = gun.currentSiteId
        ? (await this.requireSite(gun.currentSiteId)).siteName
        : ARMOURY_LABEL;
      throw new AppError(
        `Gun ${gun.serialNumber} is not at that site — it is currently at ${actual}.`,
        400,
      );
    }

    if (data.bullets > gun.currentBullets) {
      throw new AppError(
        `Cannot return ${data.bullets} rounds — only ${gun.currentBullets} were issued with ` +
        `gun ${gun.serialNumber}.`,
        400,
      );
    }

    return this.move({
      gunId:        data.gunId,
      movementType: GUN_MOVEMENT_TYPES.WITHDRAWAL,
      fromSiteId:   data.fromSiteId,
      toSiteId:     null,
      bullets:      data.bullets ?? 0,
      movementDate: data.movementDate,
      reason:       data.reason,
      notes:        data.notes,
      recordedById,
    });
  }

  /** Site → site, without returning to the armoury first. */
  async transferGun(data: TransferGunInput, recordedById: string): Promise<GunMovementResponse> {
    const gun = await this.loadDeployableGun(data.gunId);

    if (gun.status !== GUN_STATUSES.DEPLOYED || !gun.currentSiteId) {
      throw new AppError(
        `Gun ${gun.serialNumber} is in the armoury. Use Deploy to send it out to a site.`,
        400,
      );
    }
    if (gun.currentSiteId === data.toSiteId) {
      throw new AppError(`Gun ${gun.serialNumber} is already at that site.`, 400);
    }

    await this.requireSite(data.toSiteId, 'Destination site');

    return this.move({
      gunId:        data.gunId,
      movementType: GUN_MOVEMENT_TYPES.TRANSFER,
      fromSiteId:   gun.currentSiteId,
      toSiteId:     data.toSiteId,
      bullets:      data.bullets ?? 0,
      movementDate: data.movementDate,
      reason:       data.reason,
      notes:        data.notes,
      recordedById,
    });
  }

  async listGuns(filters: { status?: string; siteId?: string; gunType?: string }): Promise<GunResponse[]> {
    const guns = await prisma.gun.findMany({
      where: {
        ...(filters.status  ? { status: filters.status }         : {}),
        ...(filters.siteId  ? { currentSiteId: filters.siteId }  : {}),
        ...(filters.gunType ? { gunType: filters.gunType }       : {}),
      },
      include: GUN_INCLUDE,
      orderBy: { serialNumber: 'asc' },
    });
    return guns.map(sanitise);
  }

  async getGun(id: string): Promise<GunWithHistory> {
    const gun = await prisma.gun.findUnique({
      where:   { id },
      include: {
        ...GUN_INCLUDE,
        movements: { include: MOVEMENT_INCLUDE, orderBy: { movementDate: 'desc' } },
      },
    });
    if (!gun) throw new NotFoundError('Gun not found');

    const names = await originSiteNames(gun.movements);
    return {
      ...sanitise(gun),
      movements: gun.movements.map(m => sanitiseMovement(m, names)),
    };
  }

  /** The armoury plus every site currently holding a gun. */
  async getInventory(): Promise<GunInventoryRow[]> {
    const guns = await prisma.gun.findMany({
      where:   { status: { not: GUN_STATUSES.RETIRED } },
      include: { currentSite: { select: { id: true, siteName: true } } },
      orderBy: { serialNumber: 'asc' },
    });

    const rows = new Map<string, GunInventoryRow>();
    // The armoury is always listed, even when empty — "no guns in the armoury"
    // is a fact worth showing rather than a missing row.
    rows.set('ARMOURY', {
      siteId: null, siteName: ARMOURY_LABEL,
      gunCount: 0, serialNumbers: [], gunTypes: [], totalBullets: 0,
    });

    for (const gun of guns) {
      const key = gun.currentSiteId ?? 'ARMOURY';
      if (!rows.has(key)) {
        rows.set(key, {
          siteId:   gun.currentSiteId,
          siteName: gun.currentSite?.siteName ?? 'Unknown site',
          gunCount: 0, serialNumbers: [], gunTypes: [], totalBullets: 0,
        });
      }
      const row = rows.get(key)!;
      row.gunCount++;
      row.serialNumbers.push(gun.serialNumber);
      if (!row.gunTypes.includes(gun.gunType)) row.gunTypes.push(gun.gunType);
      row.totalBullets += gun.currentBullets;
    }

    const [armoury, ...sites] = [...rows.values()];
    sites.sort((a, b) => a.siteName.localeCompare(b.siteName));
    return [armoury, ...sites];
  }

  /** Whole-fleet movement ledger, newest first. */
  async listMovements(filters: { gunId?: string; movementType?: string; limit?: number }): Promise<GunMovementResponse[]> {
    const movements = await prisma.gunMovement.findMany({
      where: {
        ...(filters.gunId        ? { gunId: filters.gunId }               : {}),
        ...(filters.movementType ? { movementType: filters.movementType } : {}),
      },
      include: MOVEMENT_INCLUDE,
      orderBy: { movementDate: 'desc' },
      take:    filters.limit ?? 100,
    });
    const names = await originSiteNames(movements);
    return movements.map(m => sanitiseMovement(m, names));
  }
}

export const gunService = new GunService();
