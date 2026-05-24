import prisma from '../db/prisma';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import type {
  CreateZoneInput,
  UpdateZoneInput,
  ZoneResponse,
  ZoneSummaryResponse,
} from '@stap/shared';

const ZONE_INCLUDE = {
  supervisor: { select: { id: true, name: true, email: true, role: true } },
  alternate:  { select: { id: true, name: true, email: true, role: true } },
  sites: {
    select: {
      id:             true,
      siteName:       true,
      location:       true,
      siteType:       true,
      guardsRequired: true,
      client:         { select: { clientName: true } },
    },
  },
} as const;

function formatZone(z: any): ZoneResponse {
  return {
    id:          z.id,
    name:        z.name,
    description: z.description ?? null,
    isActive:    z.isActive,
    createdBy:   z.createdBy,
    createdAt:   z.createdAt.toISOString(),
    updatedAt:   z.updatedAt.toISOString(),
    supervisor:  z.supervisor ? { ...z.supervisor, role: z.supervisor.role } : null,
    alternate:   z.alternate  ? { ...z.alternate,  role: z.alternate.role  } : null,
    sites:       (z.sites ?? []).map((s: any) => ({
      id:             s.id,
      siteName:       s.siteName,
      location:       s.location,
      siteType:       s.siteType,
      guardsRequired: s.guardsRequired,
      clientName:     s.client?.clientName ?? '',
    })),
    siteCount:   (z.sites ?? []).length,
  };
}

function formatSummary(z: any): ZoneSummaryResponse {
  return {
    id:          z.id,
    name:        z.name,
    description: z.description ?? null,
    isActive:    z.isActive,
    siteCount:   z._count?.sites ?? (z.sites?.length ?? 0),
    supervisor:  z.supervisor ? { ...z.supervisor, role: z.supervisor.role } : null,
    alternate:   z.alternate  ? { ...z.alternate,  role: z.alternate.role  } : null,
  };
}

async function assertZoneExists(id: string) {
  const zone = await prisma.zone.findUnique({ where: { id } });
  if (!zone) throw new NotFoundError(`Zone ${id} not found`);
  return zone;
}

