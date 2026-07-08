import { z } from 'zod';

// ── Display constants ────────────────────────────────────────────────────────────

export const SEVERITY_COLORS = {
  DEBUG:    'secondary',
  INFO:     'info',
  WARN:     'warning',
  ERROR:    'danger',
  CRITICAL: 'dark',
} as const;

export const CATEGORY_LABELS = {
  SYSTEM:       '⚙️ System',
  API:          '🌐 API',
  DATABASE:     '🗄️ Database',
  PAYMENT:      '💳 Payment',
  AUTH:         '🔐 Auth',
  EXTERNAL_API: '🔗 External API',
  UNKNOWN:      '❓ Unknown',
} as const;

export const ERROR_STATUS_COLORS = {
  OPEN:          'danger',
  INVESTIGATING: 'warning',
  RESOLVED:      'success',
  IGNORED:       'secondary',
} as const;

// ── Input schemas ──────────────────────────────────────────────────────────────

export const UpdateErrorStatusSchema = z.object({
  status:          z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']),
  resolutionNotes: z.string().max(2000).optional(),
});

export const BulkUpdateErrorStatusSchema = z.object({
  ids:    z.array(z.string()).min(1),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']),
});

export const SystemErrorQuerySchema = z.object({
  status:   z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']).optional(),
  severity: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL']).optional(),
  category: z.enum(['SYSTEM', 'API', 'DATABASE', 'PAYMENT', 'AUTH', 'EXTERNAL_API', 'UNKNOWN']).optional(),
  search:   z.string().optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
});

export type UpdateErrorStatusInput     = z.infer<typeof UpdateErrorStatusSchema>;
export type BulkUpdateErrorStatusInput = z.infer<typeof BulkUpdateErrorStatusSchema>;
export type SystemErrorQuery           = z.infer<typeof SystemErrorQuerySchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface SystemErrorResponse {
  id:              string;
  errorCode:       string | null;
  severity:        string; // DEBUG | INFO | WARN | ERROR | CRITICAL
  category:        string; // SYSTEM | API | DATABASE | PAYMENT | AUTH | EXTERNAL_API | UNKNOWN
  message:         string;
  stack:           string | null;
  context:         Record<string, any> | null;
  route:           string | null;
  method:          string | null;
  statusCode:      number | null;
  userId:          string | null;
  userRole:        string | null;
  ipAddress:       string | null;
  userAgent:       string | null;
  status:          string; // OPEN | INVESTIGATING | RESOLVED | IGNORED
  resolvedBy:      { id: string; name: string } | null;
  resolvedAt:      string | null;
  resolutionNotes: string | null;
  occurrenceCount: number;
  firstSeenAt:     string;
  lastSeenAt:      string;
  environment:     string;
  appVersion:      string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface SystemErrorStats {
  total:        number;
  openCritical: number;
  openError:    number;
  todayCount:   number;
  bySeverity:   Record<string, number>;
  byCategory:   Record<string, number>;
  byStatus:     Record<string, number>;
  recentErrors: SystemErrorResponse[];
}
