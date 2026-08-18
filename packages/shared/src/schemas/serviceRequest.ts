import { z } from 'zod';

export const SERVICE_REQUEST_TYPES = {
  MORE_GUARDS:    'More Guards',
  FEWER_GUARDS:   'Fewer Guards',
  EQUIPMENT:      'Equipment Request',
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
  type:        z.enum(['MORE_GUARDS', 'FEWER_GUARDS', 'EQUIPMENT', 'SITE_ADDITION', 'GUARD_CHANGE', 'BILLING_QUERY', 'SCHEDULE_CHANGE', 'OTHER']).default('OTHER'),
  subject:     z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
  quantity:    z.coerce.number().int().min(1).optional(),
  priority:    z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;

// ── Staff handling ─────────────────────────────────────────────────────────────

/** The four states a request moves through, in the order staff work them. */
export const SR_STATUSES = [
  { value: 'PENDING',     label: '⏳ Pending',     colour: 'warning' },
  { value: 'IN_PROGRESS', label: '🔄 In Progress', colour: 'primary' },
  { value: 'COMPLETED',   label: '✅ Completed',   colour: 'success' },
  { value: 'REJECTED',    label: '❌ Rejected',    colour: 'danger'  },
] as const;

export const SR_STATUS_VALUES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;
export type ServiceRequestStatus = (typeof SR_STATUS_VALUES)[number];

/** Statuses that close a request — nothing can be changed afterwards. */
export const SR_TERMINAL_STATUSES: ServiceRequestStatus[] = ['COMPLETED', 'REJECTED'];

export const UpdateServiceRequestSchema = z.object({
  status: z.enum(SR_STATUS_VALUES),
  /** Sent to the client and shown in their portal. */
  staffResponse: z.string().max(2000).optional().nullable(),
  /** Internal only — never returned to a client. */
  staffNotes:    z.string().max(2000).optional().nullable(),
}).refine(
  // Closing a request without telling the client why is how a service channel
  // loses their trust, so the response is mandatory at that point.
  (data) => !SR_TERMINAL_STATUSES.includes(data.status) || !!data.staffResponse?.trim(),
  {
    message: 'Please write a response to the client when completing or rejecting a service request.',
    path: ['staffResponse'],
  },
);
export type UpdateServiceRequestInput = z.infer<typeof UpdateServiceRequestSchema>;

export interface ServiceRequestPersonRef {
  id:   string;
  name: string;
}

export interface ServiceRequestResponse {
  id:          string;
  clientId:    string;
  clientName:  string;
  clientSystemId: string | null;
  siteId:      string | null;
  siteName:    string | null;
  type:        string;
  subject:     string;
  description: string;
  quantity:    number | null;
  status:      string;
  priority:    string;
  /** STAP's reply to the client. */
  staffResponse: string | null;
  /**
   * Internal notes. Present only on staff responses — the portal strips this
   * so a client can never read it.
   */
  staffNotes?:   string | null;
  respondedBy: ServiceRequestPersonRef | null;
  respondedAt: string | null;
  /** The client-side user who raised it. */
  requestedBy: ServiceRequestPersonRef | null;
  createdBy:   string;
  createdAt:   string;
  updatedAt:   string;
}

export interface ServiceRequestSummary {
  pending:    number;
  inProgress: number;
  completed:  number;
  rejected:   number;
  total:      number;
}

export const SERVICE_REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING:     'warning',
  IN_PROGRESS: 'primary',
  COMPLETED:   'success',
  REJECTED:    'danger',
};

export const SERVICE_REQUEST_PRIORITY_COLORS: Record<string, string> = {
  LOW:    'secondary',
  NORMAL: 'primary',
  HIGH:   'warning',
  URGENT: 'danger',
};
