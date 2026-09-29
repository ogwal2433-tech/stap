import { DEPLOYABLE_STATUSES } from '@security360/shared';
import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import { resolveSiteShift, listActiveShiftCodes } from './siteService';
import type {
  CreateZoneInput,
  UpdateZoneInput,
  ZoneResponse,
  ZoneRosterData,
  ZoneSiteOption,
  PaginatedResponse,
} from '@security360/shared';

function toZoneResponse(z: Record<string, unknown>): ZoneResponse {
  const sup   = z.supervisor as { id: string; name: string; role: string } | null | undefined;
  const alt   = z.alternate  as { id: string; name: string; role: string } | null | undefined;
  const rawSites = z.sites as Array<{
    id: string; siteName: string; location: string; siteType: string;
    guardsRequired: number; client?: { clientName: string };
  }> | undefined;
  return {
    id:           z.id as string,
    name:         z.name as string,
    description:  (z.description as string | null) ?? null,
    supervisorId: (z.supervisorId as string | null) ?? null,
    alternateId:  (z.alternateId  as string | null) ?? null,
    isActive:     z.isActive as boolean,
    supervisor:   sup ? { id: sup.id, name: sup.name, role: sup.role } : null,
    alternate:    alt ? { id: alt.id, name: alt.name, role: alt.role } : null,
    siteCount:    (z._count as { sites: number } | undefined)?.sites ?? rawSites?.length ?? 0,
    sites:        rawSites?.map((s) => ({
      id:             s.id,
      siteName:       s.siteName,
      location:       s.location,
      siteType:       s.siteType,
      guardsRequired: s.guardsRequired,
      clientName:     s.client?.clientName ?? '',
    })) ?? [],
    createdAt:    (z.createdAt as Date).toISOString(),
    updatedAt:    (z.updatedAt as Date).toISOString(),
  };
}

const zoneInclude = {
  supervisor: { select: { id: true, name: true, role: true } },
  alternate:  { select: { id: true, name: true, role: true } },
  _count:     { select: { sites: { where: { deletedAt: null } } } },
} as const;

const zoneDetailInclude = {
  supervisor: { select: { id: true, name: true, role: true } },
  alternate:  { select: { id: true, name: true, role: true } },
  _count:     { select: { sites: { where: { deletedAt: null } } } },
  sites: {
    where:  { deletedAt: null },
    select: {
      id: true, siteName: true, location: true,
      siteType: true, guardsRequired: true,
      client: { select: { clientName: true } },
    },
    orderBy: { siteName: 'asc' as const },
  },
} as const;

