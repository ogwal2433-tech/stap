import { z } from 'zod';

// ── Pipeline ───────────────────────────────────────────────────────────────────

export const PROSPECT_STATUSES = [
  { value: 'NEW',               label: '🆕 New',               colour: 'secondary' },
  { value: 'CONTACTED',         label: '📞 Contacted',         colour: 'info'      },
  { value: 'MEETING_SCHEDULED', label: '📅 Meeting Scheduled', colour: 'primary'   },
  { value: 'PROPOSAL_SENT',     label: '📄 Proposal Sent',     colour: 'warning'   },
  { value: 'NEGOTIATION',       label: '🤝 Negotiation',       colour: 'warning'   },
  { value: 'WON',               label: '✅ Won',               colour: 'success'   },
  { value: 'LOST',              label: '❌ Lost',              colour: 'danger'    },
] as const;

export const PROSPECT_STATUS_VALUES = [
  'NEW', 'CONTACTED', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST',
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUS_VALUES)[number];

/** Pipeline stages in order, for funnel and board display. */
export const PIPELINE_ORDER: ProspectStatus[] = [
  'NEW', 'CONTACTED', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST',
];

/** Stages where a deal is live — neither won nor lost. */
export const OPEN_PIPELINE_STATUSES: ProspectStatus[] = [
  'CONTACTED', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION',
];

