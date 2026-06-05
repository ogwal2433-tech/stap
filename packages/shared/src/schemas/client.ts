import { z } from 'zod';

// ── Lead / CRM constants ───────────────────────────────────────────────────────

export const LEAD_SOURCES = {
  SOCIAL_MEDIA:  'Social Media',
  REFERRAL:      'Referral',
  COLD_CALL:     'Cold Call',
  WEBSITE:       'Website',
  WORD_OF_MOUTH: 'Word of Mouth',
  EXHIBITION:    'Exhibition / Event',
  OTHER:         'Other',
} as const;

export const LEAD_STATUSES = {
  NEW:       'New',
  CONTACTED: 'Contacted',
  CONVERTED: 'Converted',
  LOST:      'Lost',
} as const;

export type LeadSource = keyof typeof LEAD_SOURCES;
export type LeadStatus = keyof typeof LEAD_STATUSES;

// ── Client schemas ─────────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  clientName:     z.string().min(1).max(200),
  contactPerson:  z.string().min(1).max(100),
  contactPhone:   z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  email:          z.string().email().optional(),
  physicalAddress: z.string().min(1).max(500),
  billingAddress: z.string().max(500).optional(),
  billingTerms: z
    .coerce.number()
    .int()
    .min(1)
    .max(90)
    .describe('Payment due in X days'),
  contractStatus: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).default('ACTIVE'),

  // Tax & compliance
  tin:          z.string().max(50).optional(),
  vatRegistered: z.boolean().default(false),
  vatRate:       z.coerce.number().min(0).max(100).optional(),

  // CRM / lead tracking
  leadSource: z.enum([
    'SOCIAL_MEDIA', 'REFERRAL', 'COLD_CALL', 'WEBSITE',
    'WORD_OF_MOUTH', 'EXHIBITION', 'OTHER',
  ]).optional(),
  referredBy: z.string().max(200).optional(),
  leadStatus: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'LOST']).default('CONVERTED'),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export const ClientListQuerySchema = z.object({
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().min(1).max(500).default(20),
  search:         z.string().optional(),
  contractStatus: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  leadStatus:     z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'LOST']).optional(),
  sortBy:         z.enum(['clientName', 'createdAt', 'billingTerms']).default('clientName'),
  sortOrder:      z.enum(['asc', 'desc']).default('asc'),
});

// ── Site type constant ─────────────────────────────────────────────────────────

export const SITE_TYPES = {
  REGULAR:       'Regular',
  TEMPORARY:     'Temporary',
  SPECIAL_DUTIES:'Special Duties',
  PERMANENT:     'Permanent',
} as const;

// ── Site schemas ───────────────────────────────────────────────────────────────

const _BaseSiteSchema = z.object({
  clientId:             z.string().min(1),
  siteName:             z.string().min(1).max(200),
  location:             z.string().min(1).max(500),
  gpsLat:               z.number().min(-90).max(90).optional(),
  gpsLon:               z.number().min(-180).max(180).optional(),
  siteManagerName:      z.string().max(100).optional(),
  siteManagerContact:   z.string().optional(),
  specialInstructions:  z.string().max(1000).optional(),
  guardsRequired:       z.number().int().min(1).default(1),
  zoneId:               z.string().nullable().optional(),
  siteType:             z.string().optional(),
  armedGuardsRequired:  z.coerce.number().int().min(0).default(0),
  firearmsRequired:     z.coerce.number().int().min(0).default(0),
  batonRequired:        z.coerce.number().int().min(0).default(0),
  otherWeaponsNotes:    z.string().max(500).optional().nullable(),
  equipmentDetails:     z.string().max(1000).optional(),
  allowedShiftTypes:    z.array(z.string()).optional(),
  equipmentItems: z.array(z.object({
    itemName: z.string().min(1),
    quantity: z.number().int().min(1).default(1),
    notes:    z.string().optional(),
  })).optional(),
  sitePeriodStart: z.string().datetime().optional().nullable(),
  sitePeriodEnd:   z.string().datetime().optional().nullable(),
  sitePeriodNotes:     z.string().max(500).optional().nullable(),
});

export const CreateSiteInputSchema = _BaseSiteSchema;

export const CreateSiteSchema = _BaseSiteSchema
  .refine(
    (data) => !(data.firearmsRequired > 0 && data.armedGuardsRequired === 0),
    {
      message: 'If firearms are required, at least one armed guard must also be specified.',
      path: ['armedGuardsRequired'],
    },
  )
  .refine(
    (data) => {
      if (['TEMPORARY', 'SPECIAL_DUTIES'].includes(data.siteType ?? '')) {
        return !!data.sitePeriodStart && !!data.sitePeriodEnd;
      }
      return true;
    },
    {
      message: 'Temporary and Special Duties sites must have a start and end date.',
      path: ['sitePeriodStart'],
    },
  )
  .refine(
    (data) => {
      if (data.sitePeriodStart && data.sitePeriodEnd) {
        return new Date(data.sitePeriodEnd) >= new Date(data.sitePeriodStart);
      }
      return true;
    },
    {
      message: 'Period end date must be on or after the start date.',
      path: ['sitePeriodEnd'],
    },
  );