class ZoneService {
  async list(query: {
    page?: number;
    limit?: number;
    isActive?: boolean;
    search?: string;
  }): Promise<PaginatedResponse<ZoneResponse>> {
    const page  = Number(query.page  ?? 1);
    const limit = Number(query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.ZoneWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search)  where.name = { contains: query.search, mode: 'insensitive' };

    const [zones, total] = await Promise.all([
      prisma.zone.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: zoneInclude }),
      prisma.zone.count({ where }),
    ]);

    return {
      data:       zones.map((z) => toZoneResponse(z as Record<string, unknown>)),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async listForSupervisor(userId: string): Promise<ZoneResponse[]> {
    const zones = await prisma.zone.findMany({
      where: {
        isActive: true,
        OR: [{ supervisorId: userId }, { alternateId: userId }],
      },
      orderBy: { name: 'asc' },
      include: zoneInclude,
    });
    return zones.map((z) => toZoneResponse(z as Record<string, unknown>));
  }

  /**
   * The single zone a Field Supervisor works — what the deployment sheet reads
   * so they never have to pick a zone by hand.
   *
   * A supervisor covering more than one zone (or standing in as the alternate
   * on another) gets the one they own outright, falling back to the first they
   * cover. Returns null rather than throwing: not yet being assigned a zone is
   * an ordinary state the sheet has to render a prompt for, not an error.
   */
  async getMyZone(userId: string): Promise<ZoneResponse | null> {
    const owned = await prisma.zone.findFirst({
      where:   { isActive: true, supervisorId: userId },
      orderBy: { name: 'asc' },
      include: zoneDetailInclude,
    });
    if (owned) return toZoneResponse(owned as Record<string, unknown>);

    const covered = await prisma.zone.findFirst({
      where:   { isActive: true, alternateId: userId },
      orderBy: { name: 'asc' },
      include: zoneDetailInclude,
    });
    return covered ? toZoneResponse(covered as Record<string, unknown>) : null;
  }

  /**
   * Sites in a zone, each carrying the shift it deploys on so the deployment
   * sheet can fill the Shift column straight from the dropdown selection.
   */
  async listSites(zoneId: string): Promise<ZoneSiteOption[]> {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId }, select: { id: true } });
    if (!zone) throw new NotFoundError(`Zone ${zoneId} not found`);

    const [sites, activeShiftCodes] = await Promise.all([
      prisma.site.findMany({
        where:   { zoneId },
        orderBy: { siteName: 'asc' },
        select: {
          id: true, siteName: true, location: true,
          defaultShiftType: true, allowedShiftTypes: true,
          client: {
            select: {
              clientName: true,
              contracts:  {
                where:   { status: 'ACTIVE', deletedAt: null },
                orderBy: { contractStart: 'desc' },
                take:    1,
                select:  { shiftPattern: true },
              },
            },
          },
        },
      }),
      listActiveShiftCodes(),
    ]);

    return sites.map((s) => {
      const shiftPattern = s.client?.contracts?.[0]?.shiftPattern ?? null;
      const resolved = resolveSiteShift(
        {
          id:                s.id,
          siteName:          s.siteName,
          defaultShiftType:  s.defaultShiftType,
          allowedShiftTypes: s.allowedShiftTypes,
          shiftPattern,
        },
        activeShiftCodes,
      );
      return {
        id:           s.id,
        siteName:     s.siteName,
        location:     s.location,
        clientName:   s.client?.clientName ?? '',
        shift:        resolved.shift,
        shiftPattern: resolved.shiftPattern,
        shiftOptions: resolved.shiftOptions,
      };
    });
  }

  async getById(id: string): Promise<ZoneResponse> {
    const zone = await prisma.zone.findUnique({ where: { id }, include: zoneDetailInclude });
    if (!zone) throw new NotFoundError(`Zone ${id} not found`);
    return toZoneResponse(zone as Record<string, unknown>);
  }

  async create(data: CreateZoneInput, createdBy: string): Promise<ZoneResponse> {
    const zone = await prisma.zone.create({
      data: {
        name:         data.name,
        description:  data.description,
        supervisorId: data.supervisorId,
        alternateId:  data.alternateId,
        createdBy,
      },
      include: zoneInclude,
    });

    if (data.siteIds && data.siteIds.length > 0) {
      await prisma.site.updateMany({
        where: { id: { in: data.siteIds } },
        data:  { zoneId: zone.id },
      });
      // Re-fetch with updated sites included
      const updated = await prisma.zone.findUnique({
        where:   { id: zone.id },
        include: zoneInclude,
      });
      return toZoneResponse(updated as Record<string, unknown>);
    }

    return toZoneResponse(zone as Record<string, unknown>);
  }

  async update(id: string, data: UpdateZoneInput): Promise<ZoneResponse> {
    const existing = await prisma.zone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Zone ${id} not found`);

    const zone = await prisma.zone.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name:         data.name }),
        ...(data.description !== undefined && { description:  data.description }),
        ...(data.supervisorId !== undefined && { supervisorId: data.supervisorId }),
        ...(data.alternateId  !== undefined && { alternateId:  data.alternateId }),
        ...(data.isActive    !== undefined && { isActive:     data.isActive }),
      },
      include: zoneInclude,
    });
    return toZoneResponse(zone as Record<string, unknown>);
  }

  async getRosterData(zoneId: string, dateStr?: string): Promise<ZoneRosterData> {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: {
        supervisor: { select: { id: true, name: true, role: true } },
        alternate:  { select: { id: true, name: true, role: true } },
        sites: {
          where:  { deletedAt: null },
          select: {
            id:                  true,
            siteName:            true,
            location:            true,
            guardsRequired:      true,
            siteType:            true,
            defaultShiftType:    true,
            armedGuardsRequired:  true,
            firearmsRequired:     true,
            batonRequired:        true,
            otherWeaponsNotes:    true,
            specialInstructions:  true,
            sitePeriodStart: true,
            sitePeriodEnd:   true,
            sitePeriodNotes:     true,
            client: { select: { id: true, clientName: true } },
          },
          orderBy: { siteName: 'asc' },
        },
      },
    });

    if (!zone) throw new NotFoundError(`Zone ${zoneId} not found`);

    const date = dateStr ? new Date(dateStr) : new Date();
    date.setUTCHours(0, 0, 0, 0);

    const [deployedRows, allActiveGuards] = await Promise.all([
      prisma.deployment.findMany({
        where:  { date },
        select: { guardId: true },
      }),
      prisma.guard.findMany({
        // Guards with a pending National ID are listed like any other. They
        // used to be filtered out here, which on one database hid 186 of 485
        // active guards with nothing on screen saying why. The gap comes back
        // as a flag so the builder can show it and the paperwork can be
        // chased; it does not stop them being rostered.
        where: { employmentStatus: { in: DEPLOYABLE_STATUSES } },
        select: {
          id:        true,
          firstName: true,
          lastName:  true,
          rank:      true,
          photoUrl:  true,
          phone:     true,
          isIncompleteNID: true,
        },
        orderBy: { firstName: 'asc' },
      }),
    ]);

    const deployedIds = new Set(deployedRows.map((d) => d.guardId));

    const guards = allActiveGuards.map((g) => ({
      id:              g.id,
      firstName:       g.firstName,
      lastName:        g.lastName,
      fullName:        `${g.firstName} ${g.lastName}`,
      rank:            g.rank ?? null,
      photoUrl:        g.photoUrl ?? null,
      phone:           g.phone,
      alreadyDeployed:   deployedIds.has(g.id),
      pendingNationalId: g.isIncompleteNID === true,
    }));

    const sites = (zone.sites as typeof zone.sites).map((s) => ({
      id:                  s.id,
      siteName:            s.siteName,
      location:            s.location,
      guardsRequired:      s.guardsRequired,
      siteType:            s.siteType,
      // Was hardcoded null, which quietly disabled the roster builder's shift
      // pre-fill even though the column is selected above.
      defaultShiftType:    s.defaultShiftType ?? null,
      armedGuardsRequired: (s as any).armedGuardsRequired ?? 0,
      firearmsRequired:    (s as any).firearmsRequired ?? 0,
      batonRequired:       (s as any).batonRequired ?? 0,
      otherWeaponsNotes:   (s as any).otherWeaponsNotes ?? null,
      isArmed: ((s as any).armedGuardsRequired ?? 0) > 0
            || ((s as any).firearmsRequired ?? 0) > 0
            || ((s as any).batonRequired ?? 0) > 0,
      specialInstructions:  (s as any).specialInstructions ?? null,
      sitePeriodStart: (s as any).sitePeriodStart
        ? (s as any).sitePeriodStart.toISOString() : null,
      sitePeriodEnd: (s as any).sitePeriodEnd
        ? (s as any).sitePeriodEnd.toISOString() : null,
      sitePeriodNotes:   (s as any).sitePeriodNotes ?? null,
      hasPeriod: ['TEMPORARY', 'SPECIAL_DUTIES'].includes((s as any).siteType ?? ''),
      periodDays:   (() => {
        const sd = (s as any).sitePeriodStart as Date | null;
        const ed = (s as any).sitePeriodEnd as Date | null;
        if (!sd || !ed) return null;
        return Math.ceil((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      })(),
      client:             s.client,
    }));

    return {
      zone: {
        id:         zone.id,
        name:       zone.name,
        supervisor: zone.supervisor
          ? { id: zone.supervisor.id, name: zone.supervisor.name, role: zone.supervisor.role as string }
          : null,
        alternate: zone.alternate
          ? { id: zone.alternate.id, name: zone.alternate.name, role: zone.alternate.role as string }
          : null,
      },
      sites,
      guards,
      date: date.toISOString(),
    };
  }
}

export const zoneService = new ZoneService();
