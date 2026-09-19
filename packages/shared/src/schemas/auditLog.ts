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

// ── Security log ─────────────────────────────────────────────────────────────

/**
 * Refused requests recorded by the API, plus the sign-in failures that were
 * already being logged — together, every attempt to get in or reach further.
 */
export const SECURITY_ACTIONS = [
  'PERMISSION_DENIED', 'ROLE_DENIED', 'ACCESS_DENIED', 'UNAUTHORISED_ACCESS', 'INVALID_TOKEN',
  'LOGIN_FAILURE', 'LOGIN_DENIED_INACTIVE', 'LOGIN_DENIED_ROLE_DISABLED',
] as const;
export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

export const SECURITY_ACTION_LABELS: Record<SecurityAction, string> = {
  PERMISSION_DENIED:          'Permission denied',
  ROLE_DENIED:                'Role not allowed',
  ACCESS_DENIED:              'Access denied',
  UNAUTHORISED_ACCESS:        'No sign-in',
  INVALID_TOKEN:              'Invalid token',
  LOGIN_FAILURE:              'Sign-in failed',
  LOGIN_DENIED_INACTIVE:      'Sign-in refused: inactive',
  LOGIN_DENIED_ROLE_DISABLED: 'Sign-in refused: role disabled',
};

export const SecurityLogQuerySchema = z.object({
  action:   z.enum(SECURITY_ACTIONS).optional(),
  role:     z.string().max(40).optional(),
  userId:   z.string().max(40).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
});
export type SecurityLogQuery = z.infer<typeof SecurityLogQuerySchema>;

export interface SecurityLogEntry {
  id:        string;
  action:    string;
  createdAt: string;
  /** Null when the request carried no valid sign-in. */
  user:      { id: string; name: string; email: string } | null;
  role:      string | null;
  /** The permission or role that was missing, when the refusal knows it. */
  required:  string | null;
  method:    string | null;
  path:      string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason:    string | null;
}

export interface SecurityLogResult {
  data:  SecurityLogEntry[];
  total: number;
  page:  number;
  pages: number;
  summary: {
    days:     number;
    /** Denials by the role that was refused, most first. */
    byRole:   { role: string | null; count: number }[];
    byAction: { action: string; count: number }[];
  };
}

