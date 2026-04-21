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

export const RecordPaymentSchema = z.object({
  invoiceId:       z.string().min(1),
  amountPaid:      z.coerce.number().int().positive(),
  mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH']),
  referenceNumber: z.string().optional(),
});

export const CreateDeductionSchema = z.object({
  guardId:       z.string().min(1),
  type:          z.enum([
    'UNIFORM_RECOVERY',
    'DAMAGE_LOSS',
    'DISCIPLINARY_PENALTY',
    'SALARY_ADVANCE_REPAYMENT',
    'NSSF',
  ]),
  amount:        z.number().int().positive(),
  description:   z.string().min(5),
  effectiveDate: z.string().datetime(),
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

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateInvoiceInput   = z.infer<typeof CreateInvoiceSchema>;
export type RecordPaymentInput   = z.infer<typeof RecordPaymentSchema>;
export type CreateDeductionInput = z.infer<typeof CreateDeductionSchema>;
export type RunPayrollInput      = z.infer<typeof RunPayrollSchema>;
export type CashbookEntryInput   = z.infer<typeof CashbookEntrySchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

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
  createdAt:      string;
  payments:       PaymentResponse[];
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
  id:            string;
  guardId:       string;
  guardName:     string;
  type:          string;
  amount:        number;
  description:   string;
  effectiveDate: string;
  status:        string;
  payrollRunId:  string | null;
  createdBy:     string;
  createdAt:     string;
}

export interface PayrollRunResponse {
  id:             string;
  month:          number;
  year:           number;
  totalGuards:    number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  status:         string;
  approvedBy:     string | null;
  approvedAt:     string | null;
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
  deductionsBreakdown: Array<{ type: string; amount: number; description: string }>;
  totalDeductions:     number;
  netSalary:           number;
  daysWorked:          number;
  totalDays:           number;
  payslipPdfPath:      string | null;
  disbursementStatus:  string;
  disbursementRef:     string | null;
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
