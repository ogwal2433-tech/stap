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
  status:      'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED';
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
} as const;

export interface ComplaintDashboard {
  openByCategory:    { category: string; count: number }[];
  avgResolutionDays: number;
  totalOpen:         number;
  totalResolved:     number;
  openByClient:      { clientName: string; count: number }[];
  monthlyTrend:      { month: string; opened: number; resolved: number }[];
}
