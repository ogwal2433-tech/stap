import { z } from 'zod';

// ── Roster creation ────────────────────────────────────────────────────────────

const GuardRosterEntry = z.union([
  z.string().min(1),
  z.object({ guardId: z.string().min(1), overtimeHours: z.coerce.number().min(0).optional() }),
]);

export const CreateRosterSchema = z.object({
  siteId:         z.string().min(1),
  guardIds:       z.array(GuardRosterEntry).min(1),
  supervisorId:   z.string().min(1),
  shiftType:      z.string().min(1),
  startDate:      z.string().datetime(),
  endDate:        z.string().datetime().optional()
                    .describe('If set, creates recurring deployments from startDate to endDate'),
  recurring:      z.boolean().default(false),
  daysOfWeek:     z.array(z.number().min(0).max(6)).optional()
                    .describe('0=Sunday...6=Saturday for recurring'),
  deploymentType:        z.enum(['UNARMED', 'ARMED', 'FIREARMS']).default('UNARMED'),
  weaponsDetails:        z.string().max(500).optional(),
  startTime:             z.string().optional(),
  endTime:               z.string().optional(),
  replacementForGuardId: z.string().min(1).optional(),
});

export type CreateRosterInput = z.input<typeof CreateRosterSchema>;

// ── Attendance marking ─────────────────────────────────────────────────────────

export const CopyRosterSchema = z.object({
  sourceDate: z.string().datetime(),
  targetDate: z.string().datetime(),
});

export type CopyRosterInput = z.infer<typeof CopyRosterSchema>;

export const MarkAttendanceSchema = z.object({
  records: z.array(z.object({
    guardId: z.string().min(1),
    siteId:  z.string().min(1),
    date:    z.string().datetime(),
    status:  z.enum(['PRESENT', 'ABSENT', 'LATE', 'AWOL']),
    timeIn:  z.string().optional(),
    timeOut: z.string().optional(),
    notes:   z.string().max(500).optional(),
  })).min(1),
});

export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

// ── Supervisor check-in ────────────────────────────────────────────────────────

export const SupervisorCheckinSchema = z.object({
  siteId:       z.string().min(1),
  gpsLat:       z.number().min(-90).max(90).optional(),
  gpsLon:       z.number().min(-180).max(180).optional(),
  notes:        z.string().max(500).optional(),
  incidentFlag: z.boolean().default(false),
});

export type SupervisorCheckinInput = z.infer<typeof SupervisorCheckinSchema>;

// ── Query schemas ──────────────────────────────────────────────────────────────

export const DeploymentListQuerySchema = z.object({
  date:    z.string().optional().describe('ISO date string — defaults to today'),
  siteId:  z.string().min(1).optional(),
  guardId: z.string().min(1).optional(),
  page:    z.coerce.number().int().positive().default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(50),
});

export type DeploymentListQuery = z.infer<typeof DeploymentListQuerySchema>;

export const AttendanceQuerySchema = z.object({
  date:   z.string().optional(),
  siteId: z.string().min(1).optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'AWOL']).optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
});

export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface ConflictDetail {
  guardId:        string;
  guardName:      string;
  date:           string;
  existingSite:   string;
  existingClient: string;
  message:        string;
}

export interface RosterCreationResult {
  created:   number;
  conflicts: ConflictDetail[];
  skipped:   number;
  message?:  string;
}

export interface DeploymentResponse {
  id:                    string;
  guard:                 { id: string; fullName: string; phone: string; photoUrl: string | null };
  site:                  { id: string; siteName: string; location: string; client: { id: string; clientName: string } };
  supervisor:            { id: string; name: string };
  shiftType:             string;
  date:                  string;
  deploymentType:        string;
  weaponsDetails:        string | null;
  overtimeHours:         number | null;
  overtimeReason:        string | null;
  copiedFromDate:        string | null;
  replacementForGuardId: string | null;
  createdAt:             string;
  attendance?: {
    status:  string;
    timeIn:  string | null;
    timeOut: string | null;
    notes:   string | null;
  };
}

export interface AttendanceRecord {
  id:        string;
  guard:     { id: string; fullName: string; photoUrl: string | null };
  site:      { id: string; siteName: string };
  date:      string;
  status:    'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL';
  timeIn:    string | null;
  timeOut:   string | null;
  notes:     string | null;
  createdAt: string;
}

export interface GuardBasicResponse {
  id:       string;
  fullName: string;
  phone:    string | null;
  photoUrl: string | null;
  rank:     string | null;
}

export interface AttendanceSummary {
  date:    string;
  present: number;
  absent:  number;
  late:    number;
  awol:    number;
}

export interface CheckinResponse {
  id:           string;
  supervisorId: string;
  siteId:       string;
  dateTime:     string;
  photoUrl:     string | null;
  gpsLat:       number | null;
  gpsLon:       number | null;
  notes:        string | null;
  incidentFlag: boolean;
  createdAt:    string;
}

export interface DailySheetSite {
  site:        { id: string; siteName: string; location: string; client: { id: string; clientName: string }; guardsRequired: number };
  supervisor:  { id: string; name: string } | null;
  deployments: DeploymentResponse[];
}

export interface DailySheetResponse {
  date:  string;
  sites: DailySheetSite[];
}
