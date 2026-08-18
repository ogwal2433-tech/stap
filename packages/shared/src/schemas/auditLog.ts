import { z } from 'zod';

/** Who may read the audit trail. Mirrors the System Errors viewer. */
export const AUDIT_LOG_QUERY_LIMIT_MAX = 100;

export const AuditLogQuerySchema = z.object({
  action:   z.string().max(80).optional(),
  entity:   z.string().max(80).optional(),
  userId:   z.string().max(40).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  search:   z.string().max(200).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(AUDIT_LOG_QUERY_LIMIT_MAX).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export interface AuditLogActor {
  id:   string;
  name: string;
  role: string;
}

export interface AuditLogEntry {
  id:       string;
  action:   string;
  entity:   string;
  entityId: string;
  /**
   * Null on the majority of historic rows — most write sites record the change
   * without the actor. Rendered as "System" rather than guessed at.
   */
  performedBy: AuditLogActor | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogListResult {
  data:  AuditLogEntry[];
  total: number;
  page:  number;
  limit: number;
  pages: number;
  /** Distinct values present in the table, for populating the filters. */
  actionTypes: string[];
  entityTypes: string[];
}
