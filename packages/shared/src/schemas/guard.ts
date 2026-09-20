import { z } from 'zod';

// ── Salary increment rules ─────────────────────────────────────────────────────

export const SALARY_INCREMENT_RULES = {
  firstYearIncrement:      20000,
  subsequentYearIncrement: 10000,
  incrementIntervalMonths: 12,
} as const;

// ── Employment status ──────────────────────────────────────────────────────────

/**
 * Guard employment statuses, in lifecycle order. `deployable` is the single
 * source of truth for whether a guard can be put on a roster — it replaced the
 * `Guard.onLeave` boolean, which nothing ever wrote.
 */
export const GUARD_STATUS_CONFIG = {
  ACTIVE: {
    label:       'Active',
    colour:      'success',
    deployable:  true,
    /** Still on the payroll run. */
    paid:        true,
    description: 'Guard is currently on duty and available for deployment.',
  },
  ON_LEAVE: {
    label:       'On Leave',
    colour:      'info',
    deployable:  false,
    paid:        true,
    description: 'Guard is temporarily on leave and cannot be deployed until they return.',
  },
  SUSPENDED: {
    label:       'Suspended',
    colour:      'warning',
    deployable:  false,
    paid:        false,
    description: 'Guard is under suspension and cannot be deployed.',
  },
  RESIGNED: {
    label:       'Resigned',
    colour:      'secondary',
    deployable:  false,
    paid:        false,
    description: 'Guard has voluntarily resigned and is no longer employed.',
  },
  TERMINATED: {
    label:       'Terminated',
    colour:      'danger',
    deployable:  false,
    paid:        false,
    description: 'Guard employment has been terminated.',
  },
} as const;

export type GuardEmploymentStatus = keyof typeof GUARD_STATUS_CONFIG;

export const GUARD_STATUS_VALUES = Object.keys(GUARD_STATUS_CONFIG) as [
  GuardEmploymentStatus,
  ...GuardEmploymentStatus[],
];

export const GuardEmploymentStatusSchema = z.enum(GUARD_STATUS_VALUES);

/** Statuses a guard can be rostered or deployed under. */
export const DEPLOYABLE_STATUSES = GUARD_STATUS_VALUES.filter(
  s => GUARD_STATUS_CONFIG[s].deployable,
);

/** Statuses still drawing a salary — ON_LEAVE guards remain on the payroll run. */
export const PAID_STATUSES = GUARD_STATUS_VALUES.filter(s => GUARD_STATUS_CONFIG[s].paid);

/** Statuses that end employment. A guard here cannot be promoted or transferred. */
export const EXITED_STATUSES: GuardEmploymentStatus[] = ['RESIGNED', 'TERMINATED'];

export function guardStatusLabel(status: string): string {
  return GUARD_STATUS_CONFIG[status as GuardEmploymentStatus]?.label ?? status;
}

// ── Input schemas (Zod) ────────────────────────────────────────────────────────

/**
 * How a guard is identified.
 *
 * Not everyone holds a national ID. A guard may be vouched for by a relative's
 * card, or by an academic or church document, and refusing those meant turning
 * away people who could otherwise work.
 */
export const GUARD_ID_TYPES = [
  {
    value:       'OWN_ID',
    label:       'Own National ID',
    description: 'The guard holds their own national ID card',
    icon:        '\u{1FAAA}',
    colour:      '#1B3A6B',
  },
  {
    value:       'RELATIVE_ID',
    label:       "Relative's National ID",
    description: "Identified by a family member's national ID card",
    icon:        '\u{1F46A}',
    colour:      '#0F7B6C',
  },
  {
    value:       'OTHER_DOCUMENT',
    label:       'Other / Academic Document',
    description: 'A student card, baptism certificate, passport or similar',
    icon:        '\u{1F4C4}',
    colour:      '#E8701A',
  },
] as const;

export const GUARD_ID_TYPE_VALUES = ['OWN_ID', 'RELATIVE_ID', 'OTHER_DOCUMENT'] as const;
export type GuardIdType = (typeof GUARD_ID_TYPE_VALUES)[number];

