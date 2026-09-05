import { z } from 'zod';

// ── Attendance status ──────────────────────────────────────────────────────────

/**
 * Ordered best-to-worst outcome. Only PRESENT and LATE count as days worked in
 * the payroll run — SICK and ON_LEAVE record the reason for a missed day but,
 * like ABSENT, are unpaid.
 */
export const ATTENDANCE_STATUS_CONFIG = {
  PRESENT:  { label: 'Present',  icon: '✅', bg: '#d5f5e3', paid: true  },
  LATE:     { label: 'Late',     icon: '⏰', bg: '#FEF9E7', paid: true  },
  SICK:     { label: 'Sick',     icon: '🤒', bg: '#FEF9E7', paid: false },
  ON_LEAVE: { label: 'On Leave', icon: '🌴', bg: '#D6E0F0', paid: false },
  ABSENT:   { label: 'Absent',   icon: '❌', bg: '#fdecea', paid: false },
  AWOL:     { label: 'AWOL',     icon: '🚫', bg: '#fdecea', paid: false },
} as const;

export type AttendanceStatusValue = keyof typeof ATTENDANCE_STATUS_CONFIG;

export const ATTENDANCE_STATUS_VALUES = Object.keys(ATTENDANCE_STATUS_CONFIG) as [
  AttendanceStatusValue,
  ...AttendanceStatusValue[],
];

export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUS_VALUES);

// ── Deployment sheet (batch) ───────────────────────────────────────────────────

export const DeploymentSheetRowSchema = z.object({
  siteId:   z.string().min(1),
  guardId:  z.string().min(1),
  date:     z.string().datetime(),
  status:   AttendanceStatusSchema,
  /** ShiftTypeConfig code. Falls back to the site's default when omitted. */
  shift:    z.string().min(1).optional(),
});

export const DeploymentSheetBatchSchema = z.object({
  rows: z.array(DeploymentSheetRowSchema).min(1, 'Add at least one row').max(200),
});

export type DeploymentSheetRow   = z.infer<typeof DeploymentSheetRowSchema>;
export type DeploymentSheetBatch = z.infer<typeof DeploymentSheetBatchSchema>;

export interface DeploymentSheetResult {
  created: number;
  updated: number;
  skipped: number;
  /** 1-based row numbers, matching what the user sees in the sheet. */
  errors:  { row: number; reason: string }[];
}

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
  sourceDate:        z.string().datetime(),
  targetDate:        z.string().datetime(),
  siteIds:           z.array(z.string().min(1)).optional(),
  overwriteExisting: z.boolean().default(false),
});

export type CopyRosterInput = z.infer<typeof CopyRosterSchema>;

export interface CopyRosterResult {
  sourceDate:    string;
  targetDate:    string;
  created:       number;
  skipped:       number;
  skippedReasons: {
    guardId:   string;
    guardName: string;
    reason:    'ALREADY_DEPLOYED' | 'INACTIVE' | 'ON_LEAVE';
  }[];
  sitesSummary: {
    siteId:   string;
    siteName: string;
    copied:   number;
    skipped:  number;
  }[];
}

