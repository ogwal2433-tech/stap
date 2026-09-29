import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const CreateComplaintSchema = z.object({
  clientId:    z.string().min(1, 'Please select a client'),
  siteId:      z.string().min(1).optional(),
  subject:     z.string().min(1, 'Subject is required').max(200),
  category:    z.enum(['GUARD_CONDUCT', 'LATE_DEPLOYMENT', 'BILLING_DISPUTE', 'EQUIPMENT', 'OTHER']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  severity:    z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type CreateComplaintInput = z.infer<typeof CreateComplaintSchema>;

export const AssignComplaintSchema = z.object({
  receivedById: z.string().min(1, 'Select who received the complaint'),
  assignedToId: z.string().min(1, 'Select who to assign the complaint to'),
});
export type AssignComplaintInput = z.infer<typeof AssignComplaintSchema>;

/** Minimum length of an action note — enough to rule out "ok" and "done". */
export const MIN_ACTION_TAKEN_LENGTH = 5;

export const UpdateComplaintStatusSchema = z.object({
  status:      z.enum(['UNDER_INVESTIGATION', 'RESOLVED']),
  /** What was done about it. Required to resolve; ignored otherwise. */
  actionTaken: z.string().max(2000).optional().nullable(),
  /** Optional extra context, stored on the existing `resolution` column. */
  resolution:  z.string().max(2000).optional().nullable(),
}).refine(
  (data) =>
    data.status !== 'RESOLVED' ||
    (data.actionTaken?.trim().length ?? 0) >= MIN_ACTION_TAKEN_LENGTH,
  {
    message: 'You must describe the action taken before marking this complaint as Resolved.',
    path: ['actionTaken'],
  },
);
export type UpdateComplaintStatusInput = z.infer<typeof UpdateComplaintStatusSchema>;

// ── Outbound notices (Security360 → client) ───────────────────────────────────────────

export const COMPLAINT_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type ComplaintDirection = (typeof COMPLAINT_DIRECTIONS)[number];

/**
 * A formal notice from Security360 to a client.
 *
 * `priority` is stored on the existing `severity` column — the two share the
 * same LOW/MEDIUM/HIGH scale, and a second column would only ever disagree with
 * the first. `category` is optional because most notices are administrative;
 * it defaults to OTHER but a billing notice can still be filed as such.
 */
export const CreateOutboundComplaintSchema = z.object({
  clientId:    z.string().min(1, 'Select a client'),
  subject:     z.string().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().min(10, 'The notice must be at least 10 characters').max(5000),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  category:    z.enum(['GUARD_CONDUCT', 'LATE_DEPLOYMENT', 'BILLING_DISPUTE', 'EQUIPMENT', 'OTHER'])
                 .default('OTHER'),
  siteId:      z.string().min(1).optional(),
});
export type CreateOutboundComplaintInput = z.infer<typeof CreateOutboundComplaintSchema>;

export const AcknowledgeNoticeSchema = z.object({
  /** The client's optional reply. Acknowledging without comment is normal. */
  clientResponse: z.string().max(2000).optional().nullable(),
});
export type AcknowledgeNoticeInput = z.infer<typeof AcknowledgeNoticeSchema>;

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface ComplaintResponse {
  id:          string;
  clientId:    string;
  client:      { id: string; clientName: string; systemId: string | null };
  site:        { id: string; siteName: string } | null;
  subject:     string;
  category:    string;
  description: string;
  severity:    'LOW' | 'MEDIUM' | 'HIGH';
  /** SENT and ACKNOWLEDGED only ever appear on OUTBOUND notices. */
  status:      'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'SENT' | 'ACKNOWLEDGED';
  receivedBy:  { id: string; name: string } | null;
  assignedTo:  {
    id:    string;
    name:  string;
    title: string;
    phone: string;
  } | null;
  assignedAt:  string | null;
  resolution:  string | null;
  /** What was done to resolve it — set before the status can become RESOLVED. */
  actionTaken:   string | null;
  actionTakenAt: string | null;
  actionTakenBy: { id: string; name: string } | null;
  resolvedAt:  string | null;
  resolvedBy:  string | null;
  createdAt:   string;
  updatedAt:   string;
  daysOpen:    number;

  // ── Direction ────────────────────────────────────────────────────────────────
  /** INBOUND = client → Security360. OUTBOUND = Security360 → client. */
  direction:   ComplaintDirection;
  /** Outbound only — who sent the notice, and when. */
  sentBy:      { id: string; name: string } | null;
  sentAt:      string | null;
  /** Outbound only — null until the client confirms receipt. */
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  clientResponse: string | null;
}

// ── Badge colour helpers ────────────────────────────────────────────────────────

export const COMPLAINT_SEVERITY_COLORS = {
  LOW:    'success',
  MEDIUM: 'warning',
  HIGH:   'danger',
} as const;

export const COMPLAINT_STATUS_COLORS = {
  OPEN:                'secondary',
  UNDER_INVESTIGATION: 'warning',
  RESOLVED:            'success',
  // Outbound notices
  SENT:                'primary',
  ACKNOWLEDGED:        'info',
} as const;

/** Reads as a sentence in the UI, where the raw enum name would not. */
export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  OPEN:                'Open',
  IN_PROGRESS:         'In Progress',
  UNDER_INVESTIGATION: 'Under Investigation',
  RESOLVED:            'Resolved',
  SENT:                'Awaiting Acknowledgement',
  ACKNOWLEDGED:        'Acknowledged',
};

export interface ComplaintDashboard {
  openByCategory:    { category: string; count: number }[];
  avgResolutionDays: number;
  totalOpen:         number;
  totalResolved:     number;
  openByClient:      { clientName: string; count: number }[];
  monthlyTrend:      { month: string; opened: number; resolved: number }[];
}
