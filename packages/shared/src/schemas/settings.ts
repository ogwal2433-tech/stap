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
