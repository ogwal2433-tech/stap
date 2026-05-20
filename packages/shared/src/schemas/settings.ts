import { z } from 'zod';

// ── Guard Rank schemas ─────────────────────────────────────────────────────────

export const CreateGuardRankSchema = z.object({
  name:         z.string().min(1).max(100),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const UpdateGuardRankSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

export const ReorderGuardRanksSchema = z.object({
  orderedIds: z.array(z.string().cuid()).min(1),
});

// ── Guard Rank response type ───────────────────────────────────────────────────

export interface GuardRankResponse {
  id:           string;
  name:         string;
  displayOrder: number;
  isActive:     boolean;
  createdAt:    string;
}

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateGuardRankInput  = z.infer<typeof CreateGuardRankSchema>;
export type UpdateGuardRankInput  = z.infer<typeof UpdateGuardRankSchema>;
export type ReorderGuardRanksInput = z.infer<typeof ReorderGuardRanksSchema>;
