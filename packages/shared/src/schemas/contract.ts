import { z } from 'zod';

// ── Shift pattern constant ─────────────────────────────────────────────────────

export const SHIFT_PATTERNS = {
  SINGLE_SHIFT: 'Single Shift',
  TWO_SHIFTS:   'Two Shifts (12h each)',
  THREE_SHIFTS: 'Three Shifts (8h each)',
  CUSTOM:       'Custom',
} as const;

export type ShiftPattern = keyof typeof SHIFT_PATTERNS;

// ── Contract schemas ───────────────────────────────────────────────────────────

const GuardRateLineSchema = z.object({
  guardType:    z.string().min(1, 'Guard type is required'),
  guardsCount:  z.number().int().min(1, 'Count must be at least 1'),
  ratePerGuard: z.number().int().positive('Rate must be greater than zero')
                  .describe('Monthly rate per guard in UGX'),
});

export const CreateContractSchema = z.object({
  clientId:      z.string().min(1),
  contractStart: z.string().datetime(),
  contractEnd:   z.string().datetime(),

  // Security deployment details
  weaponsAllocation: z.number().int().min(0).optional(),
  shiftPattern:      z.enum(['SINGLE_SHIFT', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CUSTOM']).optional(),

  // Guard rate lines — the only billing mechanism. guardsRequired and the
  // contract's monthly value are derived from these server-side, not supplied directly.
  guardRates: z.array(GuardRateLineSchema)
    .min(1, 'At least one guard rate line is required to create a contract'),

  billingNote: z.string().max(1000).optional().nullable(),
});

export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = z.object({
  contractStart: z.string().datetime().optional(),
  contractEnd:   z.string().datetime().optional(),
  status:        z.enum(['DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED']).optional(),
  weaponsAllocation: z.number().int().min(0).optional(),
  shiftPattern:    z.enum(['SINGLE_SHIFT', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CUSTOM']).optional(),
  guardRates: z.array(GuardRateLineSchema)
    .min(1, 'At least one guard rate line is required')
    .optional(),

  billingNote: z.string().max(1000).optional().nullable(),
});

export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

// ── Response interface ─────────────────────────────────────────────────────────

export interface ContractGuardRateResponse {
  id:           string;
  guardType:    string;
  guardsCount:  number;
  ratePerGuard: number; // monthly rate per guard, UGX
  monthlyTotal: number; // guardsCount * ratePerGuard
}

export interface ContractResponse {
  id:                string;
  client:            { id: string; clientName: string };
  contractStart:     string;
  contractEnd:       string;
  guardsRequired:    number; // derived: sum of guardRates[].guardsCount
  totalMonthlyValue: number; // derived: sum of guardRates[].monthlyTotal
  status:            'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
  daysRemaining:     number; // computed: days until contractEnd

  // Security deployment details
  weaponsAllocation: number | null;
  shiftPattern:      ShiftPattern | null;

  // Guard rate lines — the single source of billing truth
  guardRates: ContractGuardRateResponse[];

  billingNote: string | null;

  createdAt:       string;
  updatedAt:       string;
}