export function prospectStatusLabel(status: string): string {
  return PROSPECT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function prospectStatusColour(status: string): string {
  return PROSPECT_STATUSES.find((s) => s.value === status)?.colour ?? 'secondary';
}

// ── Bids ───────────────────────────────────────────────────────────────────────

export const BID_TYPES = ['TENDER', 'RFP', 'RFQ', 'DIRECT', 'OTHER'] as const;
export type BidType = (typeof BID_TYPES)[number];

export const BID_STATUSES = [
  { value: 'DRAFT',     label: '📝 Draft',     colour: 'secondary' },
  { value: 'SUBMITTED', label: '📬 Submitted', colour: 'primary'   },
  { value: 'WON',       label: '✅ Won',       colour: 'success'   },
  { value: 'LOST',      label: '❌ Lost',      colour: 'danger'    },
  { value: 'CANCELLED', label: '🚫 Cancelled', colour: 'secondary' },
] as const;

export const BID_STATUS_VALUES = ['DRAFT', 'SUBMITTED', 'WON', 'LOST', 'CANCELLED'] as const;
export type BidStatus = (typeof BID_STATUS_VALUES)[number];

export function bidStatusLabel(status: string): string {
  return BID_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function bidStatusColour(status: string): string {
  return BID_STATUSES.find((s) => s.value === status)?.colour ?? 'secondary';
}

// ── Targets ────────────────────────────────────────────────────────────────────

export const TARGET_PERIOD_TYPES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export type TargetPeriodType = (typeof TARGET_PERIOD_TYPES)[number];

export const MARKETING_REPORT_TYPES = [
  { value: 'PIPELINE',        label: 'Pipeline Report' },
  { value: 'PROSPECTS',       label: 'Prospects Report' },
  { value: 'CLOSED_BUSINESS', label: 'Closed Business' },
  { value: 'BIDS',            label: 'Bid Performance' },
  { value: 'PERFORMANCE',     label: 'Marketing Performance' },
] as const;

export const MARKETING_REPORT_VALUES = [
  'PIPELINE', 'PROSPECTS', 'CLOSED_BUSINESS', 'BIDS', 'PERFORMANCE',
] as const;
export type MarketingReportType = (typeof MARKETING_REPORT_VALUES)[number];

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateProspectSchema = z.object({
  companyName:    z.string().min(2, 'Company name is required').max(200),
  contactName:    z.string().max(150).optional().nullable(),
  contactPhone:   z.string().max(40).optional().nullable(),
  contactEmail:   z.string().email('Enter a valid email').max(150).optional().nullable().or(z.literal('')),
  address:        z.string().max(300).optional().nullable(),
  industry:       z.string().max(100).optional().nullable(),
  notes:          z.string().max(4000).optional().nullable(),
  status:         z.enum(PROSPECT_STATUS_VALUES).default('NEW'),
  estimatedValue: z.coerce.number().int().min(0, 'Value cannot be negative').optional().nullable(),
  assignedToId:   z.string().min(1).optional().nullable(),
});
export type CreateProspectInput = z.infer<typeof CreateProspectSchema>;

export const UpdateProspectSchema = z.object({
  companyName:    z.string().min(2).max(200).optional(),
  contactName:    z.string().max(150).optional().nullable(),
  contactPhone:   z.string().max(40).optional().nullable(),
  contactEmail:   z.string().email().max(150).optional().nullable().or(z.literal('')),
  address:        z.string().max(300).optional().nullable(),
  industry:       z.string().max(100).optional().nullable(),
  notes:          z.string().max(4000).optional().nullable(),
  status:         z.enum(PROSPECT_STATUS_VALUES).optional(),
  estimatedValue: z.coerce.number().int().min(0).optional().nullable(),
  assignedToId:   z.string().min(1).optional().nullable(),
  lostReason:     z.string().max(500).optional().nullable(),
  /** Recorded against the pipeline move, not the prospect. */
  note:           z.string().max(500).optional().nullable(),
}).refine(
  (data) => data.status !== 'LOST' || (data.lostReason?.trim().length ?? 0) > 0,
  { message: 'Give a reason before marking this prospect as lost.', path: ['lostReason'] },
);
export type UpdateProspectInput = z.infer<typeof UpdateProspectSchema>;

export const CreateBidSchema = z.object({
  organization:   z.string().min(2, 'Organisation is required').max(200),
  bidType:        z.enum(BID_TYPES),
  amount:         z.coerce.number().int().min(0).optional().nullable(),
  submissionDate: z.string().datetime().optional().nullable(),
  closingDate:    z.string().datetime().optional().nullable(),
  status:         z.enum(BID_STATUS_VALUES).default('DRAFT'),
  description:    z.string().max(4000).optional().nullable(),
  requirements:   z.string().max(4000).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
  assignedToId:   z.string().min(1).optional().nullable(),
}).refine(
  (data) => !data.submissionDate || !data.closingDate ||
    new Date(data.submissionDate) <= new Date(data.closingDate),
  { message: 'Submission date cannot be after the closing date.', path: ['closingDate'] },
);
export type CreateBidInput = z.infer<typeof CreateBidSchema>;

export const UpdateBidSchema = z.object({
  organization:   z.string().min(2).max(200).optional(),
  bidType:        z.enum(BID_TYPES).optional(),
  amount:         z.coerce.number().int().min(0).optional().nullable(),
  submissionDate: z.string().datetime().optional().nullable(),
  closingDate:    z.string().datetime().optional().nullable(),
  status:         z.enum(BID_STATUS_VALUES).optional(),
  description:    z.string().max(4000).optional().nullable(),
  requirements:   z.string().max(4000).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
  lostReason:     z.string().max(500).optional().nullable(),
  assignedToId:   z.string().min(1).optional().nullable(),
}).refine(
  (data) => data.status !== 'LOST' || (data.lostReason?.trim().length ?? 0) > 0,
  { message: 'Give a reason before marking this bid as lost.', path: ['lostReason'] },
);
export type UpdateBidInput = z.infer<typeof UpdateBidSchema>;

export const CreateTargetSchema = z.object({
  assignedToId:  z.string().min(1, 'Select the officer this target belongs to'),
  period:        z.string().min(4, 'Period is required').max(20),
  periodType:    z.enum(TARGET_PERIOD_TYPES),
  targetLabel:   z.string().min(1).max(60),
  targetValue:   z.coerce.number().int().positive('Target value must be positive'),
  targetClients: z.coerce.number().int().min(0).optional().nullable(),
  targetBids:    z.coerce.number().int().min(0).optional().nullable(),
  notes:         z.string().max(1000).optional().nullable(),
});
export type CreateTargetInput = z.infer<typeof CreateTargetSchema>;

// ── Responses ──────────────────────────────────────────────────────────────────

export interface ProspectStatusHistoryEntry {
  id:         string;
  fromStatus: ProspectStatus | null;
  toStatus:   ProspectStatus;
  note:       string | null;
  changedBy:  { id: string; name: string };
  createdAt:  string;
}

export interface ProspectResponse {
  id:             string;
  companyName:    string;
  contactName:    string | null;
  contactPhone:   string | null;
  contactEmail:   string | null;
  address:        string | null;
  industry:       string | null;
  notes:          string | null;
  status:         ProspectStatus;
  estimatedValue: number | null;
  lostReason:     string | null;
  wonDate:        string | null;
  convertedClientId: string | null;
  assignedTo:     { id: string; name: string } | null;
  createdBy:      { id: string; name: string } | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ProspectWithHistory extends ProspectResponse {
  statusHistory: ProspectStatusHistoryEntry[];
}

export interface BidResponse {
  id:             string;
  organization:   string;
  bidType:        BidType;
  amount:         number | null;
  submissionDate: string | null;
  closingDate:    string | null;
  status:         BidStatus;
  description:    string | null;
  requirements:   string | null;
  notes:          string | null;
  lostReason:     string | null;
  /** Whole days from today to the closing date; null when there is no closing date. */
  daysToClosing:  number | null;
  assignedTo:     { id: string; name: string } | null;
  submittedBy:    { id: string; name: string } | null;
  createdBy:      { id: string; name: string } | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface MarketingTargetResponse {
  id:              string;
  assignedTo:      { id: string; name: string };
  period:          string;
  periodType:      TargetPeriodType;
  targetLabel:     string;
  targetValue:     number;
  targetClients:   number | null;
  targetBids:      number | null;
  achievedValue:   number;
  achievedClients: number;
  achievedBids:    number;
  /** achievedValue as a percentage of targetValue, rounded. */
  progressPct:     number;
  notes:           string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface MarketingDashboardData {
  role:  'MARKETING';
  stats: {
    totalProspects:   number;
    inPipeline:       number;
    won:              number;
    lost:             number;
    activeBids:       number;
    upcomingExpiries: number;
    targetProgress:   number | null;
    conversionRate:   number;
  };
  prospectsByStatus: { status: ProspectStatus; label: string; count: number }[];
  currentTarget:     MarketingTargetResponse | null;
  recentActivity:    (ProspectStatusHistoryEntry & { companyName: string })[];
}

/** One report is a title, column headers and rows — rendered and exported as-is. */
export interface MarketingReport {
  type:        MarketingReportType;
  title:       string;
  generatedAt: string;
  dateFrom:    string | null;
  dateTo:      string | null;
  columns:     string[];
  rows:        (string | number)[][];
  /** Figures shown above the table. */
  summary:     { label: string; value: string }[];
}
