import { z } from 'zod';

// ── Lead / CRM constants ───────────────────────────────────────────────────────

export const LEAD_SOURCES = {
  /** One of our own marketers brought them in — see MARKETER_LEAD_SOURCE. */
  MARKETER:      'Marketer',
  SOCIAL_MEDIA:  'Social Media',
  REFERRAL:      'Referral',
  COLD_CALL:     'Cold Call',
  WEBSITE:       'Website',
  WORD_OF_MOUTH: 'Word of Mouth',
  EXHIBITION:    'Exhibition / Event',
  OTHER:         'Other',
} as const;

/**
 * The one lead source that needs a name alongside it.
 *
 * Named rather than written as a bare string in each of the four places that
 * check it — the form, the resolver, the service and the reporting query — so
 * they cannot drift apart.
 */
export const MARKETER_LEAD_SOURCE = 'MARKETER';

export const LEAD_STATUSES = {
  NEW:       'New',
  CONTACTED: 'Contacted',
  CONVERTED: 'Converted',
  LOST:      'Lost',
} as const;

export type LeadSource = keyof typeof LEAD_SOURCES;
export type LeadStatus = keyof typeof LEAD_STATUSES;

// ── Contact persons ────────────────────────────────────────────────────────────

export const CONTACT_TYPES = [
  { value: 'PRIMARY',    label: 'Primary Contact',    icon: '⭐', colour: '#1B3A6B' },
  { value: 'SECONDARY',  label: 'Secondary Contact',  icon: '👤', colour: '#0F7B6C' },
  { value: 'BILLING',    label: 'Billing Contact',    icon: '💰', colour: '#1E8449' },
  { value: 'OPERATIONS', label: 'Operations Contact', icon: '📋', colour: '#E8701A' },
  { value: 'OTHER',      label: 'Other',              icon: '➕', colour: '#6c757d' },
] as const;

export const CONTACT_TYPE_VALUES = CONTACT_TYPES.map((t) => t.value) as
  [ContactType, ...ContactType[]];

export type ContactType = (typeof CONTACT_TYPES)[number]['value'];

/** Falls back to Other so a retired type still renders rather than blanking. */
export const contactTypeConfig = (value: string) =>
  CONTACT_TYPES.find((t) => t.value === value) ?? CONTACT_TYPES[CONTACT_TYPES.length - 1];

/**
 * An empty string is what a blank <input> submits, and it has to be accepted
 * before .email() sees it — z.string().email().optional() rejects '' because ''
 * is not undefined. That is why an "optional" email field could not be left
 * blank. The service normalises '' to null on the way in.
 */
const OptionalEmail = z.union([z.literal(''), z.string().email('Invalid email address')])
  .optional()
  .nullable();

export const ClientContactSchema = z.object({
  contactType: z.enum(CONTACT_TYPE_VALUES).default('PRIMARY'),
  name:        z.string().min(1, 'Contact name is required').max(100),
  phone:       z.string().max(20).optional().nullable(),
  email:       OptionalEmail,
  jobTitle:    z.string().max(100).optional().nullable(),
  isPrimary:   z.boolean().default(false),
  notes:       z.string().max(500).optional().nullable(),
});

export type ClientContactInput = z.input<typeof ClientContactSchema>;

export interface ClientContactResponse {
  id:          string;
  clientId:    string;
  contactType: ContactType;
  name:        string;
  phone:       string | null;
  email:       string | null;
  jobTitle:    string | null;
  isPrimary:   boolean;
  notes:       string | null;
  createdAt:   string;
  updatedAt:   string;
}

// ── Client schemas ─────────────────────────────────────────────────────────────

