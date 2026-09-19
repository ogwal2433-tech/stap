import prisma from '../db/prisma';
import { errorLogger } from '../services/errorLogger';

/**
 * Writes an audit entry without ever failing the operation it records.
 *
 * These calls sit after the write they describe, awaited inline, so anything
 * thrown here surfaced as a 500 on an operation that had already succeeded —
 * the record existed and the caller was told it did not. A foreign key
 * violation on userId was the way it showed up: an actor removed between
 * issuing a token and using it leaves a userId with no User row.
 *
 * userId is nullable and the relation is onDelete: SetNull, so an entry whose
 * actor is gone is a shape the schema already allows. The event is worth more
 * than the link, so it is kept with the actor recorded in the payload instead.
 */
export interface AuditEntry {
  userId?:    string | null;
  action:     string;
  entity:     string;
  entityId:   string;
  oldValue?:  unknown;
  newValue?:  unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Refused requests only — see lib/securityLog.ts. */
  method?:    string | null;
  path?:      string | null;
  role?:      string | null;
  required?:  string | null;
}

/** Prisma's code for a foreign key constraint failure. */
const FK_VIOLATION = 'P2003';

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  // Only what the caller supplied. Filling the rest with nulls would write
  // columns the previous direct calls left untouched, and change the row this
  // helper is meant to produce identically.
  const data: Record<string, unknown> = {
    action:   entry.action,
    entity:   entry.entity,
    entityId: entry.entityId,
  };
  if (entry.userId    !== undefined) data.userId    = entry.userId;
  if (entry.oldValue  !== undefined) data.oldValue  = entry.oldValue;
  if (entry.newValue  !== undefined) data.newValue  = entry.newValue;
  if (entry.ipAddress !== undefined) data.ipAddress = entry.ipAddress;
  if (entry.userAgent !== undefined) data.userAgent = entry.userAgent;
  if (entry.method    !== undefined) data.method    = entry.method;
  if (entry.path      !== undefined) data.path      = entry.path;
  if (entry.role      !== undefined) data.role      = entry.role;
  if (entry.required  !== undefined) data.required  = entry.required;

  try {
    await prisma.auditLog.create({ data: data as never });
    return;
  } catch (err) {
    const code = (err as { code?: string }).code;

    // The actor no longer exists. Record the event unlinked rather than lose
    // it, keeping who did it in the payload where no constraint applies.
    if (code === FK_VIOLATION && data.userId) {
      try {
        await prisma.auditLog.create({
          data: {
            ...data,
            userId:   null,
            newValue: {
              ...(typeof data.newValue === 'object' && data.newValue !== null ? data.newValue : {}),
              actorId:       entry.userId,
              actorNotFound: true,
            },
          } as never,
        });
        return;
      } catch {
        // Fall through to logging below.
      }
    }

    // Never rethrow: the operation being audited has already happened.
    void errorLogger.log({
      message:   `Audit entry for ${entry.action} on ${entry.entity} could not be written: ${(err as Error).message}`,
      errorCode: 'AUDIT_LOG_WRITE_FAILED',
      severity:  'WARN',
      category:  'DATABASE',
      context:   { action: entry.action, entity: entry.entity, entityId: entry.entityId, userId: entry.userId },
    });
  }
}
