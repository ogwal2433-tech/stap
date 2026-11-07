import { z } from 'zod';

/**
 * The Control Room's end-of-shift handover, matching the paper form.
 *
 * Section rows are loose on purpose. The form is filled at the end of a long
 * shift and its cells are prose — a site named in words, a count left blank
 * because nothing happened. Rejecting a half-filled row would push the
 * controller back to paper, so rows are accepted as typed and the numbers are
 * kept as strings until they are read.
 */

export const SHIFT_VALUES = ['DAY', 'NIGHT'] as const;
export const SHIFT_REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'] as const;

/** The nine fixed rows of section 1, in the order the paper form prints them. */
export const DEPLOYMENT_ROW_LABELS = [
  'Sites day/night',
  'Sites supervised physically',
  'Sites supervised by phone call',
  'Absentees Reported (details)',
  'Replacements Made (details)',
  'Sites with Challenges (details)',
  'Sick guards (names and site)',
  'Pass leaves (names)',
  'Deserted (names and site)',
] as const;

/** Section 5 prints the outposts and a total beneath the zones. */
export const GUN_EXTRA_ROWS = ['OUTPOSTS', 'TOTAL'] as const;

const DeploymentRow = z.object({
  label:       z.string(),
  number:      z.string().default(''),
  siteDetails: z.string().default(''),
});

const IncidentRow = z.object({
  time:            z.string().default(''),
  site:            z.string().default(''),
  incident:        z.string().default(''),
  staffResponding: z.string().default(''),
  status:          z.string().default(''),
});

const SupervisionRow = z.object({
  zone:          z.string(),
  physicalCount: z.string().default(''),
  phoneCount:    z.string().default(''),
  challenges:    z.string().default(''),
});

const ClientCommRow = z.object({
  time:             z.string().default(''),
  clientSite:       z.string().default(''),
  issueRaised:      z.string().default(''),
  staffResponsible: z.string().default(''),
});

const GunRow = z.object({
  zone:       z.string(),
  numGuns:    z.string().default(''),
  numBullets: z.string().default(''),
  status:     z.string().default(''),
});

const DisciplineRow = z.object({
  site:          z.string().default(''),
  guardName:     z.string().default(''),
  issue:         z.string().default(''),
  actionTakenBy: z.string().default(''),
});

const DaySupervisorTask = z.object({
  time:       z.string().default(''),
  site:       z.string().default(''),
  task:       z.string().default(''),
  outcome:    z.string().default(''),
  followUp:   z.string().default(''),
});

const DaySupervisorReport = z.object({
  bikeRegistration: z.string().default(''),
  bikeCondition:    z.string().default(''),
  sectionA:         z.array(DaySupervisorTask).default([]),
  sectionB:         z.array(DaySupervisorTask).default([]),
});

const MajorIssueRow = z.object({
  id:                 z.string(),
  issue:              z.string().default(''),
  riskImpact:         z.string().default(''),
  actionRequired:     z.string().default(''),
  responsibleManager: z.string().default(''),
  deadline:           z.string().default(''),
});

/**
 * Sections 8 and 9 differ from the tables above: their rows carry an id.
 * The form edits a row in place and the periods nest inside a motorcycle, so
 * an index is not enough to say which row changed.
 */

export const PRIORITY_LEVELS = [
  { value: 'HIGH',   label: 'High',   colour: '#C0392B', bg: '#FDEDEC' },
  { value: 'MEDIUM', label: 'Medium', colour: '#856404', bg: '#FEF9E7' },
  { value: 'LOW',    label: 'Low',    colour: '#1E8449', bg: '#E8F8F5' },
] as const;

export const PRIORITY_VALUES = ['HIGH', 'MEDIUM', 'LOW'] as const;

const PendingMatterSchema = z.object({
  id:                z.string(),
  description:       z.string().default(''),
  responsiblePerson: z.string().default(''),
  priority:          z.enum(PRIORITY_VALUES).default('MEDIUM'),
  /** ISO timestamp of when the controller added the row. */
  addedAt:           z.string().default(''),
});

const UnreachablePeriodSchema = z.object({
  id:     z.string(),
  from:   z.string().default(''),
  to:     z.string().default(''),
  reason: z.string().default(''),
});

const LongParkedPeriodSchema = z.object({
  id:       z.string(),
  from:     z.string().default(''),
  to:       z.string().default(''),
  location: z.string().default(''),
  /** Display only — computeDuration() is the source of truth when both times are set. */
  duration: z.string().default(''),
});

const MotorcycleReportSchema = z.object({
  id:                 z.string(),
  zone:               z.string().default(''),
  motorcycleId:       z.string().default(''),
  riderName:          z.string().default(''),
  unreachablePeriods: z.array(UnreachablePeriodSchema).default([]),
  longParkedPeriods:  z.array(LongParkedPeriodSchema).default([]),
});

