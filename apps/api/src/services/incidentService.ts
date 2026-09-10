import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { dateRangeFilter } from '../lib/dateUtils';
import type {
  CreateIncidentInput,
  IncidentResponse,
  PaginatedResponse,
} from '@stap/shared';

function toIncidentResponse(incident: Record<string, unknown>): IncidentResponse {
  const site = incident.site as { id: string; siteName: string; client?: { id: string; clientName: string } };
  const reportedBy = incident.reportedBy as { id: string; name: string };
  const incidentGuards = (incident.incidentGuards as { guard: { id: string; firstName: string; lastName: string; otherNames?: string | null } }[]) ?? [];

  return {
    id: incident.id as string,
    site: { id: site.id, siteName: site.siteName },
    client: site.client
      ? { id: site.client.id, clientName: site.client.clientName }
      : { id: '', clientName: '' },
    guards: incidentGuards.map((ig) => ({
      id: ig.guard.id,
      fullName: [ig.guard.firstName, ig.guard.otherNames, ig.guard.lastName]
        .filter(Boolean)
        .join(' '),
    })),
    incidentType: incident.incidentType as string,
    description: incident.description as string,
    severity: incident.severity as IncidentResponse['severity'],
    occurredAt: (incident.occurredAt as Date).toISOString(),
    reportedBy: { id: reportedBy.id, name: reportedBy.name },
    createdAt: (incident.createdAt as Date).toISOString(),
  };
}

class IncidentService {
  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateIncidentInput, reportedById: string): Promise<IncidentResponse> {
    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id: data.siteId },
      include: { client: { select: { id: true, clientName: true } } },
    });
    if (!site) throw new NotFoundError(`Site ${data.siteId} not found`);

    // Verify all guardIds exist (if provided)
    if (data.guardIds && data.guardIds.length > 0) {
      const guardCount = await prisma.guard.count({
        where: { id: { in: data.guardIds } },
      });
      if (guardCount !== data.guardIds.length) {
        throw new AppError('One or more guard IDs are invalid', 400);
      }
    }

    // Create incident + IncidentGuard records in a transaction
    const incident = await prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          siteId: data.siteId,
          incidentType: data.incidentType,
          description: data.description,
          severity: data.severity,
          occurredAt: new Date(data.occurredAt),
          reportedById,
          supervisorCheckinId: data.supervisorCheckinId ?? null,
        },
        include: {
          site: {
            select: {
              id: true,
              siteName: true,
              client: { select: { id: true, clientName: true } },
            },
          },
          reportedBy: { select: { id: true, name: true } },
          incidentGuards: {
            include: {
              guard: {
                select: { id: true, firstName: true, lastName: true, otherNames: true },
              },
            },
          },
        },
      });

      if (data.guardIds && data.guardIds.length > 0) {
        await tx.incidentGuard.createMany({
          data: data.guardIds.map((guardId) => ({
            incidentId: created.id,
            guardId,
          })),
        });
      }

      return created;
    });

    // For HIGH or CRITICAL incidents: notify Director and Operations Supervisor
    if (data.severity === 'HIGH' || data.severity === 'CRITICAL') {
      const notifyRoles = ['DIRECTOR', 'OPERATIONS_SUPERVISOR'];
      const recipients = await prisma.user.findMany({
        where: { role: { in: notifyRoles }, status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      });

      for (const recipient of recipients) {
        await QueueService.sendEmail({
          to: recipient.email,
          subject: `⚠️ ${data.severity} Incident at ${site.siteName}`,
          template: 'incident-alert',
          data: {
            incidentType: data.incidentType,
            siteName: site.siteName,
            severity: data.severity,
            occurredAt: data.occurredAt,
            recipientName: recipient.name,
          },
        });
      }
    }

    await QueueService.logAudit({
      userId: reportedById,
      action: 'INCIDENT_REPORTED',
      entity: 'incident',
      entityId: incident.id,
      newValue: {
        siteId: data.siteId,
        incidentType: data.incidentType,
        severity: data.severity,
      },
    });

    return toIncidentResponse(incident as unknown as Record<string, unknown>);
  }

  // ── List by site ───────────────────────────────────────────────────────────

  async listBySite(
    siteId: string,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<IncidentResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where: { siteId },
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        include: {
          site: {
            select: {
              id: true,
              siteName: true,
              client: { select: { id: true, clientName: true } },
            },
          },
          reportedBy: { select: { id: true, name: true } },
          incidentGuards: {
            include: {
              guard: {
                select: { id: true, firstName: true, lastName: true, otherNames: true },
              },
            },
          },
        },
      }),
      prisma.incident.count({ where: { siteId } }),
    ]);

    return {
      data: incidents.map((i) => toIncidentResponse(i as unknown as Record<string, unknown>)),
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

  // ── List all ───────────────────────────────────────────────────────────────

  async listAll(query: {
    page?: number;
    limit?: number;
    severity?: string;
    siteId?: string;
    from?: string;
    to?: string;
  }): Promise<PaginatedResponse<IncidentResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.IncidentWhereInput = {};

    if (query.severity) where.severity = query.severity;
    if (query.siteId) where.siteId = query.siteId;
    const occurredAt = dateRangeFilter(query.from, query.to);
    if (occurredAt) where.occurredAt = occurredAt;

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        include: {
          site: {
            select: {
              id: true,
              siteName: true,
              client: { select: { id: true, clientName: true } },
            },
          },
          reportedBy: { select: { id: true, name: true } },
          incidentGuards: {
            include: {
              guard: {
                select: { id: true, firstName: true, lastName: true, otherNames: true },
              },
            },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    return {
      data: incidents.map((i) => toIncidentResponse(i as unknown as Record<string, unknown>)),
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
}

export const incidentService = new IncidentService();