export const guardIdTypeConfig = (value: string | null | undefined) =>
  GUARD_ID_TYPES.find((t) => t.value === value);

/**
 * True when the chosen document actually carries the detail that identifies the
 * guard. A type with nothing filled in is a selection, not identification.
 */
export function hasUsableId(g: {
  idType?: string | null; nationalId?: string | null;
  relativeIdName?: string | null; otherDocType?: string | null;
}): boolean {
  switch (g.idType) {
    case 'OWN_ID':         return !!g.nationalId?.trim();
    case 'RELATIVE_ID':    return !!g.relativeIdName?.trim();
    case 'OTHER_DOCUMENT': return !!g.otherDocType?.trim();
    default:               return false;
  }
}

/** One line describing a guard's identification, for a list or a profile. */
export function idSummary(g: {
  idType?: string | null; nationalId?: string | null;
  relativeIdName?: string | null; relativeIdNumber?: string | null;
  otherDocType?: string | null; otherDocNumber?: string | null;
}): string {
  switch (g.idType) {
    case 'OWN_ID':
      return g.nationalId ? `Own ID: ${g.nationalId}` : 'Own ID — number not recorded';
    case 'RELATIVE_ID':
      return g.relativeIdName
        ? `Relative (${g.relativeIdName})${g.relativeIdNumber ? `: ${g.relativeIdNumber}` : ''}`
        : "Relative's ID — name not recorded";
    case 'OTHER_DOCUMENT':
      return g.otherDocType
        ? `${g.otherDocType}${g.otherDocNumber ? `: ${g.otherDocNumber}` : ''}`
        : 'Other document — type not recorded';
    default:
      return 'Not provided';
  }
}