export type PendingMatter     = z.infer<typeof PendingMatterSchema>;
export type DaySupervisorTask  = z.infer<typeof DaySupervisorTask>;
export type DaySupervisorReport = z.infer<typeof DaySupervisorReport>;
export type MajorIssueRow      = z.infer<typeof MajorIssueRow>;
export type UnreachablePeriod = z.infer<typeof UnreachablePeriodSchema>;
export type LongParkedPeriod  = z.infer<typeof LongParkedPeriodSchema>;
export type MotorcycleReport  = z.infer<typeof MotorcycleReportSchema>;

/**
 * "14:30" to "15:15" reads as "45m".
 *
 * An end before the start ran past midnight rather than backwards — the night
 * shift is 18:00–06:00, so a motorcycle unreachable from 23:40 to 00:20 was
 * gone for 40 minutes. Lives here rather than in the form because the PDF
 * prints the same durations and the two must not drift apart.
 */
export function computeDuration(from: string, to: string): string {
  if (!from || !to) return '';
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if ([fh, fm, th, tm].some((n) => !Number.isFinite(n))) return '';
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const ShiftReportBodySchema = z.object({
  date:     z.string().min(1, 'Date is required'),
  shift:    z.enum(SHIFT_VALUES),
  timeFrom: z.string().min(1, 'Start time is required'),
  timeTo:   z.string().min(1, 'End time is required'),

  deploymentRows:    z.array(DeploymentRow).default([]),
  deploymentRemarks: z.string().optional().nullable(),
  incidents:         z.array(IncidentRow).default([]),
  supervisionRows:   z.array(SupervisionRow).default([]),
  clientComms:       z.array(ClientCommRow).default([]),
  gunsDeployed:      z.array(GunRow).default([]),
  disciplineIssues:  z.array(DisciplineRow).default([]),
  pendingMatters:       z.array(PendingMatterSchema).default([]),
  motorcycleReport:     z.array(MotorcycleReportSchema).default([]),
  daySupervisorReport:  DaySupervisorReport.optional().nullable(),
  majorIssues:          z.array(MajorIssueRow).default([]),

  totalIncidents:     z.coerce.number().int().min(0).default(0),
  totalClientCalls:   z.coerce.number().int().min(0).default(0),
  totalAbsentees:     z.coerce.number().int().min(0).default(0),
  totalReplacements:  z.coerce.number().int().min(0).default(0),
  totalSitesExpected: z.coerce.number().int().min(0).default(0),
  totalSitesCovered:  z.coerce.number().int().min(0).default(0),
  totalSickGuards:    z.coerce.number().int().min(0).default(0),
  totalDisciplinary:  z.coerce.number().int().min(0).default(0),
  totalOpenActions:   z.coerce.number().int().min(0).default(0),
  totalOverdueActions:z.coerce.number().int().min(0).default(0),
  majorIssue:         z.string().optional().nullable(),

  outgoingControllerName: z.string().optional().nullable(),
  outgoingTime:           z.string().optional().nullable(),
  incomingControllerName: z.string().optional().nullable(),
  incomingTime:           z.string().optional().nullable(),
  incomingControllerId:   z.string().optional().nullable(),
  forwardedToId:          z.string().optional().nullable(),
  forwardedAt:            z.string().optional().nullable(),

  /** Omitted means SUBMITTED — the form's default action. */
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
});

export type ShiftReportInput = z.infer<typeof ShiftReportBodySchema>;

export interface ShiftReportRowSummary {
  id:              string;
  systemId:        string | null;
  date:            string;
  shift:           string;
  controllerName:  string;
  incomingName:    string | null;
  totalIncidents:  number;
  totalAbsentees:  number;
  status:          string;
  acknowledgedAt:  string | null;
  acknowledgedBy:  string | null;
}

export interface ShiftReportResponse extends ShiftReportRowSummary {
  controllerId:      string;
  timeFrom:          string;
  timeTo:            string;
  deploymentRows:    { label: string; number: string; siteDetails: string }[];
  deploymentRemarks: string | null;
  incidents:         { time: string; site: string; incident: string; staffResponding: string; status: string }[];
  supervisionRows:   { zone: string; physicalCount: string; phoneCount: string; challenges: string }[];
  clientComms:       { time: string; clientSite: string; issueRaised: string; staffResponsible: string }[];
  gunsDeployed:      { zone: string; numGuns: string; numBullets: string; status: string }[];
  disciplineIssues:  { site: string; guardName: string; issue: string; actionTakenBy: string }[];
  pendingMatters:       PendingMatter[];
  motorcycleReport:     MotorcycleReport[];
  daySupervisorReport: DaySupervisorReport | null;
  majorIssues:          MajorIssueRow[];
  totalClientCalls:    number;
  totalReplacements:   number;
  totalSitesExpected:  number;
  totalSitesCovered:   number;
  totalSickGuards:     number;
  totalDisciplinary:   number;
  totalOpenActions:    number;
  totalOverdueActions: number;
  majorIssue:          string | null;
  forwardedToId:       string | null;
  forwardedAt:         string | null;
  outgoingControllerName: string | null;
  outgoingTime:           string | null;
  incomingControllerName: string | null;
  incomingTime:           string | null;
  createdAt:              string;
}
