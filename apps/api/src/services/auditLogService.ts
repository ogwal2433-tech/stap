import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import { dateRangeFilter } from '../lib/dateUtils';
import type { AuditLogQuery, AuditLogEntry, AuditLogListResult } from '@security360/shared';
import { SECURITY_ACTIONS } from '@security360/shared';
import type { SecurityLogQuery, SecurityLogResult } from '@security360/shared';

/** How far back the Security Log's summary cards look. */
const SUMMARY_DAYS = 7;
const DENIALS = ['PERMISSION_DENIED', 'ROLE_DENIED', 'ACCESS_DENIED'];

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

  /** Refused requests and sign-in failures, newest first, with a short summary. */
  async securityLog(query: SecurityLogQuery): Promise<SecurityLogResult> {
    const { page, limit } = query;
    const where: import('@prisma/client').Prisma.AuditLogWhereInput = {
      action: query.action ?? { in: [...SECURITY_ACTIONS] },
    };
    if (query.role)   where.role   = query.role;
    if (query.userId) where.userId = query.userId;
    const createdAt = dateRangeFilter(query.dateFrom, query.dateTo, true);
    if (createdAt) where.createdAt = createdAt;

    const since = new Date(Date.now() - SUMMARY_DAYS * 86_400_000);

    const [rows, total, byRole, byAction] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by:     ['role'],
        where:  { action: { in: DENIALS }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.auditLog.groupBy({
        by:     ['action'],
        where:  { action: { in: [...SECURITY_ACTIONS] }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id:        r.id,
        action:    r.action,
        createdAt: r.createdAt.toISOString(),
        user:      r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
        role:      r.role,
        required:  r.required,
        method:    r.method,
        path:      r.path,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        reason:    (r.newValue as { reason?: string | null } | null)?.reason ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      summary: {
        days:     SUMMARY_DAYS,
        byRole:   byRole.map((g) => ({ role: g.role, count: g._count._all })).sort((a, b) => b.count - a.count),
        byAction: byAction.map((g) => ({ action: g.action, count: g._count._all })).sort((a, b) => b.count - a.count),
      },
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
