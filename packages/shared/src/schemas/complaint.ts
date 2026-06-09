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

export const UpdateComplaintSchema = z.object({
  assignedTo: z.string().min(1).optional(),
  status:     z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  resolution: z.string().min(10).optional(),
}).refine(
  data => data.status !== 'RESOLVED' || !!data.resolution,
  { message: 'Resolution notes required when resolving a complaint' },
);
export type UpdateComplaintInput = z.infer<typeof UpdateComplaintSchema>;

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
  status:      'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assignedTo:  { id: string; name: string } | null;
  resolution:  string | null;
  resolvedAt:  string | null;
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
  OPEN:        'danger',
  IN_PROGRESS: 'warning',
  RESOLVED:    'success',
} as const;

export interface ComplaintDashboard {
  openByCategory:    { category: string; count: number }[];
  avgResolutionDays: number;
  totalOpen:         number;
  totalResolved:     number;
  openByClient:      { clientName: string; count: number }[];
  monthlyTrend:      { month: string; opened: number; resolved: number }[];
}
