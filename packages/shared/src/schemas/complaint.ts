import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const CreateComplaintSchema = z.object({
  clientId:    z.string().cuid(),
  siteId:      z.string().cuid().optional(),
  category:    z.enum(['GUARD_CONDUCT', 'LATE_DEPLOYMENT', 'BILLING_DISPUTE', 'EQUIPMENT', 'OTHER']),
  description: z.string().min(10).max(2000),
  severity:    z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type CreateComplaintInput = z.infer<typeof CreateComplaintSchema>;

export const UpdateComplaintSchema = z.object({
  assignedTo: z.string().cuid().optional(),
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
  client:      { id: string; clientName: string };
  site:        { id: string; siteName: string } | null;
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

export interface ComplaintDashboard {
  openByCategory:    { category: string; count: number }[];
  avgResolutionDays: number;
  totalOpen:         number;
  totalResolved:     number;
  openByClient:      { clientName: string; count: number }[];
  monthlyTrend:      { month: string; opened: number; resolved: number }[];
}
