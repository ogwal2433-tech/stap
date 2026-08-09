import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { DEFAULT_SITE_TYPE } from '@stap/shared';
import type {
  CreateSiteInput,
  UpdateSiteInput,
  SiteResponse,
  PaginatedResponse,
} from '@stap/shared';

const SITE_INCLUDE = {
  client:         { select: { clientName: true } },
  equipmentItems: true,
  zone:           { select: { id: true, name: true } },
  _count:         { select: { deployments: true, attendance: true, incidents: true } },
} as const;

function toSiteResponse(site: Record<string, unknown>): SiteResponse {
  const client = site.client as { clientName: string } | undefined;
  const items  = (site.equipmentItems as { id: string; itemName: string; quantity: number; notes: string | null }[] | undefined) ?? [];
  const count  = site._count as { deployments: number; attendance?: number; incidents: number; attendanceRecords?: number } | undefined;

  return {
    id:                  site.id as string,
    clientId:            site.clientId as string,
    clientName:          client?.clientName ?? (site.clientName as string) ?? '',
    siteName:            site.siteName as string,
    location:            site.location as string,
    gpsLat:              (site.gpsLat as number | null) ?? null,
    gpsLon:              (site.gpsLon as number | null) ?? null,
    siteManagerName:     (site.siteManagerName as string | null) ?? null,
    siteManagerContact:  (site.siteManagerContact as string | null) ?? null,
    specialInstructions: (site.specialInstructions as string | null) ?? null,
    guardsRequired:      site.guardsRequired as number,

    siteType:            (site.siteType as string) ?? DEFAULT_SITE_TYPE,

    sitePeriodStart: (site.sitePeriodStart as Date | null)
      ? (site.sitePeriodStart as Date).toISOString() : null,
    sitePeriodEnd: (site.sitePeriodEnd as Date | null)
      ? (site.sitePeriodEnd as Date).toISOString() : null,
    sitePeriodNotes: (site.sitePeriodNotes as string | null) ?? null,
    hasPeriod: ['TEMPORARY', 'SPECIAL_DUTIES'].includes((site.siteType as string) ?? ''),
    periodDays: (() => {
      const s = site.sitePeriodStart as Date | null;
      const e = site.sitePeriodEnd as Date | null;
      if (!s || !e) return null;
      return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    })(),

    armedGuardsRequired: (site.armedGuardsRequired as number) ?? 0,
    firearmsRequired:    (site.firearmsRequired as number) ?? 0,
    batonRequired:       (site.batonRequired as number) ?? 0,
    otherWeaponsNotes:   (site.otherWeaponsNotes as string | null) ?? null,
    isArmed: ((site.armedGuardsRequired as number) ?? 0) > 0
          || ((site.firearmsRequired as number) ?? 0) > 0
          || ((site.batonRequired as number) ?? 0) > 0,
    equipmentDetails:    (site.equipmentDetails as string | null) ?? null,
    allowedShiftTypes:   (site.allowedShiftTypes as string[]) ?? [],
    defaultShiftType:    null,
    equipmentItems:      items,
    zone: (site.zone as { id: string; name: string } | null) ?? null,

    createdAt: (site.createdAt as Date).toISOString(),
    updatedAt: (site.updatedAt as Date).toISOString(),
    ...(count ? {
      _count: {
        deployments:      count.deployments,
        attendanceRecords: count.attendance ?? count.attendanceRecords ?? 0,
        incidents:        count.incidents,
      },
    } : {}),
  };
}

/** Validate that a shift type code exists and is active. */
async function assertShiftTypeActive(code: string): Promise<void> {
  const shift = await prisma.shiftTypeConfig.findUnique({ where: { code } });
  if (!shift || !shift.isActive) {
    throw new AppError(`Shift type "${code}" not found or is inactive.`, 400);
  }
}

class SiteService {
  // ── List by client ─────────────────────────────────────────────────────────

  async listByClient(clientId: string): Promise<SiteResponse[]> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError(`Client ${clientId} not found`);

    const sites = await prisma.site.findMany({
      where:   { clientId },
      orderBy: { siteName: 'asc' },
      include: SITE_INCLUDE,
    });

