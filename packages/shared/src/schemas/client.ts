import { z } from 'zod';

// ── Client schemas ─────────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  clientName: z.string().min(1).max(200),
  contactPerson: z.string().min(1).max(100),
  contactPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  email: z.string().email().optional(),
  physicalAddress: z.string().min(1).max(500),
  billingAddress: z.string().max(500).optional(),
  billingTerms: z
    .coerce.number()
    .int()
    .min(1)
    .max(90)
    .describe('Payment due in X days'),
  contractStatus: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).default('ACTIVE'),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export const ClientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  contractStatus: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  sortBy: z
    .enum(['clientName', 'createdAt', 'billingTerms'])
    .default('clientName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ── Site type constant ─────────────────────────────────────────────────────────

export const SITE_TYPES = {
  REGULAR:       'Regular',
  TEMPORARY:     'Temporary',
  SPECIAL_DUTIES:'Special Duties',
  PERMANENT:     'Permanent',
} as const;

// ── Site schemas ───────────────────────────────────────────────────────────────

export const CreateSiteSchema = z.object({
  clientId:            z.string().min(1),
  siteName:            z.string().min(1).max(200),
  location:            z.string().min(1).max(500),
  gpsLat:              z.number().min(-90).max(90).optional(),
  gpsLon:              z.number().min(-180).max(180).optional(),
  siteManagerName:     z.string().max(100).optional(),
  siteManagerContact:  z.string().optional(),
  specialInstructions: z.string().max(2000).optional(),
  guardsRequired:      z.number().int().min(1).default(1),

  // Classification
  siteType: z.enum(['REGULAR', 'TEMPORARY', 'SPECIAL_DUTIES', 'PERMANENT']).default('REGULAR'),

  // Security requirements
  requiresFirearms:    z.boolean().default(false),
  requiresArmedGuards: z.boolean().default(false),
  requiresWeapons:     z.boolean().default(false),
  equipmentDetails:    z.string().max(1000).optional(),

  // Shift configuration
  allowedShiftTypes: z.array(z.string()).default([]),
  defaultShiftType:  z.string().optional(),

  // Structured equipment list
  equipmentItems: z.array(z.object({
    itemName: z.string().min(1).max(200),
    quantity: z.coerce.number().int().min(1).default(1),
    notes:    z.string().max(500).optional(),
  })).default([]),
});

export const UpdateSiteSchema = CreateSiteSchema.omit({ clientId: true }).partial();

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

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface ClientResponse {
  id: string;
  clientName: string;
  contactPerson: string;
  contactPhone: string;
  email: string | null;
  physicalAddress: string;
  billingAddress: string | null;
  billingTerms: number;
  contractStatus: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
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

  // Security requirements
  requiresFirearms: boolean;
  requiresArmedGuards: boolean;
  requiresWeapons: boolean;
  equipmentDetails: string | null;

  // Shift configuration
  allowedShiftTypes: string[];
  defaultShiftType: string | null;

  // Structured equipment
  equipmentItems: {
    id: string;
    itemName: string;
    quantity: number;
    notes: string | null;
  }[];

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