const _BaseClientSchema = z.object({
  clientName:     z.string().min(1).max(200),
  /**
   * The denormalised primary contact. Optional now that contacts[] can carry it
   * — the refine below requires one route or the other, because the column is
   * NOT NULL and invoices read it.
   */
  contactPerson:  z.string().min(1).max(100).optional(),
  contactPhone:   z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number').optional(),
  email:          OptionalEmail,
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
  /**
   * An unselected <select> submits '', which .optional() does not treat as
   * absent — so leaving Lead Source alone rejected the whole form with an enum
   * error pointing at a field the user never touched. Accepting '' alongside
   * the enum is the same shape as OptionalEmail above; the service stores it as
   * null.
   */
  leadSource: z.union([
    z.literal(''),
    z.enum([
      'MARKETER', 'SOCIAL_MEDIA', 'REFERRAL', 'COLD_CALL', 'WEBSITE',
      'WORD_OF_MOUTH', 'EXHIBITION', 'OTHER',
    ]),
  ]).optional(),
  referredBy: z.string().max(200).optional(),
  /**
   * Who brought them in, when the source is MARKETER. Required in that case and
   * ignored otherwise — the rule lives in requireMarketerName() below, because
   * it spans two fields and cannot be expressed on this one.
   */
  marketerName: z.string().max(100).optional(),
  leadStatus: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'LOST']).default('CONVERTED'),

  /** Every contact person at this client. The first is primary if none is marked. */
  contacts: z.array(ClientContactSchema).optional(),

  /**
   * Optional portal login, set up in the same save as the client itself.
   * Omitted — the usual case — the company simply has no portal.
   */
  portal: z.object({
    email:       z.string().email().transform((e) => e.trim().toLowerCase()),
    password:    z.string().min(8, 'A temporary password needs at least 8 characters').max(128),
    contactName: z.string().min(2, 'Name the person who will use this login').max(100),
  }).optional(),
});

/** At most one contact may be flagged primary — two primaries has no meaning. */
const singlePrimary = (contacts: ClientContactInput[] | undefined) =>
  (contacts ?? []).filter((c) => c.isPrimary).length <= 1;

/**
 * A marketer-sourced client has to say which marketer.
 *
 * Spans two fields, so it cannot live on either one, and it is applied to the
 * create, update and form schemas alike — the form is what people actually hit,
 * and the other two are what stops a direct API call writing a MARKETER row
 * that names nobody.
 *
 * Only fires when leadSource is explicitly MARKETER in the payload: a partial
 * update that touches neither field must not be rejected for a rule about
 * fields it never sent.
 */
const requireMarketerName = <T extends { leadSource?: string; marketerName?: string | null }>(
  d: T,
): boolean => d.leadSource !== MARKETER_LEAD_SOURCE || !!d.marketerName?.trim();

const MARKETER_NAME_REQUIRED = {
  message: 'Enter the name of the marketer who brought this client in.',
  path:    ['marketerName'],
};

export const CreateClientSchema = _BaseClientSchema
  .refine(
    (d) => !!d.contactPerson?.trim() || (d.contacts ?? []).some((c) => c.name?.trim()),
    { message: 'At least one contact person is required.', path: ['contacts'] },
  )
  .refine((d) => singlePrimary(d.contacts), {
    message: 'Only one contact can be the primary contact.',
    path:    ['contacts'],
  })
  .refine(requireMarketerName, MARKETER_NAME_REQUIRED);

/**
 * Partial() cannot be called on the refined schema — .refine returns a
 * ZodEffects, which has no .partial(). The base object is partialled and the
 * primary-contact rule reapplied; the "must have a contact" rule is deliberately
 * not reapplied, because an update that touches only the billing terms should
 * not have to resend the contacts.
 */
export const UpdateClientSchema = _BaseClientSchema.partial()
  .refine((d) => singlePrimary(d.contacts), {
    message: 'Only one contact can be the primary contact.',
    path:    ['contacts'],
  })
  .refine(requireMarketerName, MARKETER_NAME_REQUIRED);