export const zoneService = {
  async list(activeOnly = false): Promise<ZoneSummaryResponse[]> {
    const zones = await prisma.zone.findMany({
      where:   activeOnly ? { isActive: true } : undefined,
      include: {
        supervisor: { select: { id: true, name: true, email: true, role: true } },
        alternate:  { select: { id: true, name: true, email: true, role: true } },
        _count:     { select: { sites: true } },
      },
      orderBy: { name: 'asc' },
    });
    return zones.map(formatSummary);
  },

  async getById(id: string): Promise<ZoneResponse> {
    const zone = await prisma.zone.findUnique({
      where:   { id },
      include: ZONE_INCLUDE,
    });
    if (!zone) throw new NotFoundError(`Zone ${id} not found`);
    return formatZone(zone);
  },

  async create(data: CreateZoneInput, createdBy: string): Promise<ZoneResponse> {
    const existing = await prisma.zone.findUnique({ where: { name: data.name } });
    if (existing) throw new AppError(`Zone name "${data.name}" is already taken.`, 409);

    if (data.supervisorId) {
      const user = await prisma.user.findUnique({ where: { id: data.supervisorId } });
      if (!user) throw new AppError('Supervisor user not found.', 400);
    }
    if (data.alternateId) {
      const user = await prisma.user.findUnique({ where: { id: data.alternateId } });
      if (!user) throw new AppError('Alternate user not found.', 400);
    }
    if (data.supervisorId && data.alternateId && data.supervisorId === data.alternateId) {
      throw new AppError('Supervisor and alternate cannot be the same person.', 400);
    }

    const zone = await prisma.zone.create({
      data: {
        name:         data.name,
        description:  data.description,
        supervisorId: data.supervisorId,
        alternateId:  data.alternateId,
        createdBy,
      },
      include: ZONE_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'ZONE_CREATED',
      entity:   'zone',
      entityId: zone.id,
      newValue: { name: zone.name },
    });

    return formatZone(zone);
  },

  async update(id: string, data: UpdateZoneInput, updatedBy: string): Promise<ZoneResponse> {
    const existing = await assertZoneExists(id);

    if (data.name && data.name !== existing.name) {
      const conflict = await prisma.zone.findUnique({ where: { name: data.name } });
      if (conflict) throw new AppError(`Zone name "${data.name}" is already taken.`, 409);
    }

    const supId = data.supervisorId !== undefined ? data.supervisorId : existing.supervisorId;
    const altId = data.alternateId  !== undefined ? data.alternateId  : existing.alternateId;

    if (data.supervisorId) {
      const user = await prisma.user.findUnique({ where: { id: data.supervisorId } });
      if (!user) throw new AppError('Supervisor user not found.', 400);
    }
    if (data.alternateId) {
      const user = await prisma.user.findUnique({ where: { id: data.alternateId } });
      if (!user) throw new AppError('Alternate user not found.', 400);
    }
    if (supId && altId && supId === altId) {
      throw new AppError('Supervisor and alternate cannot be the same person.', 400);
    }

    const zone = await prisma.zone.update({
      where:   { id },
      data:    {
        name:         data.name,
        description:  data.description,
        supervisorId: data.supervisorId,
        alternateId:  data.alternateId,
      },
      include: ZONE_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'ZONE_UPDATED',
      entity:   'zone',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: data,
    });

    return formatZone(zone);
  },

  async assignSites(id: string, siteIds: string[], updatedBy: string): Promise<ZoneResponse> {
    await assertZoneExists(id);

    const sites = await prisma.site.findMany({ where: { id: { in: siteIds } } });
    if (sites.length !== siteIds.length) {
      throw new AppError('One or more site IDs not found.', 400);
    }

    await prisma.site.updateMany({
      where: { id: { in: siteIds } },
      data:  { zoneId: id },
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'ZONE_SITES_ASSIGNED',
      entity:   'zone',
      entityId: id,
      newValue: { siteIds },
    });

    return this.getById(id);
  },

  async removeSites(id: string, siteIds: string[], updatedBy: string): Promise<ZoneResponse> {
    await assertZoneExists(id);

    await prisma.site.updateMany({
      where: { id: { in: siteIds }, zoneId: id },
      data:  { zoneId: null },
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'ZONE_SITES_REMOVED',
      entity:   'zone',
      entityId: id,
      newValue: { siteIds },
    });

    return this.getById(id);
  },

  async deactivate(id: string, updatedBy: string): Promise<ZoneResponse> {
    await assertZoneExists(id);

    const zone = await prisma.zone.update({
      where:   { id },
      data:    { isActive: false },
      include: ZONE_INCLUDE,
    });

    await QueueService.logAudit({
      userId: updatedBy, action: 'ZONE_DEACTIVATED', entity: 'zone', entityId: id,
    });

    return formatZone(zone);
  },

  async activate(id: string, updatedBy: string): Promise<ZoneResponse> {
    await assertZoneExists(id);

    const zone = await prisma.zone.update({
      where:   { id },
      data:    { isActive: true },
      include: ZONE_INCLUDE,
    });

    await QueueService.logAudit({
      userId: updatedBy, action: 'ZONE_ACTIVATED', entity: 'zone', entityId: id,
    });

    return formatZone(zone);
  },

  async delete(id: string, deletedBy: string): Promise<void> {
    await assertZoneExists(id);

    const siteCount = await prisma.site.count({ where: { zoneId: id } });
    if (siteCount > 0) {
      throw new AppError(
        `Cannot delete zone with ${siteCount} assigned site(s). Remove sites first.`,
        409,
      );
    }

    await prisma.zone.delete({ where: { id } });

    await QueueService.logAudit({
      userId: deletedBy, action: 'ZONE_DELETED', entity: 'zone', entityId: id,
    });
  },
};