export const UpdateSiteSchema = _BaseSiteSchema.omit({ clientId: true }).partial()
  .refine(
    (data) => {
      if (['TEMPORARY', 'SPECIAL_DUTIES'].includes(data.siteType ?? '')) {
        return !!data.sitePeriodStart && !!data.sitePeriodEnd;
      }
      return true;
    },
    {
      message: 'Temporary and Special Duties sites must have a start and end date.',
      path: ['sitePeriodStart'],
    },
  )
  .refine(
    (data) => {
      if (data.sitePeriodStart && data.sitePeriodEnd) {
        return new Date(data.sitePeriodEnd) >= new Date(data.sitePeriodStart);
      }
      return true;
    },
    {
      message: 'Period end date must be on or after the start date.',
      path: ['sitePeriodEnd'],
    },
  );

// ── Incident schema ────────────────────────────────────────────────────────────

export const CreateIncidentSchema = z.object({
  siteId: z.string().min(1),
  guardIds: z.array(z.string().min(1)).optional(),
  incidentType: z.enum([
    'GUARD_MISCONDUCT',
    'SECURITY_BREACH',
    'THEFT',
    'ASSAULT',
    'PROPERTY_DAMAGE',
    'UNAUTHORIZED_ACCESS',
    'ABSENTEEISM',
    'INSUBORDINATION',
    'OTHER',
  ]),
  description: z.string().min(10).max(2000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  occurredAt: z.string().datetime(),
  supervisorCheckinId: z.string().min(1).optional(),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateClientInput = z.input<typeof CreateClientSchema>;
export type UpdateClientInput = z.input<typeof UpdateClientSchema>;
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;
export type CreateSiteInput = z.input<typeof _BaseSiteSchema>;
export type UpdateSiteInput = Partial<Omit<CreateSiteInput, 'clientId'>>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface ClientResponse {
  id:       string;
  systemId: string | null;
  clientName: string;
  contactPerson: string;
  contactPhone: string;
  email: string | null;
  physicalAddress: string;
  billingAddress: string | null;
  billingTerms: number;
  contractStatus: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

  // Tax & compliance
  tin: string | null;
  vatRegistered: boolean;
  vatRate: number | null;

  // CRM / lead tracking
  leadSource: LeadSource | null;
  referredBy: string | null;
  leadStatus: LeadStatus;

  createdAt: string;
  updatedAt: string;
  _count?: {
    sites: number;
    contracts: number;
    clientComplaints: number;
    invoices?: number;
  };
}

export interface SiteResponse {
  id: string;
  clientId: string;
  clientName: string;
  siteName: string;
  location: string;
  gpsLat: number | null;
  gpsLon: number | null;
  siteManagerName: string | null;
  siteManagerContact: string | null;
  specialInstructions: string | null;
  guardsRequired: number;

  // Classification
  siteType: string;

  // Site period (set for TEMPORARY and SPECIAL_DUTIES)
  sitePeriodStart: string | null;
  sitePeriodEnd:   string | null;
  sitePeriodNotes: string | null;
  periodDays:      number | null;
  hasPeriod:       boolean;

  // Security requirements (quantities)
  armedGuardsRequired: number;
  firearmsRequired:    number;
  batonRequired:       number;
  otherWeaponsNotes:   string | null;
  isArmed:             boolean;
  equipmentDetails:    string | null;

  // Shift configuration
  allowedShiftTypes: string[];
  /** @deprecated No longer collected. Will be null for all new sites. */
  defaultShiftType?: string | null;

  // Structured equipment
  equipmentItems: {
    id: string;
    itemName: string;
    quantity: number;
    notes: string | null;
  }[];

  // Zone assignment
  zone?: { id: string; name: string } | null;

  createdAt: string;
  updatedAt: string;
  _count?: {
    deployments: number;
    attendanceRecords: number;
    incidents: number;
  };
}

export interface IncidentResponse {
  id: string;
  site: { id: string; siteName: string };
  client: { id: string; clientName: string };
  guards: { id: string; fullName: string }[];
  incidentType: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  occurredAt: string;
  reportedBy: { id: string; name: string };
  createdAt: string;
}

export interface ClientSummary {
  totalActive: number;
  totalInactive: number;
  expiringContracts: number;
  openComplaints: number;
}
