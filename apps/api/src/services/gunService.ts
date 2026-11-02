import prisma from '../db/prisma';
import { generateGunId, generateGunIds } from '../lib/systemId';
import { QueueService } from '../jobs/QueueService';
import { AppError, NotFoundError } from '../errors/AppError';
import { GUN_STATUSES, GUN_MOVEMENT_TYPES, ARMOURY_LABEL } from '@security360/shared';
import type {
  RegisterGunInput,
  RegisterGunBatchInput,
  AdjustBulletsInput,
  DeployGunInput,
  WithdrawGunInput,
  TransferGunInput,
  GunResponse,
  GunMovementResponse,
  GunWithHistory,
  GunInventoryRow,
  GunMovementType,
  UpdateGunInput,
} from '@security360/shared';
import { gunTypeLabel, ownershipConfig } from '@security360/shared';

const GUN_INCLUDE = {
  registeredByUser: { select: { id: true, name: true } },
  currentSite:      { select: { id: true, siteName: true, client: { select: { id: true, clientName: true } } } },
} as const;

const MOVEMENT_INCLUDE = {
  gun:            { select: { id: true, serialNumber: true, gunType: true } },
  site:           { select: { id: true, siteName: true } },
  recordedByUser: { select: { id: true, name: true } },
} as const;

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
    clientName:      gun.currentSite?.client?.clientName ?? null,
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
  /**
   * Catalogue check: registration is held to the active gun-type rows, so new
   * types are added in Settings without a deploy. Retired and unknown codes
   * are refused with a message that says where to add them.
   */
  private async requireGunType(code: string) {
    const row = await prisma.gunType.findUnique({ where: { code: code.trim() } });
    if (!row || !row.isActive) {
      throw new AppError(
        `Unknown or retired gun type "${code}". Add it in Settings - Gun Types first.`,
        400,
      );
    }
    return row;
  }

  /**
   * Catalogue labels over API responses. Anything the catalogue does not name
   * keeps the compiled fallback (legacy codes) or its own code.
   */
  private async labelGuns<T extends { gunType: string; gunTypeLabel: string }>(rows: T[]): Promise<T[]> {
    const types = await prisma.gunType.findMany({ select: { code: true, label: true } });
    const map = new Map(types.map((t) => [t.code, t.label]));
    for (const r of rows) {
      const label = map.get(r.gunType);
      if (label) r.gunTypeLabel = label;
    }
    return rows;
  }

  /**
   * Type/location counter for the inventory balance. siteKey is the site id,
   * or '' for the armoury. Always called inside the caller's transaction so
   * the counter and the gun rows move together; reconcile() proves they did.
   */
  private async bumpStock(tx: any, gunType: string, siteKey: string, delta: number): Promise<void> {
    await tx.gunTypeStock.upsert({
      where:  { gunType_siteId: { gunType, siteId: siteKey } },
      update: { count: { increment: delta }, updatedAt: new Date() },
      create: { gunType, siteId: siteKey, count: Math.max(0, delta) },
    });
  }

  async registerGun(data: RegisterGunInput, registeredById: string): Promise<GunResponse> {
    const serialNumber = data.serialNumber.trim();

    const existing = await prisma.gun.findUnique({ where: { serialNumber } });
    if (existing) {
      throw new AppError(
        `A gun with serial number "${serialNumber}" is already registered.`,
        409,
      );
    }

    // Armoury by default; a site id places the gun straight onto that site,
    // with the arrival recorded as a REGISTRATION movement below.
    const gunTypeRow = await this.requireGunType(data.gunType);
    const site = data.siteId ? await this.requireSite(data.siteId, 'Registration site') : null;
    // Movements and ledger rows record who recorded them; on registration
    // that is the registrar.
    const recordedById = registeredById;

    // Fee and period come from the ownership, never from the request: the rate
    // is company policy, so a form must not be able to set it.
    const cfg = ownershipConfig(data.ownership);

    const gun = await prisma.$transaction(async (tx) => {
      const created = await tx.gun.create({
        data: {
          systemId:       await generateGunId(),
          serialNumber,
          gunType:        gunTypeRow.code,
          ownership:      data.ownership,
          licenceFee:     cfg?.fee ?? null,
          licencePeriod:  cfg?.period ?? null,
          manufacturer:   data.manufacturer?.trim() || null,
          condition:      data.condition ?? 'GOOD',
          status:         site ? GUN_STATUSES.DEPLOYED : GUN_STATUSES.IN_ARMOURY,
          currentSiteId:  site?.id ?? null,
          // A gun arrives holding what it was issued with, so both start equal.
          totalBullets:   data.totalBullets ?? 0,
          currentBullets: data.totalBullets ?? 0,
          notes:          data.notes?.trim() || null,
          registeredById,
        },
        include: GUN_INCLUDE,
      });

      await this.bumpStock(tx, created.gunType, site?.id ?? '', 1);

      let movementId: string | null = null;
      if (site) {
        const movement = await tx.gunMovement.create({
          data: {
            gunId:        created.id,
            movementType: GUN_MOVEMENT_TYPES.REGISTRATION,
            fromSiteId:   null,
            toSiteId:     site.id,
            bullets:      created.totalBullets,
            movementDate: new Date(),
            reason:       'Registered directly to site',
            notes:        data.notes?.trim() || null,
            recordedById,
          },
          include: MOVEMENT_INCLUDE,
        });
        movementId = movement.id;
      }

      await tx.ammoTransaction.create({
        data: {
          gunId:        created.id,
          change:       created.totalBullets,
          balance:      created.totalBullets,
          reason:       site ? 'REGISTRATION' : 'OPENING_BALANCE',
          movementId,
          recordedById,
        },
      });

      return created;
    });

    await QueueService.logAudit({
      userId:   registeredById,
      action:   'GUN_REGISTERED',
      entity:   'gun',
      entityId: gun.id,
      newValue: {
        systemId: gun.systemId, serialNumber, gunType: gun.gunType,
        ownership: gun.ownership, totalBullets: gun.totalBullets,
        siteId: site?.id ?? null,
      },
    });

    return { ...sanitise(gun), gunTypeLabel: gunTypeRow.label };
  }

  /**
   * Bulk registration: several guns of one type in one request. Every serial
   * is checked before anything is written, and the whole batch lands in a
   * single transaction - a duplicate anywhere aborts everything.
   */
  async registerGunBatch(data: RegisterGunBatchInput, registeredById: string): Promise<GunResponse[]> {
    const serials = data.serialNumbers.map((s) => s.trim());

    const clashes = await prisma.gun.findMany({
      where:  { serialNumber: { in: serials } },
      select: { serialNumber: true },
    });
    if (clashes.length > 0) {
      throw new AppError(
        `Serial number${clashes.length === 1 ? '' : 's'} already registered: ${clashes.map((c) => c.serialNumber).join(', ')}. Nothing was registered.`,
        409,
      );
    }

    const gunTypeRow = await this.requireGunType(data.gunType);
    const site = data.siteId ? await this.requireSite(data.siteId, 'Registration site') : null;
    // Movements and ledger rows record who recorded them; on registration
    // that is the registrar.
    const recordedById = registeredById;
    const cfg = ownershipConfig(data.ownership);

    // Reserve the whole id block up front: minting inside the loop would
    // read the same committed max twice and collide (max is invisible until
    // commit). generateGunIds takes the same lock-free approach as singles.
    const systemIds = await generateGunIds(serials.length);
    const guns = await prisma.$transaction(async (tx) => {
      const made: any[] = [];
      for (const [i, serialNumber] of serials.entries()) {
        const gun = await tx.gun.create({
          data: {
            systemId:       systemIds[i],
            serialNumber,
            gunType:        gunTypeRow.code,
            ownership:      data.ownership,
            licenceFee:     cfg?.fee ?? null,
            licencePeriod:  cfg?.period ?? null,
            manufacturer:   data.manufacturer?.trim() || null,
            condition:      data.condition ?? 'GOOD',
            status:         site ? GUN_STATUSES.DEPLOYED : GUN_STATUSES.IN_ARMOURY,
            currentSiteId:  site?.id ?? null,
            totalBullets:   data.totalBullets ?? 0,
            currentBullets: data.totalBullets ?? 0,
            notes:          data.notes?.trim() || null,
            registeredById,
          },
          include: GUN_INCLUDE,
        });

        await this.bumpStock(tx, gun.gunType, site?.id ?? '', 1);

        let movementId: string | null = null;
        if (site) {
          const movement = await tx.gunMovement.create({
            data: {
              gunId:        gun.id,
              movementType: GUN_MOVEMENT_TYPES.REGISTRATION,
              fromSiteId:   null,
              toSiteId:     site.id,
              bullets:      gun.totalBullets,
              movementDate: new Date(),
              reason:       'Registered directly to site',
              notes:        data.notes?.trim() || null,
              recordedById,
            },
            include: MOVEMENT_INCLUDE,
          });
          movementId = movement.id;
        }

        await tx.ammoTransaction.create({
          data: {
            gunId:        gun.id,
            change:       gun.totalBullets,
            balance:      gun.totalBullets,
            reason:       site ? 'REGISTRATION' : 'OPENING_BALANCE',
            movementId,
            recordedById,
          },
        });

        made.push(gun);
      }
      return made;
    });

    await QueueService.logAudit({
      userId:   registeredById,
      action:   'GUN_BATCH_REGISTERED',
      entity:   'gun',
      entityId: guns[0].id,
      newValue: {
        count: guns.length, gunType: data.gunType, ownership: data.ownership,
        serialNumbers: serials, siteId: site?.id ?? null,
      },
    });

    return guns.map((g) => ({ ...sanitise(g), gunTypeLabel: gunTypeRow.label }));
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
      // Retirement takes the gun out of the inventory, so its type/location
      // counter drops in the same transaction.
      await prisma.$transaction(async (tx) => {
        await tx.gun.update({ where: { id }, data: { status: GUN_STATUSES.RETIRED } });
        await this.bumpStock(tx, gun.gunType, gun.currentSiteId ?? '', -1);
      });
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

    // No movements exist, but the registration counter does: drop it with the row.
    await prisma.$transaction(async (tx) => {
      await tx.gun.delete({ where: { id } });
      await this.bumpStock(tx, gun.gunType, gun.currentSiteId ?? '', -1);
    });
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

    const before = await prisma.gun.findUnique({
      where:  { id: gunId },
      select: { currentBullets: true, gunType: true },
    });
    if (!before) throw new NotFoundError('Gun not found');

    const { movement } = await prisma.$transaction(async (tx) => {
      const movement = await tx.gunMovement.create({
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
      });
      await tx.gun.update({
        where: { id: gunId },
        data:  {
          status:         toSiteId ? GUN_STATUSES.DEPLOYED : GUN_STATUSES.IN_ARMOURY,
          currentSiteId:  toSiteId,
          currentBullets: bullets,
        },
      });
      // Type/location counters move with the gun in the same transaction.
      const fromKey = fromSiteId ?? '';
      const toKey   = toSiteId ?? '';
      if (fromKey !== toKey) {
        await this.bumpStock(tx, before.gunType, fromKey, -1);
        await this.bumpStock(tx, before.gunType, toKey, 1);
      }
      // Bullet trail: the movement already records the handover count; the
      // ledger row records the delta so the cached balance stays provable.
      // Zero-change handovers (same count in and out) add no ledger noise.
      const change = bullets - before.currentBullets;
      if (change !== 0) {
        await tx.ammoTransaction.create({
          data: {
            gunId,
            change,
            balance: bullets,
            reason: movementType,
            movementId: movement.id,
            recordedById,
          },
        });
      }
      return { movement };
    });

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

  async listGuns(filters: { status?: string; siteId?: string; gunType?: string; client?: string }): Promise<GunResponse[]> {
    const guns = await prisma.gun.findMany({
      where: {
        ...(filters.status  ? { status: filters.status }         : {}),
        ...(filters.siteId  ? { currentSiteId: filters.siteId }  : {}),
        ...(filters.gunType ? { gunType: filters.gunType }       : {}),
        ...(filters.client  ? { currentSite: { clientId: filters.client } } : {}),
      },
      include: GUN_INCLUDE,
      orderBy: { serialNumber: 'asc' },
    });
    return this.labelGuns(guns.map(sanitise));
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
    const [labelled] = await this.labelGuns([sanitise(gun)]);
    return {
      ...labelled,
      movements: gun.movements.map(m => sanitiseMovement(m, names)),
    };
  }

  /** The armoury plus every site currently holding a gun. */
  async getInventory(): Promise<GunInventoryRow[]> {
    const guns = await prisma.gun.findMany({
      where:   { status: { not: GUN_STATUSES.RETIRED } },
      include: { currentSite: { select: { id: true, siteName: true, client: { select: { id: true, clientName: true } } } } },
      orderBy: { serialNumber: 'asc' },
    });

    const catalogue = new Map(
      (await prisma.gunType.findMany({ select: { code: true, label: true } }))
        .map((t) => [t.code, t.label] as const),
    );
    const typeLabel = (code: string) => catalogue.get(code) ?? gunTypeLabel(code);
    const rows = new Map<string, GunInventoryRow>();
    // The armoury is always listed, even when empty — "no guns in the armoury"
    // is a fact worth showing rather than a missing row.
    rows.set('ARMOURY', {
      siteId: null, siteName: ARMOURY_LABEL, clientName: null,
      gunCount: 0, serialNumbers: [], gunTypes: [], byType: [], totalBullets: 0,
    });

    for (const gun of guns) {
      const key = gun.currentSiteId ?? 'ARMOURY';
      if (!rows.has(key)) {
        rows.set(key, {
          siteId:   gun.currentSiteId,
          siteName: gun.currentSite?.siteName ?? 'Unknown site',
          clientName: gun.currentSite?.client?.clientName ?? null,
          gunCount: 0, serialNumbers: [], gunTypes: [], byType: [], totalBullets: 0,
        });
      }
      const row = rows.get(key)!;
      row.gunCount++;
      row.serialNumbers.push(gun.serialNumber);
      if (!row.gunTypes.includes(gun.gunType)) row.gunTypes.push(gun.gunType);
      const slot = row.byType.find((b) => b.gunType === gun.gunType);
      if (slot) slot.count++;
      else row.byType.push({ gunType: gun.gunType, label: typeLabel(gun.gunType), count: 1 });
      row.totalBullets += gun.currentBullets;
    }

    const [armoury, ...sites] = [...rows.values()];
    sites.sort((a, b) => a.siteName.localeCompare(b.siteName));
    return [armoury, ...sites];
  }

  /**
   * Manual bullet correction: rounds spent, found, or topped up outside a
   * movement. The cached balance and the ledger move together or not at all.
   */
  async adjustBullets(gunId: string, data: AdjustBulletsInput, recordedById: string): Promise<GunResponse> {
    const gun = await prisma.gun.findUnique({ where: { id: gunId } });
    if (!gun) throw new NotFoundError('Gun not found');
    if (gun.status === GUN_STATUSES.RETIRED) {
      throw new AppError(`Gun ${gun.serialNumber} is retired and cannot be adjusted.`, 400);
    }

    const balance = gun.currentBullets + data.change;
    if (balance < 0) {
      throw new AppError(
        `Adjustment of ${data.change} would take gun ${gun.serialNumber} to ${balance} rounds - only ${gun.currentBullets} held.`,
        400,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.gun.update({
        where:   { id: gunId },
        data:    { currentBullets: balance },
        include: GUN_INCLUDE,
      });
      await tx.ammoTransaction.create({
        data: {
          gunId,
          change:       data.change,
          balance,
          reason:       data.reason.trim(),
          movementId:   null,
          recordedById,
        },
      });
      return u;
    });

    await QueueService.logAudit({
      userId:   recordedById,
      action:   'GUN_BULLETS_ADJUSTED',
      entity:   'gun',
      entityId: gunId,
      newValue: { serialNumber: gun.serialNumber, change: data.change, balance },
    });

    return sanitise(updated);
  }

  /**
   * Balance check: counters vs live guns, ledger heads vs cached balances.
   * Read-only by design - it reports drift, and a human fixes the cause.
   */
  async reconcile(): Promise<{
    ok: boolean;
    checkedAt: string;
    stockMismatches: Array<{ gunType: string; siteId: string | null; counted: number; actual: number }>;
    ammoMismatches: Array<{ gunId: string; serialNumber: string; cached: number; ledger: number | null }>;
  }> {
    const guns = await prisma.gun.findMany({
      where:  { status: { not: GUN_STATUSES.RETIRED } },
      select: { id: true, serialNumber: true, gunType: true, currentSiteId: true, currentBullets: true },
    });

    const expected = new Map<string, number>();
    for (const g of guns) {
      const key = `${g.gunType}||${g.currentSiteId ?? ''}`;
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }

    const stocks = await prisma.gunTypeStock.findMany();
    const seen = new Set<string>();
    const stockMismatches: Array<{ gunType: string; siteId: string | null; counted: number; actual: number }> = [];
    for (const s of stocks) {
      const key = `${s.gunType}||${s.siteId}`;
      seen.add(key);
      const want = expected.get(key) ?? 0;
      if (s.count !== want) {
        stockMismatches.push({ gunType: s.gunType, siteId: s.siteId || null, counted: s.count, actual: want });
      }
    }
    for (const [key, want] of expected) {
      if (!seen.has(key)) {
        const [gunType, siteId] = key.split('||');
        stockMismatches.push({ gunType, siteId: siteId || null, counted: 0, actual: want });
      }
    }

    const ammoMismatches: Array<{ gunId: string; serialNumber: string; cached: number; ledger: number | null }> = [];
    for (const g of guns) {
      const last = await prisma.ammoTransaction.findFirst({
        where:   { gunId: g.id },
        orderBy: { createdAt: 'desc' },
      });
      const ledger = last ? last.balance : null;
      if (ledger !== g.currentBullets) {
        ammoMismatches.push({ gunId: g.id, serialNumber: g.serialNumber, cached: g.currentBullets, ledger });
      }
    }

    return {
      ok: stockMismatches.length === 0 && ammoMismatches.length === 0,
      checkedAt: new Date().toISOString(),
      stockMismatches,
      ammoMismatches,
    };
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
