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
  /** How many times this contract has been amended. */
  amendmentCount: number;

  billingNote: string | null;

  createdAt:       string;
  updatedAt:       string;
}


// ── Amendments ─────────────────────────────────────────────────────────────────

/**
 * What kind of change an amendment records, so a history can be read at a
 * glance rather than by comparing every field.
 */
export const AMENDMENT_TYPES = [
  { value: 'GUARD_COUNT_CHANGE', label: 'Guard Count Change',  icon: '👮', colour: '#1B3A6B' },
  { value: 'RATE_CHANGE',        label: 'Rate / Value Change', icon: '💰', colour: '#1E8449' },
  { value: 'DATE_EXTENSION',     label: 'Contract Extension',  icon: '📅', colour: '#0F7B6C' },
  { value: 'SITE_CHANGE',        label: 'Site Change',         icon: '📍', colour: '#E8701A' },
  { value: 'TERMINATION',        label: 'Early Termination',   icon: '🔴', colour: '#C0392B' },
  { value: 'GENERAL',            label: 'General Amendment',   icon: '📝', colour: '#6c757d' },
] as const;

export const AMENDMENT_TYPE_VALUES = [
  'GUARD_COUNT_CHANGE', 'RATE_CHANGE', 'DATE_EXTENSION', 'SITE_CHANGE', 'TERMINATION', 'GENERAL',
] as const;
export type AmendmentType = (typeof AMENDMENT_TYPE_VALUES)[number];

export const amendmentTypeConfig = (value: string) =>
  AMENDMENT_TYPES.find((t) => t.value === value) ?? AMENDMENT_TYPES[5];

/**
 * Guard count and monthly value are derived from the rate lines, so an
 * amendment changes the lines rather than the totals. Setting a total directly
 * would leave it disagreeing with the breakdown it is supposed to summarise.
 */
export const AmendContractSchema = z.object({
  amendmentType: z.enum(AMENDMENT_TYPE_VALUES),
  effectiveDate: z.string().min(1, 'When does this amendment take effect?'),
  reason: z.string()
    .trim()
    .min(10, 'Say why the contract is changing — at least a short sentence.')
    .max(1000),
  guardRates:   z.array(GuardRateLineSchema).min(1).optional(),
  contractEnd:  z.string().optional().nullable(),
  billingNote:  z.string().max(1000).optional().nullable(),
}).superRefine((d, ctx) => {
  // A termination stands on its own; anything else has to say what it changed,
  // or it is a reason attached to nothing.
  const changesSomething =
    d.guardRates !== undefined || d.contractEnd !== undefined || d.billingNote !== undefined;
  if (d.amendmentType !== 'TERMINATION' && !changesSomething) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guardRates'],
      message: 'Nothing is being changed — amend the guard rates, the end date, or the note.',
    });
  }
});

export type AmendContractInput = z.infer<typeof AmendContractSchema>;

export interface ContractAmendmentResponse {
  id:             string;
  systemId:       string | null;
  contractId:     string;
  amendedAt:      string;
  amendedBy:      { id: string; name: string } | null;
  reason:         string;
  effectiveDate:  string;
  amendmentType:  string;
  changeSummary:  string | null;
  previousValues: Record<string, unknown>;
  newValues:      Record<string, unknown>;
}
