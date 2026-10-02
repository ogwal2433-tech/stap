import { z } from 'zod';
import { isTwoDpOrWhole } from '../utils/money';

// ── Money ──────────────────────────────────────────────────────────────────────

/**
 * UGX money on an invoice: whole shillings, or up to two decimal places.
 *
 * A line's rate is a daily figure, and the one that matters — a contract's
 * monthly rate divided by 30 — is rarely a whole number. Integers only could
 * not bill a contract accurately: 500,000/30 rounded up to 16,667 overcharges
 * each guard by 50 UGX a month.
 *
 * The granularity itself is checked by isTwoDpOrWhole (@security360/shared), which the
 * web forms reuse so a value accepted on screen is accepted by the API too.
 * Finer than a cent is rejected rather than silently rounded, so what the user
 * typed is what the invoice stores.
 */
const money = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(isTwoDpOrWhole, { message: 'Use at most two decimal places' });

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateInvoiceSchema = z.object({
  clientId:       z.string().min(1),
  contractId:     z.string().min(1).optional(),
  periodStart:    z.string().datetime(),
  periodEnd:      z.string().datetime(),
  guardsDeployed: z.number().int().min(1),
  ratePerGuard:   money(z.number().positive()),
  taxAmount:      money(z.number().min(0).default(0)),
  dueDate:        z.string().datetime(),
});

export const GenerateInvoiceSchema = z
  .object({
    contractId:         z.string().min(1).optional(),
    // Required when the client has no contract yet: an invoice can be raised
    // against the client directly with manually captured line items.
    clientId:           z.string().min(1).optional(),
    billingPeriodStart: z.string().datetime(),
    billingPeriodEnd:   z.string().datetime(),
    billingDays:        z.coerce.number().int().min(1).default(30),
    // With a contract these are the (possibly user-edited) preview lines,
    // always sent on generate; without one they are the only line source.
    lineItemOverrides:  z.array(z.object({
      guardType:    z.string().min(1),
      count:        z.coerce.number().int().min(1),
      ratePerGuard: money(z.coerce.number().min(0)),
      billingDays:  z.coerce.number().int().min(1),
    })).optional(),
  })
  .refine((d) => !!d.contractId || !!d.clientId, {
    message: 'Either contractId or clientId is required',
    path:    ['contractId'],
  })
  .refine((d) => !!d.contractId || (d.lineItemOverrides?.length ?? 0) > 0, {
    message: 'A contract-less invoice must carry manually captured line items',
    path:    ['lineItemOverrides'],
  });

export const RecordPaymentSchema = z.object({
  // Supplied via the :id URL param on POST /finance/invoices/:id/pay, not the
  // request body — optional here so body validation doesn't reject requests
  // before the route handler merges it in from req.params.
  invoiceId:       z.string().min(1).optional(),
  amountPaid:      money(z.coerce.number().positive()),
  mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH']),
  referenceNumber: z.string().optional(),
});

/**
 * Edits an invoice that is still PENDING — the only status with no money
 * received and nothing carried onto it. Dates are partial; line items, when
 * sent, replace the existing rows wholesale (send none to touch only dates).
 */
export const UpdateInvoiceSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd:   z.string().datetime().optional(),
  dueDate:     z.string().datetime().optional(),
  lineItems:   z.array(z.object({
    description:  z.string().min(1),
    guardType:    z.string().optional(),
    guardsCount:  z.coerce.number().int().min(1),
    ratePerGuard: money(z.coerce.number().min(0)),
    days:         z.coerce.number().int().min(1),
  })).min(1).optional(),
});

export const CreateDeductionSchema = z.object({
  guardId:       z.string().min(1),
  // Deduction types are stored in the DeductionType table and can be user-defined,
  // so we accept any non-empty string rather than a hardcoded enum.
  type:          z.string().min(1),
  amount:        z.number().int().positive(),
  description:   z.string().min(5),
  // Accept both YYYY-MM-DD (from date inputs) and full ISO strings (from API callers)
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
});

/**
 * Payroll is run per payroll group per period. The group must be active —
 * that is checked against the database at calculation time, not here.
 */
export const RunPayrollSchema = z.object({
  month:         z.number().int().min(1).max(12),
  year:          z.number().int().min(2024).max(2030),
  payrollGroupId: z.string().min(1, 'Select a payroll group'),
});