const GuardFieldsSchema = z.object({
  // Existing required fields
  firstName:     z.string().min(1).max(100),
  lastName:      z.string().min(1).max(100),
  otherNames:    z.string().max(100).optional(),
  idType:           z.enum(GUARD_ID_TYPE_VALUES).optional().nullable(),
  nationalId:       z.string().min(1).max(50).optional().nullable(),
  relativeIdName:   z.string().max(100).optional().nullable(),
  relativeIdNumber: z.string().max(50).optional().nullable(),
  otherDocType:     z.string().max(100).optional().nullable(),
  otherDocNumber:   z.string().max(50).optional().nullable(),
  isIncompleteNID: z.boolean().default(false).optional(),
  // Optional: a guard is often registered from a paper form before they have
  // produced a phone number or named a next of kin, and refusing the record
  // until then means the guard exists on paper and nowhere else. The format
  // check still applies to a value that is given — optional means "may be
  // absent", not "may be anything".
  phone:         z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number').optional().nullable(),
  dateOfBirth:   z.string().datetime(),
  nextOfKinName: z.string().min(1).max(100).optional().nullable(),
  nextOfKinPhone:z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number').optional().nullable(),
  bankName:      z.string().max(100).optional(),
  accountNumber: z.string().max(50).optional(),
  salaryRate:    z.number().int().positive().describe('Monthly salary in UGX'),
  contractStart: z.string().datetime(),
  contractEnd:   z.string().datetime().optional(),
  psoCertNumber: z.string().max(50).optional(),

  // ── Section A: Personal Particulars ──────────────────────────────────────────
  gender:                  z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  tribe:                   z.string().max(100).optional(),
  placeOfBirth:            z.string().max(200).optional(),
  educationLevel:          z.enum(['PRIMARY', 'O_LEVEL', 'A_LEVEL', 'CERTIFICATE', 'DIPLOMA', 'DEGREE', 'MASTERS', 'OTHER']).optional(),
  rank:                    z.string().min(1).max(100).optional(),
  contractType:            z.enum(['TEMPORARY', 'PERMANENT']).default('PERMANENT').optional(),
  probationStatus:         z.enum(['ON_PROBATION', 'CONFIRMED']).default('ON_PROBATION').optional(),
  probationEndDate:        z.string().datetime().optional(),
  registeredNames:         z.string().max(200).optional(),
  maritalStatus:           z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  spouseName:              z.string().max(100).optional(),
  spouseWorkplace:         z.string().max(200).optional(),
  spouseTelephone:         z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  preferredPaymentContact: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  /// Overrides the network inferred from the number's prefix.
  mobileNetwork:           z.enum(['MTN', 'AIRTEL']).optional().nullable(),
  /// The name registered on the wallet, when it differs from the legal name.
  momoAccountName:         z.string().max(120).optional().nullable(),

  // ── Section A: Address ────────────────────────────────────────────────────────
  village:   z.string().max(100).optional(),
  parish:    z.string().max(100).optional(),
  subCounty: z.string().max(100).optional(),
  county:    z.string().max(100).optional(),
  district:  z.string().max(100).optional(),

  // ── Section B(2): LC Official ─────────────────────────────────────────────────
  lc1Zone:            z.string().max(100).optional(),
  lcOfficialName:     z.string().max(100).optional(),
  lcOfficialPosition: z.string().max(100).optional(),
  lcOfficialPhone:    z.string().regex(/^\+?[0-9]{10,15}$/).optional(),

  // ── Section B(3-5): ID Numbers + Employment ───────────────────────────────────
  nssfNumber:        z.string().max(50).optional(),
  tinNumber:         z.string().max(50).optional(),
  previousEmployer:  z.string().max(200).optional(),
  previousPosition:  z.string().max(200).optional(),
  talentsExperience: z.string().optional(),

  // ── Section C: Father Details ─────────────────────────────────────────────────
  fatherName:        z.string().max(100).optional(),
  fatherResidence:   z.string().max(200).optional(),
  fatherVillage:     z.string().max(100).optional(),
  fatherParish:      z.string().max(100).optional(),
  fatherSubCounty:   z.string().max(100).optional(),
  fatherCounty:      z.string().max(100).optional(),
  fatherDistrict:    z.string().max(100).optional(),
  fatherNationality: z.string().max(100).optional(),
  fatherOccupation:  z.string().max(200).optional(),
  fatherPhone:       z.string().regex(/^\+?[0-9]{10,15}$/).optional(),

  // ── Section C: Mother Details ─────────────────────────────────────────────────
  motherName:        z.string().max(100).optional(),
  motherResidence:   z.string().max(200).optional(),
  motherVillage:     z.string().max(100).optional(),
  motherParish:      z.string().max(100).optional(),
  motherSubCounty:   z.string().max(100).optional(),
  motherCounty:      z.string().max(100).optional(),
  motherDistrict:    z.string().max(100).optional(),
  motherNationality: z.string().max(100).optional(),
  motherOccupation:  z.string().max(200).optional(),
  motherPhone:       z.string().regex(/^\+?[0-9]{10,15}$/).optional(),

  // ── Section C: Dependents ─────────────────────────────────────────────────────
  numberOfDependents: z.coerce.number().int().min(0).optional(),

  // ── Section D: Health ─────────────────────────────────────────────────────────
  hasDisability:     z.boolean().optional(),
  disabilityDetails: z.string().max(500).optional(),
  takesAlcohol:      z.boolean().optional(),
  hasAllergies:      z.boolean().optional(),
  allergyDetails:    z.string().max(500).optional(),

  // ── Vetting data (relatives + associates) ─────────────────────────────────────
  vettingData: z.object({
    relatives:  z.array(z.object({
      relativeName:    z.string().min(1).max(100),
      phone:           z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
      relationship:    z.string().max(100).optional(),
      occupation:      z.string().max(200).optional(),
      placeOfResidence:z.string().max(200).optional(),
    })).max(3).optional(),
    associates: z.array(z.object({
      associateName: z.string().min(1).max(100),
      placeOfWork:   z.string().max(200).optional(),
      workDetails:   z.string().max(200).optional(),
      residence:     z.string().max(200).optional(),
      phone:         z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
    })).max(2).optional(),
  }).optional(),
});

