import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import type {
  CreateSiteInput,
  UpdateSiteInput,
  SiteResponse,
  PaginatedResponse,
} from '@stap/shared';

function toSiteResponse(site: Record<string, unknown>): SiteResponse {
  const client = site.client as { clientName: string } | undefined;
  return {
    id: site.id as string,
    clientId: site.clientId as string,
    clientName: client?.clientName ?? (site.clientName as string) ?? '',
    siteName: site.siteName as string,
    location: site.location as string,
    gpsLat: (site.gpsLat as number | null) ?? null,
    gpsLon: (site.gpsLon as number | null) ?? null,
    siteManagerName: (site.siteManagerName as string | null) ?? null,
    siteManagerContact: (site.siteManagerContact as string | null) ?? null,
    specialInstructions: (site.specialInstructions as string | null) ?? null,
    guardsRequired: site.guardsRequired as number,
    createdAt: (site.createdAt as Date).toISOString(),
    updatedAt: (site.updatedAt as Date).toISOString(),
    ...(site._count ? { _count: site._count as SiteResponse['_count'] } : {}),
  };
}

class SiteService {
  // ── List by client ─────────────────────────────────────────────────────────

  async listByClient(clientId: string): Promise<SiteResponse[]> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError(`Client ${clientId} not found`);

    const sites = await prisma.site.findMany({
      where: { clientId },
      orderBy: { siteName: 'asc' },
      include: {
        client: { select: { clientName: true } },
        _count: { select: { deployments: true, attendance: true, incidents: true } },
      },
    });

    return sites.map((s) =>
      toSiteResponse({
        ...s,
        _count: {
          deployments: s._count.deployments,
          attendanceRecords: s._count.attendance,
          incidents: s._count.incidents,
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
  }): Promise<PaginatedResponse<SiteResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.SiteWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

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
        take: limit,
        orderBy: { siteName: 'asc' },
        include: {
          client: { select: { clientName: true } },
          _count: { select: { deployments: true, attendance: true, incidents: true } },
        },
      }),
      prisma.site.count({ where }),
    ]);

    return {
      data: sites.map((s) =>
        toSiteResponse({
          ...s,
          _count: {
            deployments: s._count.deployments,
            attendanceRecords: s._count.attendance,
            incidents: s._count.incidents,
          },
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string): Promise<SiteResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        client: { select: { clientName: true } },
        deployments: {
          where: { date: { gte: today } },
          include: { guard: { select: { firstName: true, lastName: true } } },
          take: 20,
        },
        _count: { select: { deployments: true, attendance: true, incidents: true } },
      },
    });

    if (!site) throw new NotFoundError(`Site ${id} not found`);

    return {
      ...toSiteResponse({
        ...site,
        _count: {
          deployments: site._count.deployments,
          attendanceRecords: site._count.attendance,
          incidents: site._count.incidents,
        },
      }),
      ...(site as unknown as Record<string, unknown>),
    } as SiteResponse;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateSiteInput, createdBy: string): Promise<SiteResponse> {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new NotFoundError(`Client ${data.clientId} not found`);

    const site = await prisma.site.create({
      data: {
        clientId: data.clientId,
        siteName: data.siteName,
        location: data.location,
        gpsLat: data.gpsLat ?? null,
        gpsLon: data.gpsLon ?? null,
        siteManagerName: data.siteManagerName ?? null,
        siteManagerContact: data.siteManagerContact ?? null,
        specialInstructions: data.specialInstructions ?? null,
        guardsRequired: data.guardsRequired,
      },
      include: {
        client: { select: { clientName: true } },
        _count: { select: { deployments: true, attendance: true, incidents: true } },
      },
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'SITE_CREATED',
      entity: 'site',
      entityId: site.id,
      newValue: { siteName: site.siteName, clientId: site.clientId },
    });

    return toSiteResponse({
      ...site,
      _count: {
        deployments: site._count.deployments,
        attendanceRecords: site._count.attendance,
        incidents: site._count.incidents,
      },
    });
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateSiteInput, updatedBy: string): Promise<SiteResponse> {
    const existing = await prisma.site.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Site ${id} not found`);

    const updated = await prisma.site.update({
      where: { id },
      data,
      include: {
        client: { select: { clientName: true } },
        _count: { select: { deployments: true, attendance: true, incidents: true } },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'SITE_UPDATED',
      entity: 'site',
      entityId: id,
      oldValue: { siteName: existing.siteName },
      newValue: { siteName: updated.siteName },
    });

    return toSiteResponse({
      ...updated,
      _count: {
        deployments: updated._count.deployments,
        attendanceRecords: updated._count.attendance,
        incidents: updated._count.incidents,
      },
    });
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
      userId: deletedBy,
      action: 'SITE_DELETED',
      entity: 'site',
      entityId: id,
      oldValue: { siteName: existing.siteName, clientId: existing.clientId },
    });
  }
}

export const siteService = new SiteService();
