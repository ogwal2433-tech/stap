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

  totalIncidents:    z.coerce.number().int().min(0).default(0),
  totalClientCalls:  z.coerce.number().int().min(0).default(0),
  totalAbsentees:    z.coerce.number().int().min(0).default(0),
  totalReplacements: z.coerce.number().int().min(0).default(0),
  majorIssue:        z.string().optional().nullable(),

  outgoingControllerName: z.string().optional().nullable(),
  outgoingTime:           z.string().optional().nullable(),
  incomingControllerName: z.string().optional().nullable(),
  incomingTime:           z.string().optional().nullable(),
  incomingControllerId:   z.string().optional().nullable(),

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
  totalClientCalls:  number;
  totalReplacements: number;
  majorIssue:             string | null;
  outgoingControllerName: string | null;
  outgoingTime:           string | null;
  incomingControllerName: string | null;
  incomingTime:           string | null;
  createdAt:              string;
}
