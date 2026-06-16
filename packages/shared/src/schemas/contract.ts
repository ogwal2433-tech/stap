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

export const CreateContractSchema = z.object({
  clientId:        z.string().min(1),
  contractStart:   z.string().datetime(),
  contractEnd:     z.string().datetime(),
  guardsRequired:  z.number().int().min(1),
  billingPerGuard: z.number().int().positive()
                     .describe('Monthly billing per guard in UGX'),

  // Security deployment details
  weaponsAllocation: z.number().int().min(0).optional(),
  shiftPattern:      z.enum(['SINGLE_SHIFT', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CUSTOM']).optional(),

  // Guard rate lines (Item 6)
  guardRates: z.array(z.object({
    guardType:    z.string().min(1),
    guardsCount:  z.number().int().min(1),
    ratePerGuard: z.number().int().positive(),
  })).optional(),

  billingNote: z.string().max(1000).optional().nullable(),
});

export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = z.object({
  contractStart:   z.string().datetime().optional(),
  contractEnd:     z.string().datetime().optional(),
  guardsRequired:  z.number().int().min(1).optional(),
  billingPerGuard: z.number().int().positive().optional(),
  status:          z.enum(['DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED']).optional(),
  weaponsAllocation: z.number().int().min(0).optional(),
  shiftPattern:    z.enum(['SINGLE_SHIFT', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CUSTOM']).optional(),
  guardRates: z.array(z.object({
    guardType:    z.string().min(1),
    guardsCount:  z.number().int().min(1),
    ratePerGuard: z.number().int().positive(),
  })).optional(),

  billingNote: z.string().max(1000).optional().nullable(),
});

export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

// ── Response interface ─────────────────────────────────────────────────────────

export interface ContractGuardRateResponse {
  id:           string;
  guardType:    string;
  guardsCount:  number;
  ratePerGuard: number;
}

export interface ContractResponse {
  id:              string;
  client:          { id: string; clientName: string };
  contractStart:   string;
  contractEnd:     string;
  guardsRequired:  number;
  billingPerGuard: number;
  monthlyValue:    number; // computed: guardsRequired * billingPerGuard
  status:          'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
  daysRemaining:   number; // computed: days until contractEnd

  // Security deployment details
  weaponsAllocation: number | null;
  shiftPattern:      ShiftPattern | null;

  // Guard rates (Item 6)
  guardRates: ContractGuardRateResponse[];

  billingNote: string | null;

  createdAt:       string;
  updatedAt:       string;
}
