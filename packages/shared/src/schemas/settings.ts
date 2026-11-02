import { z } from 'zod';

// ── Deduction Type schemas ─────────────────────────────────────────────────────

export const CreateDeductionTypeSchema = z.object({
  name:          z.string().min(1).max(200),
  code:          z.string().min(1).max(50)
                   .regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers, and underscores only')
                   .describe('Unique internal code e.g. FOOD, LATE_COMING'),
  defaultAmount: z.coerce.number().int().positive().optional().nullable(),
  description:   z.string().max(500).optional(),
  displayOrder:  z.coerce.number().int().min(0).default(0),
});

export const UpdateDeductionTypeSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  defaultAmount: z.coerce.number().int().positive().optional().nullable(),
  description:   z.string().max(500).optional(),
  displayOrder:  z.coerce.number().int().min(0).optional(),
  isActive:      z.boolean().optional(),
});

export const ReorderDeductionTypesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

// ── Deduction Type response type ───────────────────────────────────────────────

export interface DeductionTypeResponse {
  id:            string;
  name:          string;
  code:          string;
  defaultAmount: number | null;
  description:   string | null;
  isAutomatic:   boolean;
  displayOrder:  number;
  isActive:      boolean;
  createdAt:     string;
}

// ── Deduction Type inferred input types ───────────────────────────────────────

export type CreateDeductionTypeInput   = z.infer<typeof CreateDeductionTypeSchema>;
export type UpdateDeductionTypeInput   = z.infer<typeof UpdateDeductionTypeSchema>;
export type ReorderDeductionTypesInput = z.infer<typeof ReorderDeductionTypesSchema>;

// ── Staff Position schemas ─────────────────────────────────────────────────────

/**
 * A position is a label. The system role beside it is what grants access, so
 * adding or renaming one changes what a profile reads, never what it may reach.
 */
/**
 * Firearm catalogue entries. Codes are immutable once created (existing guns
 * point at them); retiring a type keeps those guns readable. New registrations
 * are held to the active rows by the server, so the register form can grow
 * without a deploy.
 */
export const CreateGunTypeSchema = z.object({
  code: z.string().min(1).max(40)
    .regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers, and underscores only')
    .describe('Unique internal code e.g. GLOCK_19'),
  label:        z.string().min(2).max(60),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const UpdateGunTypeSchema = z.object({
  label:        z.string().min(2).max(60).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

export interface GunTypeResponse {
  id:           string;
  code:         string;
  label:        string;
  isActive:     boolean;
  displayOrder: number;
  createdAt:    string;
}

export type CreateGunTypeInput = z.infer<typeof CreateGunTypeSchema>;
export type UpdateGunTypeInput = z.infer<typeof UpdateGunTypeSchema>;

export const CreateStaffPositionSchema = z.object({
  title:        z.string().min(1).max(100),
  department:   z.string().min(1).max(60),
  grade:        z.string().max(60).optional().nullable(),
  description:  z.string().max(300).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

/**
 * `code` is absent on purpose: it is what staff records already point at, so it
 * is set once when the position is created and never edited afterwards.
 */
export const UpdateStaffPositionSchema = z.object({
  title:        z.string().min(1).max(100).optional(),
  department:   z.string().min(1).max(60).optional(),
  grade:        z.string().max(60).optional().nullable(),
  description:  z.string().max(300).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

export const ReorderStaffPositionsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export interface StaffPositionResponse {
  id:           string;
  code:         string;
  title:        string;
  department:   string;
  grade:        string | null;
  description:  string | null;
  displayOrder: number;
  isActive:     boolean;
  /** How many staff currently hold this position. */
  staffCount:   number;
  createdAt:    string;
}

export type CreateStaffPositionInput   = z.infer<typeof CreateStaffPositionSchema>;
export type UpdateStaffPositionInput   = z.infer<typeof UpdateStaffPositionSchema>;
export type ReorderStaffPositionsInput = z.infer<typeof ReorderStaffPositionsSchema>;

// ── Guard Rank schemas ─────────────────────────────────────────────────────────

export const CreateGuardRankSchema = z.object({
  name:          z.string().min(1).max(100),
  defaultSalary: z.coerce.number().int().min(0).optional().nullable(),
  displayOrder:  z.coerce.number().int().min(0).default(0),
});

export const UpdateGuardRankSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  defaultSalary: z.coerce.number().int().min(0).optional().nullable(),
  displayOrder:  z.coerce.number().int().min(0).optional(),
  isActive:      z.boolean().optional(),
});

export const ReorderGuardRanksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

// ── Guard Rank response type ───────────────────────────────────────────────────

export interface GuardRankResponse {
  id:            string;
  name:          string;
  defaultSalary: number | null;
  displayOrder:  number;
  isActive:      boolean;
  createdAt:     string;
}

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateGuardRankInput  = z.infer<typeof CreateGuardRankSchema>;
export type UpdateGuardRankInput  = z.infer<typeof UpdateGuardRankSchema>;
export type ReorderGuardRanksInput = z.infer<typeof ReorderGuardRanksSchema>;
