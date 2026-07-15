import { z } from 'zod';

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateInvoiceSchema = z.object({
  clientId:       z.string().min(1),
  contractId:     z.string().min(1).optional(),
  periodStart:    z.string().datetime(),
  periodEnd:      z.string().datetime(),
  guardsDeployed: z.number().int().min(1),
  ratePerGuard:   z.number().int().positive(),
  taxAmount:      z.number().int().min(0).default(0),
  dueDate:        z.string().datetime(),
});

export const GenerateInvoiceSchema = z.object({
  contractId:         z.string().min(1),
  billingPeriodStart: z.string().datetime(),
  billingPeriodEnd:   z.string().datetime(),
  billingDays:        z.coerce.number().int().min(1).default(30),
  // The contract's guard rate lines are the only source — these are the
  // (possibly user-edited) lines from the preview, always sent on generate.
  lineItemOverrides:  z.array(z.object({
    guardType:    z.string().min(1),
    count:        z.coerce.number().int().min(1),
    ratePerGuard: z.coerce.number().int().min(0),
    billingDays:  z.coerce.number().int().min(1),
  })).optional(),
});

export const RecordPaymentSchema = z.object({
  // Supplied via the :id URL param on POST /finance/invoices/:id/pay, not the
  // request body — optional here so body validation doesn't reject requests
  // before the route handler merges it in from req.params.
  invoiceId:       z.string().min(1).optional(),
  amountPaid:      z.coerce.number().int().positive(),
  mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH']),
  referenceNumber: z.string().optional(),
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

export const RunPayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year:  z.number().int().min(2024).max(2030),
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
  status:         string;
  dueDate:        string;
  paidAt:         string | null;
  pdfPath:        string | null;
  yoPaymentRef:   string | null;
  emailSentAt:    string | null;
  emailSentTo:    string | null;
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
  totalGuards:    number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  byGuard:        PayslipResponse[];
}