    return sites.map((s) =>
      toSiteResponse({
        ...s,
        _count: {
          deployments:      s._count.deployments,
          attendance:       s._count.attendance,
          incidents:        s._count.incidents,
        },
      }),
    );
  }

  // ── List all ───────────────────────────────────────────────────────────────

  async listAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    clientId?: string;
    unzoned?: string;
  }): Promise<PaginatedResponse<SiteResponse>> {
    const page  = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip  = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.SiteWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.unzoned === 'true') where.zoneId = null;
    if (query.search) {
      where.OR = [
        { siteName: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [sites, total] = await Promise.all([
      prisma.site.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { siteName: 'asc' },
        include: SITE_INCLUDE,
      }),
      prisma.site.count({ where }),
    ]);

    return {
      data: sites.map((s) =>
        toSiteResponse({
          ...s,
          _count: { deployments: s._count.deployments, attendance: s._count.attendance, incidents: s._count.incidents },
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext:    skip + limit < total,
        hasPrev:    page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string): Promise<SiteResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const site = await prisma.site.findUnique({
      where:   { id },
      include: {
        ...SITE_INCLUDE,
        deployments: {
          where:   { date: { gte: today } },
          include: { guard: { select: { firstName: true, lastName: true } } },
          take:    20,
        },
      },
    });

    if (!site) throw new NotFoundError(`Site ${id} not found`);

    return toSiteResponse({
      ...site,
      _count: { deployments: site._count.deployments, attendance: site._count.attendance, incidents: site._count.incidents },
    });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateSiteInput, createdBy: string): Promise<SiteResponse> {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new NotFoundError(`Client ${data.clientId} not found`);

    // Validate shift type codes
    if (data.allowedShiftTypes?.length) {
      const valid = await prisma.shiftTypeConfig.findMany({
        where: { code: { in: data.allowedShiftTypes }, isActive: true },
      });
      if (valid.length !== data.allowedShiftTypes.length) {
        throw new AppError('One or more shift types are invalid or inactive.', 400);
      }
    }

    // Validate security quantities
    if ((data.firearmsRequired ?? 0) > 0 && (data.armedGuardsRequired ?? 0) === 0) {
      throw new AppError('If firearms are required, at least one armed guard must also be specified.', 400);
    }

    // Validate site period (TEMPORARY and SPECIAL_DUTIES require date range)
    const needsPeriod = ['TEMPORARY', 'SPECIAL_DUTIES'].includes(data.siteType ?? '');
    if (needsPeriod) {
      if (!data.sitePeriodStart || !data.sitePeriodEnd) {
        throw new AppError(`${data.siteType} sites require a period start and end date.`, 400);
      }
      const start = new Date(data.sitePeriodStart);
      const end   = new Date(data.sitePeriodEnd);
      if (end < start) {
        throw new AppError('Period end date cannot be before the start date.', 400);
      }
      if (data.siteType === 'SPECIAL_DUTIES') {
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (days > 30) {
          console.warn(`[Site] Special Duties period is ${days} days — unusually long. Site: ${data.siteName}`);
        }
      }
    } else {
      data.sitePeriodStart = null;
      data.sitePeriodEnd   = null;
      data.sitePeriodNotes = null;
    }

    const { equipmentItems, ...siteData } = data;

    const site = await prisma.site.create({
      data: {
        clientId:            siteData.clientId,
        siteName:            siteData.siteName,
        location:            siteData.location,
        gpsLat:              siteData.gpsLat ?? null,
        gpsLon:              siteData.gpsLon ?? null,
        siteManagerName:     siteData.siteManagerName ?? null,
        siteManagerContact:  siteData.siteManagerContact ?? null,
        specialInstructions: siteData.specialInstructions ?? null,
        guardsRequired:      siteData.guardsRequired,
        siteType:            siteData.siteType ?? DEFAULT_SITE_TYPE,
        sitePeriodStart: siteData.sitePeriodStart
          ? new Date(siteData.sitePeriodStart) : null,
        sitePeriodEnd: siteData.sitePeriodEnd
          ? new Date(siteData.sitePeriodEnd) : null,
        sitePeriodNotes:    siteData.sitePeriodNotes ?? null,
        armedGuardsRequired: siteData.armedGuardsRequired ?? 0,
        firearmsRequired:    siteData.firearmsRequired ?? 0,
        batonRequired:       siteData.batonRequired ?? 0,
        otherWeaponsNotes:   siteData.otherWeaponsNotes ?? null,
        equipmentDetails:    siteData.equipmentDetails ?? null,
        allowedShiftTypes:   siteData.allowedShiftTypes ?? [],
        defaultShiftType:    null,
      },
      include: SITE_INCLUDE,
    });

    if (equipmentItems?.length) {
      await prisma.siteEquipmentItem.createMany({
        data: equipmentItems.map((item) => ({ ...item, siteId: site.id })),
      });
    }

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'SITE_CREATED',
      entity:   'site',
      entityId: site.id,
      newValue: { siteName: site.siteName, siteType: site.siteType, clientId: site.clientId },
    });

    return this.getById(site.id);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateSiteInput, updatedBy: string): Promise<SiteResponse> {
    const existing = await prisma.site.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Site ${id} not found`);

    if (data.allowedShiftTypes?.length) {
      const valid = await prisma.shiftTypeConfig.findMany({
        where: { code: { in: data.allowedShiftTypes }, isActive: true },
      });
      if (valid.length !== data.allowedShiftTypes.length) {
        throw new AppError('One or more shift types are invalid or inactive.', 400);
      }
    }

    // Determine the effective siteType (use incoming or fall back to existing)
    const effectiveSiteType = data.siteType ?? existing.siteType;
    const needsPeriodUpdate = ['TEMPORARY', 'SPECIAL_DUTIES'].includes(effectiveSiteType);
    if (needsPeriodUpdate) {
      const startStr = data.sitePeriodStart ?? existing.sitePeriodStart?.toISOString();
      const endStr   = data.sitePeriodEnd   ?? existing.sitePeriodEnd?.toISOString();
      if (!startStr || !endStr) {
        throw new AppError(`${effectiveSiteType} sites require a period start and end date.`, 400);
      }
      const start = new Date(startStr);
      const end   = new Date(endStr);
      if (end < start) {
        throw new AppError('Period end date cannot be before the start date.', 400);
      }
      if (effectiveSiteType === 'SPECIAL_DUTIES') {
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (days > 30) {
          console.warn(`[Site] Special Duties period is ${days} days — unusually long. Site: ${data.siteName ?? existing.siteName}`);
        }
      }
    } else if (data.siteType && !['TEMPORARY', 'SPECIAL_DUTIES'].includes(data.siteType)) {
      // Switching to a type without a period (PERMANENT) — clear period dates
      data.sitePeriodStart = null;
      data.sitePeriodEnd   = null;
      data.sitePeriodNotes = null;
    }

    const { equipmentItems, ...rawData } = data;
    const siteData = {
      ...rawData,
      sitePeriodStart: rawData.sitePeriodStart !== undefined
        ? (rawData.sitePeriodStart ? new Date(rawData.sitePeriodStart) : null)
        : undefined,
      sitePeriodEnd: rawData.sitePeriodEnd !== undefined
        ? (rawData.sitePeriodEnd ? new Date(rawData.sitePeriodEnd) : null)
        : undefined,
    };

    await prisma.site.update({ where: { id }, data: siteData });

    if (equipmentItems !== undefined) {
      await prisma.siteEquipmentItem.deleteMany({ where: { siteId: id } });
      if (equipmentItems.length) {
        await prisma.siteEquipmentItem.createMany({
          data: equipmentItems.map((item) => ({ ...item, siteId: id })),
        });
      }
    }

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'SITE_UPDATED',
      entity:   'site',
      entityId: id,
      oldValue: { siteName: existing.siteName },
      newValue: { siteName: data.siteName ?? existing.siteName },
    });

    return this.getById(id);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string, deletedBy: string): Promise<void> {
    const existing = await prisma.site.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Site ${id} not found`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeDeployments = await prisma.deployment.count({
      where: { siteId: id, date: { gte: today } },
    });

    if (activeDeployments > 0) {
      throw new AppError('Cannot delete site with active deployments', 409);
    }

    await prisma.site.delete({ where: { id } });

    await QueueService.logAudit({
      userId:   deletedBy,
      action:   'SITE_DELETED',
      entity:   'site',
      entityId: id,
      oldValue: { siteName: existing.siteName, clientId: existing.clientId },
    });
  }
}

export const siteService = new SiteService();
