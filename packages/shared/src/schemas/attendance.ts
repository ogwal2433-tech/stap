import { z } from 'zod';

// ── Roster creation ────────────────────────────────────────────────────────────

export const CreateRosterSchema = z.object({
  siteId:       z.string().min(1),
  guardIds:     z.array(z.string().min(1)).min(1),
  supervisorId: z.string().min(1),
  shiftType:    z.enum(['DAY', 'NIGHT', 'FULL_24']),
  startDate:    z.string().datetime(),
  endDate:      z.string().datetime().optional()
                  .describe('If set, creates recurring deployments from startDate to endDate'),
  recurring:    z.boolean().default(false),
  daysOfWeek:   z.array(z.number().min(0).max(6)).optional()
                  .describe('0=Sunday...6=Saturday for recurring'),
});

export type CreateRosterInput = z.infer<typeof CreateRosterSchema>;

// ── Attendance marking ─────────────────────────────────────────────────────────

export const MarkAttendanceSchema = z.object({
  records: z.array(z.object({
    guardId: z.string().min(1),
    siteId:  z.string().min(1),
    date:    z.string().datetime(),
    status:  z.enum(['PRESENT', 'ABSENT', 'LATE', 'AWOL']),
    /** @deprecated Not collected from UI. Shift type defines working hours. */
    timeIn:  z.string().optional(),
    /** @deprecated Not collected from UI. Shift type defines working hours. */
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
  guardId:      string;
  guardName:    string;
  date:         string;
  existingSite: string;
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
  attendance?: {
    status:  string;
    timeIn:  string | null;
    timeOut: string | null;
    notes:   string | null;
  } | null;
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