export const CashbookEntrySchema = z.object({
  date:        z.string().datetime(),
  description: z.string().min(3),
  category:    z.enum(['STATIONERY', 'TRANSPORT', 'WELFARE', 'MAINTENANCE', 'OTHER']),
  amount:      z.number().int().positive(),
  type:        z.enum(['IN', 'OUT']),
});

export const FlagPayslipSchema = z.object({
  flagReason:     z.string().min(5),
  adjustedAmount: z.number().int().positive().optional(),
});

export const HrApprovePayrollSchema = z.object({
  notes: z.string().optional(),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateInvoiceInput      = z.infer<typeof CreateInvoiceSchema>;
export type GenerateInvoiceInput    = z.infer<typeof GenerateInvoiceSchema>;
export type UpdateInvoiceInput      = z.infer<typeof UpdateInvoiceSchema>;
export type RecordPaymentInput      = z.infer<typeof RecordPaymentSchema>;
export type CreateDeductionInput    = z.infer<typeof CreateDeductionSchema>;
export type RunPayrollInput         = z.infer<typeof RunPayrollSchema>;
export type CashbookEntryInput      = z.infer<typeof CashbookEntrySchema>;
export type FlagPayslipInput        = z.infer<typeof FlagPayslipSchema>;
export type HrApprovePayrollInput   = z.infer<typeof HrApprovePayrollSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface InvoiceLineItemResponse {
  id:          string;
  guardId:     string | null;
  description: string;
  quantity:    number;    // mapped from guardsCount
  ratePerDay:  number;    // mapped from ratePerGuard
  days:        number;
  lineTotal:   number;    // mapped from amount
}

export interface InvoicePreviewLineItem {
  guardType:    string;
  count:        number;
  // Daily rate per guard, UGX — converted from the contract's monthly
  // ContractGuardRate.ratePerGuard (÷30) so lineTotal = count * ratePerGuard * billingDays
  // gives the correct amount for the actual billing period, not 30x too much.
  ratePerGuard: number;
  billingDays:  number;
  lineTotal:    number;
}

export interface InvoicePreviewResponse {
  contractId:     string;
  clientName:     string;
  period:         string;
  lineItems:      InvoicePreviewLineItem[];
  totalAmount:    number;
  guardsRequired: number;
}

export interface InvoiceResponse {
  id:             string;
  invoiceNumber:  string;
  clientId:       string;
  clientName:     string;
  contractId:     string | null;
  contractRef:    string | null;
  periodStart:    string;
  periodEnd:      string;
  guardsDeployed: number;
  ratePerGuard:   number;
  subtotal:       number;
  taxAmount:      number;
  totalAmount:    number;
  /** Total received across manual and mobile-money payments. */
  paidAmount:     number;
  /** totalAmount − paidAmount, floored at 0. */
  outstandingBalance: number;
  status:         string;
  dueDate:        string;
  paidAt:         string | null;
  pdfPath:        string | null;
  yoPaymentRef:   string | null;
  emailSentAt:    string | null;
  emailSentTo:    string | null;
  /** Set when voided (status VOID). A void invoice stays on file and owes nothing. */
  voidedAt:       string | null;
  voidReason:     string | null;
  autoGenerated:  boolean;
  createdAt:      string;
  payments:       PaymentResponse[];
  lineItems:      InvoiceLineItemResponse[];
}

export interface PaymentResponse {
  id:              string;
  invoiceId:       string;
  amountPaid:      number;
  mode:            string;
  referenceNumber: string | null;
  yoTransactionId: string | null;
  reconciled:      boolean;
  recordedBy:      string;
  createdAt:       string;
}

export interface DeductionResponse {
  id:               string;
  guardId:          string;
  guardName:        string;
  type:             string;
  amount:           number;
  description:      string;
  effectiveDate:    string;
  status:           string;
  payrollRunId:     string | null;
  appliedInPayroll: { month: number; year: number } | null;
  createdBy:        string;
  createdAt:        string;
}

export interface PayrollRunResponse {
  id:             string;
  month:          number;
  year:           number;
  // Null only on historical runs from before payroll was grouped.
  payrollGroupId:   string | null;
  payrollGroupName: string | null;
  totalGuards:    number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  status:         string; // DRAFT | APPROVED | HR_APPROVED | DISBURSING | DISBURSED
  approvedBy:     string | null;
  approvedAt:     string | null;
  hrApprovedBy:   string | null;
  hrApprovedAt:   string | null;
  hrNotes:        string | null;
  disbursedBy:    string | null;
  disbursedAt:    string | null;
  successCount:   number;
  failedCount:    number;
  createdBy:      string;
  createdAt:      string;
  payslipCount:   number;
}

export interface PayslipResponse {
  id:                  string;
  guardId:             string;
  guardName:           string;
  payrollRunId:        string;
  grossSalary:         number;
  deductionsBreakdown: Array<{
    deductionId?:  string;
    type:          string;
    amount:        number;
    description:   string;
    effectiveDate?: string;
  }>;
  totalDeductions:     number;
  netSalary:           number;
  daysWorked:          number;
  totalDays:           number;
  payslipPdfPath:      string | null;
  disbursementStatus:  string; // PENDING | SENT | SUCCESS | FAILED
  disbursementRef:     string | null;
  disbursementFailureReason: string | null;
  hrFlagged:           boolean;
  hrFlagReason:        string | null;
  hrAdjustedAmount:    number | null;
  createdAt:           string;
}

export interface CashbookEntryResponse {
  id:             string;
  date:           string;
  description:    string;
  category:       string;
  amount:         number;
  type:           string;
  recordedBy:     string;
  runningBalance: number;
  createdAt:      string;
}

export interface ARAgingReport {
  invoices: InvoiceResponse[];
  buckets: {
    current:   number;
    days31_60: number;
    days61_90: number;
    over90:    number;
    total:     number;
  };
}

export interface PayrollSummary {
  month:          number;
  year:           number;
  payrollGroupId:   string;
  payrollGroupName: string;
  totalGuards:    number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  byGuard:        PayslipResponse[];
}

// ── Fee increment ──────────────────────────────────────────────────────────────

/**
 * An extra charge added to an unsettled invoice — usually a client asking for
 * more guards partway through the billing period.
 */
export const AddFeeIncrementSchema = z.object({
  description:  z.string().min(3, 'Describe what the extra charge is for').max(300),
  guardType:    z.string().max(100).optional().nullable(),
  guardCount:   z.coerce.number().int().min(1, 'At least one guard'),
  ratePerGuard: money(z.coerce.number().min(0)),
  days:         z.coerce.number().int().min(1).default(30),
  reason:       z.string().max(500).optional().nullable(),
});

export type AddFeeIncrementInput = z.infer<typeof AddFeeIncrementSchema>;

/**
 * A client initiating mobile money payment on their own invoice from the portal.
 *
 * The phone is whatever the payer typed — the server normalises `07…` and
 * `2567…` and rejects anything else, so it is not constrained here beyond a
 * length that cannot be a slip. Network is optional: the server reads it from
 * the number's prefix when it is not given, and only the two networks the XCEL
 * collection API accepts are allowed.
 */
export const InitiatePortalPaymentSchema = z.object({
  phone:   z.string().min(9, 'Enter the mobile money number').max(20),
  network: z.enum(['MTN', 'AIRTEL']).optional(),
});

export type InitiatePortalPaymentInput = z.infer<typeof InitiatePortalPaymentSchema>;

/** Why an invoice was voided — kept on the invoice and in the audit log. */
export const VoidInvoiceSchema = z.object({
  reason: z.string().trim().min(5, 'Say why the invoice is being voided (at least 5 characters).').max(500),
});
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>;

// ── Payroll groups ─────────────────────────────────────────────────────────────────────

/**
 * A named grouping of guards for payroll organisation (teams, sites, pay
 * batches). guardIds replaces the whole membership on create/update rather
 * than adding to it, so the editor can save exactly what is on screen.
 */
export const CreatePayrollGroupSchema = z.object({
  name:        z.string().trim().min(2, 'Name is too short').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  isActive:    z.boolean().default(true),
  guardIds:    z.array(z.string().min(1)).default([]),
});

export const UpdatePayrollGroupSchema = CreatePayrollGroupSchema.partial();

export type CreatePayrollGroupInput = z.input<typeof CreatePayrollGroupSchema>;
export type UpdatePayrollGroupInput = z.infer<typeof UpdatePayrollGroupSchema>;

/** A guard inside a group, reduced to what the member list displays. */
export interface PayrollGroupMember {
  id:       string;
  fullName: string;
  rank:     string;
}

export interface PayrollGroupResponse {
  id:          string;
  name:        string;
  description: string | null;
  isActive:    boolean;
  memberCount: number;
  /** Only present on detail/list responses that asked for members. */
  members?:    PayrollGroupMember[];
  createdAt:   string;
  updatedAt:   string;
}

