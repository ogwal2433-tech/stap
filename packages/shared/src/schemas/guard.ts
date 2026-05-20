import { z } from 'zod';

// ── Input schemas (Zod) ────────────────────────────────────────────────────────

export const CreateGuardSchema = z.object({
  // Existing required fields
  firstName:     z.string().min(1).max(100),
  lastName:      z.string().min(1).max(100),
  otherNames:    z.string().max(100).optional(),
  nationalId:    z.string().min(1).max(50).optional(),
  isIncompleteNID: z.boolean().default(false).optional(),
  phone:         z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  dateOfBirth:   z.string().datetime(),
  nextOfKinName: z.string().min(1).max(100),
  nextOfKinPhone:z.string().regex(/^\+?[0-9]{10,15}$/),
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

/** All fields optional — used for PATCH updates. */
export const UpdateGuardSchema = CreateGuardSchema.partial();

export const GuardStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']),
  reason: z.string().min(1).describe('Required reason for status change'),
});

export const ReinstateGuardSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').describe('Reason for reinstatement'),
});

export const CreateGuardTransferSchema = z.object({
  fromSiteId:   z.string().cuid().optional(),
  toSiteId:     z.string().cuid(),
  reason:       z.string().min(10).max(1000),
  transferDate: z.string().datetime(),
});

export const GuardListQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().optional().describe('Search by name, nationalId, or phone'),
  status:    z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
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

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateGuardInput       = z.infer<typeof CreateGuardSchema>;
export type UpdateGuardInput       = z.infer<typeof UpdateGuardSchema>;
export type GuardStatusInput       = z.infer<typeof GuardStatusSchema>;
export type ReinstateGuardInput    = z.infer<typeof ReinstateGuardSchema>;
export type CreateGuardTransferInput = z.infer<typeof CreateGuardTransferSchema>;
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
  firstName:   string;
  lastName:    string;
  otherNames:  string | null;
  /** Computed: firstName + otherNames (if any) + lastName */
  fullName:    string;
  nationalId:  string | null;
  isIncompleteNID: boolean;
  phone:       string;
  photoUrl:    string | null;
  dateOfBirth: string;
  nextOfKinName:  string;
  nextOfKinPhone: string;
  bankName:       string | null;
  /**
   * Only returned in single-record GET responses for DIRECTOR and
   * ASSISTANT_MANAGER roles. Absent in list responses and for other roles.
   */
  accountNumber?: string | null;
  salaryRate:      number;
  employmentStatus:'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
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
  site:       { siteName: string };
  client:     { clientName: string };
  shiftType:  string;
  startDate:  string;
  endDate:    string | null;
  supervisor: { name: string };
  createdAt:  string;
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