export const MarkAttendanceSchema = z.object({
  records: z.array(z.object({
    guardId: z.string().min(1),
    siteId:  z.string().min(1),
    date:    z.string().datetime(),
    status:  AttendanceStatusSchema,
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
  /** Single day. Ignored when dateFrom/dateTo are supplied. */
  date:     z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  siteId:   z.string().min(1).optional(),
  guardId:  z.string().min(1).optional(),
  status:   AttendanceStatusSchema.optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
});

/** One row per guard, aggregated over a date range — powers the Excel export. */
export interface GuardAttendanceSummary {
  guardId:        string;
  guardName:      string;
  systemId:       string | null;
  rank:           string | null;
  presentDays:    number;
  lateDays:       number;
  sickDays:       number;
  onLeaveDays:    number;
  absentDays:     number;
  awolDays:       number;
  /** Days with any record — the denominator for attendanceRate. */
  totalRecords:   number;
  /** PRESENT + LATE as a percentage of totalRecords. Matches payroll's notion of a day worked. */
  attendanceRate: number;
  sites:          string;
}

export interface GuardAttendanceSummaryResponse {
  dateFrom:   string;
  dateTo:     string;
  totalDays:  number;
  guardCount: number;
  summary:    GuardAttendanceSummary[];
}

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

export const REPLACEMENT_REASONS = {
  SICK:      'Sick / Unwell',
  AWOL:      'AWOL — No notice given',
  PERSONAL:  'Personal Emergency',
  EMERGENCY: 'Family Emergency',
  SUSPENDED: 'Suspended',
  OTHER:     'Other Reason',
} as const;

export type ReplacementReason = keyof typeof REPLACEMENT_REASONS;

export const RequestReplacementSchema = z.object({
  absentDeploymentId: z.string().min(1),
  replacementGuardId: z.string().min(1),
  reason:             z.enum(['SICK', 'AWOL', 'PERSONAL', 'EMERGENCY', 'SUSPENDED', 'OTHER']),
  note:               z.string().max(500).optional(),
});
export type RequestReplacementInput = z.infer<typeof RequestReplacementSchema>;

export interface GuardAvailabilityResponse {
  id:              string;
  systemId:        string | null;
  firstName:       string;
  lastName:        string;
  fullName:        string;
  /** Optional on a guard, so it can be absent here too. */
  phone:           string | null;
  photoUrl:        string | null;
  rank:            string | null;
  alreadyDeployed: boolean;
  deployedAt:      string | null;
  onLeave:         boolean;
}

export interface ReplacementResult {
  originalDeployment: {
    id:        string;
    guardName: string;
    siteName:  string;
    shiftType: string;
    date:      string;
  };
  replacementDeployment: {
    id:        string;
    guardName: string;
    systemId:  string | null;
  };
  reason: string;
  note:   string | null;
}

export interface DeploymentResponse {
  id:         string;
  guard:      { id: string; fullName: string; phone: string; photoUrl: string | null; rank: string | null };
  site:       {
    id: string; siteName: string; location: string; siteType: string;
    client: { id: string; clientName: string };
    zone?: { id: string; name: string } | null;
  };
  supervisor: { id: string; name: string };
  shiftType:  'DAY' | 'NIGHT' | 'FULL_24';
  date:       string;
  createdAt:  string;
  isReplacement:    boolean;
  replacementForId: string | null;
  replacementReason:string | null;
  attendance?: {
    status:           string;
    notes:            string | null;
    replacedByGuardId:string | null;
    replacementNote:  string | null;
  } | null;
}

export interface AttendanceRecord {
  id:        string;
  guard:     { id: string; fullName: string; photoUrl: string | null };
  site:      { id: string; siteName: string };
  date:      string;
  status:    AttendanceStatusValue;
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
  site: {
    id: string; siteName: string; location: string; siteType: string;
    client: { id: string; clientName: string };
    guardsRequired: number;
    specialInstructions: string | null;
  };
  supervisor:    { id: string; name: string } | null;
  deployments:   DeploymentResponse[];
  presentCount:  number;
  absentCount:   number;
  unmarkedCount: number;
}

export interface DailySheetZone {
  zoneId:   string | null;
  zoneName: string | null;
  sites:    DailySheetSite[];
}

export interface DailySheetResponse {
  date:  string;
  zones: DailySheetZone[];
}

export interface AttendanceDashboardData {
  date:           string;
  totalDeployed:  number;
  presentCount:   number;
  lateCount:      number;
  absentCount:    number;
  awolCount:      number;
  unmarkedCount:  number;
  markedCount:    number;
  attendanceRate: number;
  weeklyAvgRate:  number;
  weeklyTrend: {
    date:      string;
    dayLabel:  string;
    deployed:  number;
    present:   number;
    absent:    number;
    unmarked:  number;
    rate:      number;
    isToday:   boolean;
  }[];
  sitesWithMissingAttendance: {
    siteId:        string;
    siteName:      string;
    clientName:    string;
    zoneName:      string | null;
    totalGuards:   number;
    unmarkedCount: number;
    markedCount:   number;
  }[];
  supervisorCheckins: {
    id:          string;
    supervisor:  { id: string; name: string; role: string };
    site:        { id: string; siteName: string; clientName: string };
    checkinTime: string;
    notes:       string | null;
  }[];
}