/**
 * Picking a document type without its identifying detail is a selection, not
 * identification — the record would show a guard as documented while carrying
 * nothing that names them. Applied to create and to update alike, so an edit
 * cannot leave a guard in that state either.
 */
function checkIdentification(
  d: { idType?: string | null; relativeIdName?: string | null; otherDocType?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (d.idType === 'RELATIVE_ID' && !d.relativeIdName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['relativeIdName'],
      message: "Whose ID is it? Give the relative's name.",
    });
  }
  if (d.idType === 'OTHER_DOCUMENT' && !d.otherDocType?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['otherDocType'],
      message: 'Name the document — a student card, a passport, and so on.',
    });
  }
}

export const CreateGuardSchema = GuardFieldsSchema.superRefine(checkIdentification);

/** All fields optional — used for PATCH updates. */
export const UpdateGuardSchema = GuardFieldsSchema.partial().superRefine(checkIdentification);

export const GuardStatusSchema = z.object({
  status: GuardEmploymentStatusSchema,
  reason: z.string().min(1).describe('Required reason for status change'),
});

export const ReinstateGuardSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').describe('Reason for reinstatement'),
});

export const CreateGuardTransferSchema = z.object({
  fromSiteId:   z.string().min(1).optional(),
  toSiteId:     z.string().min(1),
  reason:       z.string().min(10).max(1000),
  transferDate: z.string().datetime(),
});

/**
 * Ranks are identified by GuardRank.name — there is no separate code column,
 * and Guard.rank stores the name directly.
 */
export const PromoteGuardSchema = z.object({
  toRank:        z.string().min(1, 'A new rank is required').max(100),
  newSalary:     z.coerce.number().int().min(1, 'Salary must be greater than zero'),
  reason:        z.string().max(500).optional(),
  effectiveDate: z.string().datetime().optional(),
});

