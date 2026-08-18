import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import { dateRangeFilter } from '../lib/dateUtils';
import type { AuditLogQuery, AuditLogEntry, AuditLogListResult } from '@stap/shared';

const INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(l: any): AuditLogEntry {
  return {
    id:       l.id,
    action:   l.action,
    entity:   l.entity,
    entityId: l.entityId,
    // Most rows carry no userId — the write site never passed one. Saying
    // "System" is honest; inferring an actor from entityId would not be.
    performedBy: l.user ? { id: l.user.id, name: l.user.name, role: l.user.role } : null,
    oldValue:  l.oldValue ?? null,
    newValue:  l.newValue ?? null,
    ipAddress: l.ipAddress ?? null,
    userAgent: l.userAgent ?? null,
    createdAt: l.createdAt.toISOString(),
  };
}

/**
 * Read side of the audit trail.
 *
 * Nothing here writes: entries are appended across the codebase and are meant
 * to be immutable, so this service only ever queries.
 */
class AuditLogService {
  async list(query: AuditLogQuery): Promise<AuditLogListResult> {
    const { page, limit } = query;
    const where: import('@prisma/client').Prisma.AuditLogWhereInput = {};

    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;

    // Entity is matched case-insensitively: the same entity has been written
    // both ways over time ('clientComplaint' and 'ClientComplaint'), and a
    // filter that only found one of them would quietly hide half the trail.
    if (query.entity) where.entity = { equals: query.entity, mode: 'insensitive' };

    const createdAt = dateRangeFilter(query.dateFrom, query.dateTo, true);
    if (createdAt) where.createdAt = createdAt;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { action:   { contains: search, mode: 'insensitive' } },
        { entity:   { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total, actions, entities] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.auditLog.count({ where }),
      // Filter options come from the whole table, not the filtered slice —
      // otherwise choosing one action would empty the dropdown behind it.
      prisma.auditLog.findMany({
        select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' },
      }),
      prisma.auditLog.findMany({
        select: { entity: true }, distinct: ['entity'], orderBy: { entity: 'asc' },
      }),
    ]);

    return {
      data:  logs.map(fmt),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      actionTypes: actions.map(a => a.action),
      entityTypes: dedupeCaseInsensitive(entities.map(e => e.entity)),
    };
  }

  async getById(id: string): Promise<AuditLogEntry> {
    const log = await prisma.auditLog.findUnique({ where: { id }, include: INCLUDE });
    if (!log) throw new NotFoundError('Audit log entry not found');
    return fmt(log);
  }
}

/** Collapses 'ClientComplaint' and 'clientComplaint' into one filter option. */
function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const auditLogService = new AuditLogService();
