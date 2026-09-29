import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import { dateRangeFilter } from '../lib/dateUtils';
import type {
  SystemErrorResponse,
  SystemErrorStats,
  SystemErrorQuery,
  PaginatedResponse,
} from '@security360/shared';

function fmt(e: any): SystemErrorResponse {
  return {
    id:              e.id,
    errorCode:       e.errorCode,
    severity:        e.severity,
    category:        e.category,
    message:         e.message,
    stack:           e.stack,
    context:         e.context as Record<string, any> | null,
    route:           e.route,
    method:          e.method,
    statusCode:      e.statusCode,
    userId:          e.userId,
    userRole:        e.userRole,
    ipAddress:       e.ipAddress,
    userAgent:       e.userAgent,
    status:          e.status,
    resolvedBy:      e.resolvedByUser ? { id: e.resolvedByUser.id, name: e.resolvedByUser.name } : null,
    resolvedAt:      e.resolvedAt?.toISOString() ?? null,
    resolutionNotes: e.resolutionNotes,
    occurrenceCount: e.occurrenceCount,
    firstSeenAt:     e.firstSeenAt.toISOString(),
    lastSeenAt:      e.lastSeenAt.toISOString(),
    environment:     e.environment,
    appVersion:      e.appVersion,
    createdAt:       e.createdAt.toISOString(),
    updatedAt:       e.updatedAt.toISOString(),
  };
}

function buildWhere(query: SystemErrorQuery) {
  const where: Record<string, any> = {};
  if (query.status)   where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.category) where.category = query.category;
  if (query.search) {
    where.OR = [
      { message:   { contains: query.search, mode: 'insensitive' } },
      { route:     { contains: query.search, mode: 'insensitive' } },
      { errorCode: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const lastSeenAt = dateRangeFilter(query.dateFrom, query.dateTo);
  if (lastSeenAt) where.lastSeenAt = lastSeenAt;
  return where;
}

export const systemErrorService = {
  async list(query: SystemErrorQuery): Promise<PaginatedResponse<SystemErrorResponse>> {
    const { page, limit } = query;
    const where = buildWhere(query);

    const [rows, total] = await Promise.all([
      prisma.systemError.findMany({
        where,
        include: { resolvedByUser: { select: { id: true, name: true } } },
        // Most severe, most recently seen first
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.systemError.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map(fmt),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  },

  async getById(id: string): Promise<SystemErrorResponse> {
    const e = await prisma.systemError.findUnique({
      where:   { id },
      include: { resolvedByUser: { select: { id: true, name: true } } },
    });
    if (!e) throw new NotFoundError('Error record not found');
    return fmt(e);
  },

  async updateStatus(
    id: string,
    data: { status: string; resolutionNotes?: string },
    userId: string,
  ): Promise<SystemErrorResponse> {
    const isResolved = data.status === 'RESOLVED';
    const e = await prisma.systemError.update({
      where: { id },
      data: {
        status:          data.status,
        resolutionNotes: data.resolutionNotes ?? null,
        resolvedById:    isResolved ? userId : null,
        resolvedAt:      isResolved ? new Date() : null,
      },
      include: { resolvedByUser: { select: { id: true, name: true } } },
    });
    return fmt(e);
  },

  async bulkUpdateStatus(ids: string[], status: string): Promise<number> {
    const result = await prisma.systemError.updateMany({
      where: { id: { in: ids } },
      data:  { status },
    });
    return result.count;
  },

  async getStats(): Promise<SystemErrorStats> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, openCritical, openError, todayCount, bySeverityRaw, byCategoryRaw, byStatusRaw, recent] =
      await Promise.all([
        prisma.systemError.count(),
        prisma.systemError.count({ where: { severity: 'CRITICAL', status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        prisma.systemError.count({ where: { severity: 'ERROR', status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        prisma.systemError.count({ where: { lastSeenAt: { gte: since24h } } }),
        prisma.systemError.groupBy({ by: ['severity'], _count: { _all: true } }),
        prisma.systemError.groupBy({ by: ['category'], _count: { _all: true } }),
        prisma.systemError.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.systemError.findMany({
          orderBy: { lastSeenAt: 'desc' },
          take:    5,
          include: { resolvedByUser: { select: { id: true, name: true } } },
        }),
      ]);

    const bySeverity: Record<string, number> = {};
    for (const r of bySeverityRaw) bySeverity[r.severity] = r._count._all;
    const byCategory: Record<string, number> = {};
    for (const r of byCategoryRaw) byCategory[r.category] = r._count._all;
    const byStatus: Record<string, number> = {};
    for (const r of byStatusRaw) byStatus[r.status] = r._count._all;

    return {
      total,
      openCritical,
      openError,
      todayCount,
      bySeverity,
      byCategory,
      byStatus,
      recentErrors: recent.map(fmt),
    };
  },
};