export const GuardListQuerySchema = z.object({
  /** A GUARD_ID_TYPES value, or 'NONE' for guards with no document. */
  idType:    z.string().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().min(1).max(500).default(20),
  search:    z.string().optional().describe('Search by name, nationalId, or phone'),
  status:    GuardEmploymentStatusSchema.optional(),
  rank:            z.string().optional(),
  contractType:    z.enum(['TEMPORARY', 'PERMANENT']).optional(),
  probationStatus: z.enum(['ON_PROBATION', 'CONFIRMED']).optional(),
  nidStatus:       z.enum(['PENDING', 'PROVIDED']).optional(),
  isIncompleteNID: z.coerce.boolean().optional(),
  onLeave:         z.coerce.boolean().optional(),
  siteId:    z.string().optional(),
  sortBy:    z.enum(['firstName', 'lastName', 'createdAt', 'salaryRate', 'contractStart']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ── Vetting sub-schemas (standalone, for the PUT /vetting-data route) ──────────

export const GuardRelativeSchema = z.object({
  relativeName:    z.string().min(1).max(100),
  phone:           z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  relationship:    z.string().max(100).optional(),
  occupation:      z.string().max(200).optional(),
  placeOfResidence:z.string().max(200).optional(),
});

export const GuardAssociateSchema = z.object({
  associateName: z.string().min(1).max(100),
  placeOfWork:   z.string().max(200).optional(),
  workDetails:   z.string().max(200).optional(),
  residence:     z.string().max(200).optional(),
  phone:         z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
});

export const GuardVettingDataSchema = z.object({
  relatives:  z.array(GuardRelativeSchema).max(3).optional(),
  associates: z.array(GuardAssociateSchema).max(2).optional(),
});

// ── Constants ──────────────────────────────────────────────────────────────────

export const GUARD_CONTRACT_TYPES: Record<string, string> = {
  PERMANENT: 'Permanent',
  TEMPORARY: 'Temporary',
};

export const GUARD_RANKS: Record<string, string> = {
  GUARD:         'Guard',
  SENIOR_GUARD:  'Senior Guard',
  CORPORAL:      'Corporal',
  SERGEANT:      'Sergeant',
  SUPERVISOR:    'Supervisor',
};

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateGuardInput       = z.infer<typeof CreateGuardSchema>;
export type UpdateGuardInput       = z.infer<typeof UpdateGuardSchema>;
export type GuardStatusInput       = z.infer<typeof GuardStatusSchema>;
export type ReinstateGuardInput    = z.infer<typeof ReinstateGuardSchema>;
export type CreateGuardTransferInput = z.infer<typeof CreateGuardTransferSchema>;
export type PromoteGuardInput      = z.infer<typeof PromoteGuardSchema>;
export type GuardListQuery         = z.infer<typeof GuardListQuerySchema>;
export type GuardRelativeInput     = z.infer<typeof GuardRelativeSchema>;
export type GuardAssociateInput    = z.infer<typeof GuardAssociateSchema>;
export type GuardVettingDataInput  = z.infer<typeof GuardVettingDataSchema>;

// ── Response types (TypeScript interfaces) ─────────────────────────────────────

export interface GuardRelativeResponse {
  id:              string;
  relativeName:    string;
  phone:           string | null;
  relationship:    string | null;
  occupation:      string | null;
  placeOfResidence:string | null;
  createdAt:       string;
}

export interface GuardAssociateResponse {
  id:           string;
  associateName:string;
  placeOfWork:  string | null;
  workDetails:  string | null;
  residence:    string | null;
  phone:        string | null;
  createdAt:    string;
}

export interface GuardResponse {
  id:          string;
  systemId:    string | null;
  firstName:   string;
  lastName:    string;
  otherNames:  string | null;
  /** Computed: firstName + otherNames (if any) + lastName */
  fullName:    string;
  idType:           string | null;
  nationalId:       string | null;
  relativeIdName:   string | null;
  relativeIdNumber: string | null;
  otherDocType:     string | null;
  otherDocNumber:   string | null;
  /** One line describing the identification, ready to display. */
  idSummary:        string;
  isIncompleteNID: boolean;
  phone:       string | null;
  photoUrl:    string | null;
  dateOfBirth: string;
  nextOfKinName:  string | null;
  nextOfKinPhone: string | null;
  bankName:       string | null;
  /**
   * Only returned in single-record GET responses for DIRECTOR and
   * ASSISTANT_MANAGER roles. Absent in list responses and for other roles.
   */
  accountNumber?: string | null;
  salaryRate:      number;
  employmentStatus:GuardEmploymentStatus;
  contractStart:   string;
  contractEnd:     string | null;
  psoCertNumber:   string | null;
  createdAt:       string;
  updatedAt:       string;

  // ── Section A ────────────────────────────────────────────────────────────────
  gender:                  string | null;
  tribe:                   string | null;
  placeOfBirth:            string | null;
  educationLevel:          string | null;
  rank:                    string;
  contractType:            string;
  probationStatus:         string;
  probationEndDate:        string | null;
  reinstatedCount:         number;
  lastReinstatedAt:        string | null;
  lastReinstatedBy:        string | null;
  registeredNames:         string | null;
  maritalStatus:           string | null;
  spouseName:              string | null;
  spouseWorkplace:         string | null;
  spouseTelephone:         string | null;
  preferredPaymentContact: string | null;
  mobileNetwork:           string | null;
  momoAccountName:         string | null;

  // ── Section A Address ─────────────────────────────────────────────────────────
  village:   string | null;
  parish:    string | null;
  subCounty: string | null;
  county:    string | null;
  district:  string | null;

  // ── Section B ────────────────────────────────────────────────────────────────
  lc1Zone:            string | null;
  lcOfficialName:     string | null;
  lcOfficialPosition: string | null;
  lcOfficialPhone:    string | null;
  nssfNumber:         string | null;
  tinNumber:          string | null;
  previousEmployer:   string | null;
  previousPosition:   string | null;
  talentsExperience:  string | null;

  // ── Section C: Father ─────────────────────────────────────────────────────────
  fatherName:        string | null;
  fatherResidence:   string | null;
  fatherVillage:     string | null;
  fatherParish:      string | null;
  fatherSubCounty:   string | null;
  fatherCounty:      string | null;
  fatherDistrict:    string | null;
  fatherNationality: string | null;
  fatherOccupation:  string | null;
  fatherPhone:       string | null;

  // ── Section C: Mother ─────────────────────────────────────────────────────────
  motherName:        string | null;
  motherResidence:   string | null;
  motherVillage:     string | null;
  motherParish:      string | null;
  motherSubCounty:   string | null;
  motherCounty:      string | null;
  motherDistrict:    string | null;
  motherNationality: string | null;
  motherOccupation:  string | null;
  motherPhone:       string | null;

  // ── Section C: Dependents + Relatives + Associates ────────────────────────────
  numberOfDependents: number | null;
  relatives:          GuardRelativeResponse[];
  associates:         GuardAssociateResponse[];

  // ── Section D: Health ─────────────────────────────────────────────────────────
  hasDisability:     boolean;
  disabilityDetails: string | null;
  takesAlcohol:      boolean;
  hasAllergies:      boolean;
  allergyDetails:    string | null;

  // ── Salary increment tracking ─────────────────────────────────────────────────
  incrementCount:        number;
  lastIncrementDate:     string | null;
  nextIncrementDate:     string | null;
  effectiveServiceStart: string | null;

  /**
   * The site the guard is deployed to right now — derived from their open
   * deployment history record (the one with no end date), not stored on the
   * guard. A transfer closes that record and opens another, so this follows the
   * transfer without a second column that could drift out of step.
   *
   * Only present on single-record responses, which are the ones that load
   * deployment history.
   */
  currentSiteId?:   string | null;
  currentSiteName?: string | null;

  latestSuspension?: {
    reason:      string;
    incidentDate:string;
    officerName: string;
  } | null;

  documents?: GuardDocumentResponse[];

  _count?: {
    deployments: number;
    attendance:  number;
    disciplinary:number;
    documents:   number;
  };

  /**
   * The login attached to this guard, or null when they have none — most
   * guards never need one. Present on the profile only; the list does not
   * carry it.
   */
  systemAccess?: {
    userId: string;
    email:  string;
    status: string;
  } | null;
}

export interface GuardTransferResponse {
  id:           string;
  guard:        { id: string; fullName: string };
  fromSite:     { id: string; siteName: string; clientName: string } | null;
  toSite:       { id: string; siteName: string; clientName: string };
  reason:       string;
  transferDate: string;
  authorisedBy: { id: string; name: string };
  createdAt:    string;
}

export interface GuardPromotionResponse {
  id:              string;
  guardId:         string;
  fromRank:        string;
  toRank:          string;
  fromSalary:      number;
  toSalary:        number;
  /** toSalary - fromSalary. Negative if the salary was reduced. */
  salaryIncrement: number;
  reason:          string | null;
  effectiveDate:   string;
  promotedBy:      { id: string; name: string };
  createdAt:       string;
}

export interface GuardDocumentResponse {
  id:           string;
  documentType: string;
  filePath:     string;
  version:      number;
  uploadedAt:   string;
  uploadedBy:   { name: string };
  deletedAt?:   string | null;
}

export interface DeploymentHistoryEntry {
  id:         string;
  site:       { id: string; siteName: string };
  client:     { clientName: string };
  shiftType:  string;
  startDate:  string;
  endDate:    string | null;
  supervisor: { name: string };
  createdAt:  string;
}

/**
 * One guard as the Excel export needs them: the fields the guards list already
 * shows, plus where they are deployed — which the list response cannot carry,
 * because the current site is derived from the open deployment record and only
 * single-guard responses load it.
 *
 * The bank account number is deliberately absent. It is kept from everyone but
 * the Director and Assistant Manager on the guard profile, and a spreadsheet
 * that anyone holding guards.view could download is no place to reintroduce it.
 */
export interface GuardExportRow {
  systemId:         string | null;
  firstName:        string;
  lastName:         string;
  otherNames:       string | null;
  fullName:         string;
  gender:           string | null;
  dateOfBirth:      string | null;
  nationalId:       string | null;
  idType:           string | null;
  phone:            string | null;
  rank:             string;
  employmentStatus: string;
  contractType:     string;
  probationStatus:  string;
  salaryRate:       number;
  currentSiteName:  string | null;
  clientName:       string | null;
  zoneName:         string | null;
  nextOfKinName:    string | null;
  nextOfKinPhone:   string | null;
  district:         string | null;
  contractStart:    string;
  contractEnd:      string | null;
  createdAt:        string;
}

export interface GuardExportResponse {
  guards:     GuardExportRow[];
  totalCount: number;
  exportedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page:       number;
    limit:      number;
    total:      number;
    totalPages: number;
    hasNext:    boolean;
    hasPrev:    boolean;
  };
}

// ── Bulk import ────────────────────────────────────────────────────────────────

export const BulkImportRowSchema = z.object({
  firstName:      z.string().min(1).max(100),
  lastName:       z.string().min(1).max(100),
  otherNames:     z.string().max(100).optional(),
  nationalId:     z.string().min(1).max(50),
  phone:          z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  dateOfBirth:    z.string().describe('DD/MM/YYYY format'),
  nextOfKinName:  z.string().min(1).max(100),
  nextOfKinPhone: z.string().regex(/^\+?[0-9]{10,15}$/),
  bankName:       z.string().max(100).optional(),
  accountNumber:  z.string().max(50).optional(),
  salaryRate:     z.coerce.number().int().positive(),
  contractStart:  z.string().describe('DD/MM/YYYY format'),
  contractEnd:    z.string().optional().describe('DD/MM/YYYY format'),
  psoCertNumber:  z.string().max(50).optional(),
  // Extended vetting columns (O onwards — all optional)
  gender:                  z.string().optional(),
  tribe:                   z.string().max(100).optional(),
  placeOfBirth:            z.string().max(200).optional(),
  educationLevel:          z.string().optional(),
  maritalStatus:           z.string().optional(),
  district:                z.string().max(100).optional(),
  subCounty:               z.string().max(100).optional(),
  parish:                  z.string().max(100).optional(),
  village:                 z.string().max(100).optional(),
  nssfNumber:              z.string().max(50).optional(),
  tinNumber:               z.string().max(50).optional(),
  previousEmployer:        z.string().max(200).optional(),
  previousPosition:        z.string().max(200).optional(),
  preferredPaymentContact: z.string().max(20).optional(),
  mobileNetwork:           z.enum(['MTN', 'AIRTEL']).optional().nullable(),
  momoAccountName:         z.string().max(120).optional().nullable(),
});

export type BulkImportRow = z.infer<typeof BulkImportRowSchema>;

export interface BulkImportResultRow {
  rowNumber:  number;
  status:     'SUCCESS' | 'ERROR' | 'SKIPPED';
  guardId?:   string;
  guardName?: string;
  errors:     string[];
  data:       Partial<BulkImportRow>;
}

export interface BulkImportResult {
  totalRows:    number;
  successful:   number;
  failed:       number;
  skipped:      number;
  results:      BulkImportResultRow[];
  downloadUrl?: string;
}

// ── Guard dashboard ────────────────────────────────────────────────────────────

export interface GuardDashboardStats {
  totalActive:         number;
  totalSuspended:      number;
  totalTerminated:     number;
  totalGuards:         number;
  expiringContracts:   number;
  pendingDisciplinary: number;
  deployedToday:       number;
  absentToday:         number;
  newThisMonth:        number;
  guardsByStatus: {
    status: string;
    count:  number;
  }[];
  attendanceTrend: {
    date:    string;
    present: number;
    absent:  number;
    late:    number;
    awol:    number;
  }[];
  topSitesByDeployment: {
    siteName:   string;
    clientName: string;
    count:      number;
  }[];
}