/**
 * What the client form's own resolver validates.
 *
 * Contacts are held in their own state on the form and merged in on submit, so
 * the resolver must not judge a `contacts` field it never sees: the "at least
 * one contact" refine would fail every submission with an error attached to no
 * visible input, and the form would sit there doing nothing. The form checks its
 * own contact list, and the server still enforces the full CreateClientSchema.
 */
export const ClientFormSchema = _BaseClientSchema
  .omit({ contacts: true })
  // Same rule the API enforces, so the message appears under the field as the
  // form is filled in rather than coming back as a 400 after submit.
  .refine(requireMarketerName, MARKETER_NAME_REQUIRED);
export type ClientFormInput = z.input<typeof ClientFormSchema>;

export const ClientListQuerySchema = z.object({
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().min(1).max(500).default(20),
  search:         z.string().optional(),
  contractStatus: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  /**
   * Narrows to clients by the state of their contracts, which is not the same
   * as contractStatus above: that is a field on the client record, this is
   * derived from the contracts themselves.
   */
  contractFilter: z.enum(['expiring', 'expired']).optional(),
  leadStatus:     z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'LOST']).optional(),
  sortBy:         z.enum(['clientName', 'createdAt', 'billingTerms']).default('clientName'),
  sortOrder:      z.enum(['asc', 'desc']).default('asc'),
});

// ── Site type constant ─────────────────────────────────────────────────────────

export const SITE_TYPES = {
  TEMPORARY:     'Temporary',
  SPECIAL_DUTIES:'Special Duties',
  PERMANENT:     'Permanent',
} as const;

/** Fallback for sites whose stored type is absent or no longer recognised. */
export const DEFAULT_SITE_TYPE = 'PERMANENT';

export const SITE_TYPE_VALUES = Object.keys(SITE_TYPES) as [SiteType, ...SiteType[]];

export type SiteType = keyof typeof SITE_TYPES;

/**
 * Accepted site types. This is an enum rather than a free string so a retired
 * value (such as the removed "REGULAR") cannot be written back through the API
 * after being taken out of the UI.
 */
export const SiteTypeSchema = z.enum(SITE_TYPE_VALUES);

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
  siteType:             SiteTypeSchema.optional(),
  armedGuardsRequired:  z.coerce.number().int().min(0).default(0),
  firearmsRequired:     z.coerce.number().int().min(0).default(0),
  batonRequired:        z.coerce.number().int().min(0).default(0),
  otherWeaponsNotes:    z.string().max(500).optional().nullable(),
  equipmentDetails:     z.string().max(1000).optional(),
  allowedShiftTypes:    z.array(z.string()).optional(),
  /** Pre-selected shift for this site on the deployment sheet. */
  defaultShiftType:     z.string().optional().nullable(),
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
  /** Set only when leadSource is MARKETER. */
  marketerName: string | null;
  referredBy: string | null;
  leadStatus: LeadStatus;

  contacts: ClientContactResponse[];

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

/**
 * What a client is being billed and what they still owe.
 *
 * Amounts are whole shillings, as everywhere else in this system — UGX has no
 * subunit in practice, and integers keep sums exact.
 */
export interface BillingSummary {
  /** Sum of the monthly value of contracts in force. */
  totalMonthlyBilling: number;
  activeContractCount: number;
  totalGuardsDeployed: number;
  activeContracts: {
    id:             string;
    guardsRequired: number;
    monthlyValue:   number;
    status:         string;
    contractEnd:    string;
  }[];

  /** Unsettled across every invoice that is not PAID. */
  totalOutstanding:        number;
  outstandingInvoiceCount: number;
  /** The part of the above that is past its due date. */
  totalOverdue:            number;
  overdueCount:            number;

  /** Most recent money actually received, manual or mobile money. */
  lastPayment: { amount: number; paidAt: string } | null;
}

export interface ClientSummary {
  totalActive: number;
  totalInactive: number;
  expiringContracts: number;
  /** Contracts already past their end date and not yet renewed or closed. */
  expiredContracts: number;
  openComplaints: number;
}
