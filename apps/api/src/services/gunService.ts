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
  UpdateGunInput,
} from '@stap/shared';
import { gunTypeLabel, ownershipConfig } from '@stap/shared';

const GUN_INCLUDE = {
  registeredByUser: { select: { id: true, name: true } },
  currentSite:      { select: { id: true, siteName: true } },
} as const;

const MOVEMENT_INCLUDE = {
  gun:            { select: { id: true, serialNumber: true, gunType: true } },
  site:           { select: { id: true, siteName: true } },
  recordedByUser: { select: { id: true, name: true } },
} as const;

/**
 * GUN-001, continuing past the highest already issued rather than counting rows
 * — a deleted gun would otherwise make the next registration reuse an id that
 * is already written in a movement record.
 */
async function nextGunSystemId(): Promise<string> {
  const last = await prisma.gun.findFirst({
    where:   { systemId: { startsWith: 'GUN-' } },
    orderBy: { systemId: 'desc' },
    select:  { systemId: true },
  });
  const n = last?.systemId ? Number(last.systemId.slice(4)) : 0;
  return `GUN-${String((Number.isFinite(n) ? n : 0) + 1).padStart(3, '0')}`;
}

function sanitise(gun: any): GunResponse {
  return {
    id:              gun.id,
    systemId:        gun.systemId ?? null,
    serialNumber:    gun.serialNumber,
    gunType:         gun.gunType,
    gunTypeLabel:    gunTypeLabel(gun.gunType),
    ownership:       gun.ownership,
    ownershipLabel:  ownershipConfig(gun.ownership)?.label ?? gun.ownership,
    licenceFee:      gun.licenceFee ?? null,
    licencePeriod:   gun.licencePeriod ?? null,
    manufacturer:    gun.manufacturer ?? null,
    condition:       gun.condition,
    status:          gun.status,
    currentSiteId:   gun.currentSiteId ?? null,
    currentSiteName: gun.currentSite?.siteName ?? null,
    totalBullets:    gun.totalBullets,
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

    // Fee and period come from the ownership, never from the request: the rate
    // is company policy, so a form must not be able to set it.
    const cfg = ownershipConfig(data.ownership);

    const gun = await prisma.gun.create({
      data: {
        systemId:       await nextGunSystemId(),
        serialNumber,
        gunType:        data.gunType,
        ownership:      data.ownership,
        licenceFee:     cfg?.fee ?? null,
        licencePeriod:  cfg?.period ?? null,
        manufacturer:   data.manufacturer?.trim() || null,
        condition:      data.condition ?? 'GOOD',
        status:         GUN_STATUSES.IN_ARMOURY,
        // A gun arrives holding what it was issued with, so both start equal.
        totalBullets:   data.totalBullets ?? 0,
        currentBullets: data.totalBullets ?? 0,
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
      newValue: {
        systemId: gun.systemId, serialNumber, gunType: gun.gunType,
        ownership: gun.ownership, totalBullets: gun.totalBullets,
      },
    });

    return sanitise(gun);
  }

  /**
   * Edits a gun's registration details.
   *
   * Refused while the gun is out at a site: its serial, type and round count are
   * what the site's paperwork was written against, and changing them under a
   * deployment would leave the two disagreeing with no record of which is right.
   */
  async updateGun(id: string, data: UpdateGunInput, userId: string): Promise<GunResponse> {
    const gun = await prisma.gun.findUnique({ where: { id } });
    if (!gun) throw new NotFoundError('Gun not found');

    if (gun.status === GUN_STATUSES.DEPLOYED) {
      throw new AppError('This gun is deployed. Withdraw it to the armoury before editing it.', 400);
    }

    if (data.serialNumber && data.serialNumber.trim() !== gun.serialNumber) {
      const clash = await prisma.gun.findUnique({ where: { serialNumber: data.serialNumber.trim() } });
      if (clash) {
        throw new AppError(`A gun with serial number "${data.serialNumber.trim()}" is already registered.`, 409);
      }
    }

    // Re-derived only when ownership actually changes, so an edit that leaves it
    // alone cannot quietly reprice a licence.
    const cfg = data.ownership && data.ownership !== gun.ownership
      ? ownershipConfig(data.ownership)
      : undefined;

    const updated = await prisma.gun.update({
      where: { id },
      data: {
        ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber.trim() } : {}),
        ...(data.gunType      !== undefined ? { gunType: data.gunType } : {}),
        ...(data.manufacturer !== undefined ? { manufacturer: data.manufacturer?.trim() || null } : {}),
        ...(data.condition    !== undefined ? { condition: data.condition } : {}),
        ...(data.notes        !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(cfg ? { ownership: data.ownership, licenceFee: cfg.fee, licencePeriod: cfg.period } : {}),
        // Re-issuing the gun resets both counts: the edit is stating what it now
        // holds, and leaving currentBullets behind would show a gun as short of
        // rounds it was just given.
        ...(data.totalBullets !== undefined
          ? { totalBullets: data.totalBullets, currentBullets: data.totalBullets }
          : {}),
      },
      include: GUN_INCLUDE,
    });

    await QueueService.logAudit({
      userId,
      action:   'GUN_UPDATED',
      entity:   'gun',
      entityId: id,
      oldValue: {
        serialNumber: gun.serialNumber, gunType: gun.gunType,
        ownership: gun.ownership, totalBullets: gun.totalBullets,
      },
      newValue: {
        serialNumber: updated.serialNumber, gunType: updated.gunType,
        ownership: updated.ownership, totalBullets: updated.totalBullets,
      },
    });

    return sanitise(updated);
  }

  /**
   * Removes a gun, or retires it when it has a history.
   *
   * A gun that has been deployed has movement records against it, and those are
   * the armoury's account of where a weapon has been. Deleting the gun would
   * cascade them away, so it is retired instead — off the inventory, still
   * answerable for.
   */
  async deleteGun(id: string, userId: string): Promise<{ deleted: boolean; retired: boolean }> {
    const gun = await prisma.gun.findUnique({
      where:   { id },
      include: { movements: { select: { id: true }, take: 1 } },
    });
    if (!gun) throw new NotFoundError('Gun not found');

    if (gun.status === GUN_STATUSES.DEPLOYED) {
      throw new AppError('This gun is deployed. Withdraw it to the armoury before removing it.', 400);
    }

    if (gun.movements.length > 0) {
      await prisma.gun.update({ where: { id }, data: { status: GUN_STATUSES.RETIRED } });
      await QueueService.logAudit({
        userId,
        action:   'GUN_RETIRED',
        entity:   'gun',
        entityId: id,
        newValue: {
          systemId: gun.systemId, serialNumber: gun.serialNumber,
          reason:   'Removal requested; retired instead to keep its movement history.',
        },
      });
      return { deleted: false, retired: true };
    }

    await prisma.gun.delete({ where: { id } });
    await QueueService.logAudit({
      userId,
      action:   'GUN_DELETED',
      entity:   'gun',
      entityId: id,
      oldValue: { systemId: gun.systemId, serialNumber: gun.serialNumber, gunType: gun.gunType },
    });
    return { deleted: true, retired: false };
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
