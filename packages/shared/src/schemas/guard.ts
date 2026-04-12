import { z } from 'zod';

// ── Input schemas (Zod) ────────────────────────────────────────────────────────

export const CreateGuardSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().max(100).optional(),
  nationalId: z.string().min(1).max(50),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  dateOfBirth: z.string().datetime(),
  nextOfKinName: z.string().min(1).max(100),
  nextOfKinPhone: z.string().regex(/^\+?[0-9]{10,15}$/),
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().max(50).optional(),
  salaryRate: z.number().int().positive().describe('Monthly salary in UGX'),
  contractStart: z.string().datetime(),
  contractEnd: z.string().datetime().optional(),
  psoCertNumber: z.string().max(50).optional(),
});

/** All fields optional — used for PATCH updates. */
export const UpdateGuardSchema = CreateGuardSchema.partial();

export const GuardStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']),
  reason: z.string().min(1).describe('Required reason for status change'),
});

export const GuardListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .optional()
    .describe('Search by name, nationalId, or phone'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
  siteId: z.string().optional(),
  sortBy: z
    .enum(['firstName', 'lastName', 'createdAt', 'salaryRate', 'contractStart'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateGuardInput = z.infer<typeof CreateGuardSchema>;
export type UpdateGuardInput = z.infer<typeof UpdateGuardSchema>;
export type GuardStatusInput = z.infer<typeof GuardStatusSchema>;
export type GuardListQuery = z.infer<typeof GuardListQuerySchema>;

// ── Response types (TypeScript interfaces) ────────────────────────────────────

export interface GuardResponse {
  id: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  /** Computed: firstName + otherNames (if any) + lastName */
  fullName: string;
  nationalId: string;
  phone: string;
  photoUrl: string | null;
  dateOfBirth: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  bankName: string | null;
  /**
   * Only returned in single-record GET responses for DIRECTOR and
   * ASSISTANT_MANAGER roles. Absent in list responses and for other roles.
   */
  accountNumber?: string | null;
  salaryRate: number;
  employmentStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  contractStart: string;
  contractEnd: string | null;
  psoCertNumber: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    deployments: number;
    attendance: number;
    disciplinary: number;
    documents: number;
  };
}

export interface GuardDocumentResponse {
  id: string;
  documentType: string;
  filePath: string;
  version: number;
  uploadedAt: string;
  uploadedBy: { name: string };
  deletedAt?: string | null;
}

export interface DeploymentHistoryEntry {
  id: string;
  site: { siteName: string };
  client: { clientName: string };
  shiftType: string;
  startDate: string;
  endDate: string | null;
  supervisor: { name: string };
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
