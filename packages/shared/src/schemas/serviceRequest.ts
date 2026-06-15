import { z } from 'zod';

export const SERVICE_REQUEST_TYPES = {
  SITE_ADDITION:  'Site Addition',
  GUARD_CHANGE:   'Guard Change / Replacement',
  BILLING_QUERY:  'Billing Query',
  SCHEDULE_CHANGE:'Schedule Change',
  OTHER:          'Other',
} as const;

export type ServiceRequestType = keyof typeof SERVICE_REQUEST_TYPES;

export const CreateServiceRequestSchema = z.object({
  clientId:    z.string().min(1),
  siteId:      z.string().min(1).optional(),
  type:        z.enum(['SITE_ADDITION', 'GUARD_CHANGE', 'BILLING_QUERY', 'SCHEDULE_CHANGE', 'OTHER']).default('OTHER'),
  subject:     z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
  priority:    z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;

export const UpdateServiceRequestSchema = z.object({
  status:     z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED']).optional(),
  resolution: z.string().min(10).optional(),
  resolvedBy: z.string().optional(),
}).refine(
  data => data.status !== 'RESOLVED' || !!data.resolution,
  { message: 'Resolution notes required when resolving a request' },
);
export type UpdateServiceRequestInput = z.infer<typeof UpdateServiceRequestSchema>;

export interface ServiceRequestResponse {
  id:          string;
  clientId:    string;
  clientName:  string;
  siteId:      string | null;
  siteName:    string | null;
  type:        string;
  subject:     string;
  description: string;
  status:      string;
  priority:    string;
  resolvedBy:  string | null;
  resolvedAt:  string | null;
  resolution:  string | null;
  createdBy:   string;
  createdAt:   string;
  updatedAt:   string;
}

export const SERVICE_REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING:     'warning',
  IN_PROGRESS: 'info',
  RESOLVED:    'success',
  CANCELLED:   'secondary',
};

export const SERVICE_REQUEST_PRIORITY_COLORS: Record<string, string> = {
  LOW:    'secondary',
  NORMAL: 'primary',
  HIGH:   'warning',
  URGENT: 'danger',
};
