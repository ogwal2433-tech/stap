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
  /** Client-facing heading; the server derives one from the period when omitted. */
  description:    z.string().min(3).max(300).optional(),
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
  mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH', 'CHEQUE']),
  referenceNumber: z.string().optional(),
  /// Day the money actually moved, as YYYY-MM-DD from the date picker. Blank
  /// falls back to the recording moment in the service layer.
  paymentDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be YYYY-MM-DD').optional(),
  /// Cheque number — shown for cheque/bank payments, blank for cash or mobile
  /// money.
  chequeNumber:    z.string().max(50).optional(),
});

/** Billing-period month the invoice list, run and summary all share (YYYY-MM). */
export const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: 'month must look like YYYY-MM',
});

export const RunInvoicesSchema = z.object({ month: monthParam });

export const IssueBatchSchema = z.object({
  month:      monthParam.optional(),
  runBatchId: z.string().min(3).optional(),
}).refine((d) => !!d.month || !!d.runBatchId, {
  message: 'month or runBatchId is required',
  path:    ['month'],
});

export const InvoiceSummaryQuerySchema = z.object({ month: monthParam.optional() });

export const PaymentListQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  month:  monthParam.optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
});

export const RejectPaymentSchema = z.object({
  reason: z.string().min(3).max(300),
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

/**
 * Query for GET /finance/invoices.
 *
 * The dates filter the *raised* date — the moment the invoice came into
 * existence — which is a different day from the billing period printed in the
 * Period column and from the due date, so the label on the screen and the name
 * here both say which one is meant.
 *
 * `from`/`to` take either YYYY-MM-DD (a date input) or a full timestamp, and `to`
 * is read as through the end of that day — the convention the audit log's date
 * filter already follows, so two screens on one system answer the same question.
 *
 * Both the invoice list and the AR aging report take this narrowing, so it is
 * declared once and extended where the two differ.
 */
const invoiceDateFilter = z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' });

/** The narrowing both the invoice list and the AR aging report accept. */
const invoiceFilterBase = z.object({
  clientId: z.string().min(1).optional(),
  from:     invoiceDateFilter.optional(),
  to:       invoiceDateFilter.optional(),
});

/**
 * A range the wrong way round is a slip rather than an empty answer, so it is
 * refused with a message naming the field instead of returning nothing.
 */
const fromNotAfterTo = (q: { from?: string; to?: string }) =>
  !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to);

const RANGE_MESSAGE = 'The from date must be on or before the to date';

export const InvoiceListQuerySchema = invoiceFilterBase
  .extend({
    page:  z.coerce.number().int().positive().default(1),
    // The invoice table has no pager, so the whole filtered set is expected in
    // one call; 500 covers this business for years and keeps a stray query from
    // dragging every invoice in the database across the wire.
    limit:  z.coerce.number().int().min(1).max(500).default(20),
    status: z.enum(['PENDING', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'VOID']).optional(),
    // Billing-period month (overlap, not raised date): the month filter a
    // finance screen actually understands, alongside the raised-date range.
    month:  monthParam.optional(),
    // Who raised it (user id): "all invoices from Harold" for the MD.
    createdBy: z.string().min(1).optional(),
    // Ordering: newest-raised (default) or by the client's trading name A→Z.
    sortBy:    z.enum(['newest', 'clientName']).optional(),
  })
  .refine(fromNotAfterTo, { message: RANGE_MESSAGE, path: ['from'] });

/**
 * Query for GET /finance/invoices/aging: the same narrowing as the invoice list
 * without the paging or the status, because an aging report buckets every
 * outstanding invoice — a page of it would total something nobody owes.
 */
export const ARAgingQuerySchema = invoiceFilterBase.refine(fromNotAfterTo, {
  message: RANGE_MESSAGE,
  path:    ['from'],
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
 * A payroll run covers one zone for a period, or — with scope COMPANY — the
 * whole company at once. guardIds is the explicit tick-list from the matching
 * roster: the finance user unticks anyone who should not be paid, so the
 * server never silently decides the roster on its own.
 *
 * A period is either zone-runs or one company-wide run, never both: the
 * company-wide run covers every deployed guard, so it is refused while any
 * live run exists for the period (enforced in the service, not here).
 */
export const RunPayrollSchema = z.object({
  month:    z.number().int().min(1).max(12),
  year:     z.number().int().min(2024).max(2030),
  scope:    z.enum(['ZONE', 'COMPANY']).default('ZONE'),
  zoneId:   z.string().min(1).optional(),
  guardIds: z.array(z.string().min(1)).min(1, 'At least one guard must be selected'),
}).refine((d) => d.scope === 'COMPANY' || !!d.zoneId, {
  message: 'Pick the zone to pay',
  path:    ['zoneId'],
});

/** Period selector for the zone payroll roster (query string, so coerced). */
export const PayrollRosterQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year:  z.coerce.number().int().min(2024).max(2030),
});
export type PayrollRosterQuery = z.infer<typeof PayrollRosterQuerySchema>;

export const CashbookEntrySchema = z.object({
  date:        z.string().datetime(),
  description: z.string().min(3),
  // STATIONERY…OTHER are the manual expense picks in the Add Entry modal;
  // the last three are written only by the auto-entries the ledger now records
  // itself (client payments, payroll disbursements, requisition payouts).
  category:    z.enum(['STATIONERY', 'TRANSPORT', 'WELFARE', 'MAINTENANCE', 'OTHER', 'CLIENT_PAYMENT', 'PAYROLL', 'REQUISITION']),
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

// Rejecting a run sends it back out of the pipeline with a reason on record —
// mandatory, unlike HR approval notes, because the recalculation team needs to
// know what to fix.
export const RejectPayrollSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason — at least 5 characters').max(500),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateInvoiceInput      = z.infer<typeof CreateInvoiceSchema>;
export type GenerateInvoiceInput    = z.infer<typeof GenerateInvoiceSchema>;
export type UpdateInvoiceInput      = z.infer<typeof UpdateInvoiceSchema>;
export type RecordPaymentInput      = z.infer<typeof RecordPaymentSchema>;
export type InvoiceListQuery        = z.infer<typeof InvoiceListQuerySchema>;
export type RunInvoicesInput        = z.infer<typeof RunInvoicesSchema>;
export type IssueBatchInput         = z.infer<typeof IssueBatchSchema>;
export type PaymentListQuery        = z.infer<typeof PaymentListQuerySchema>;
export type ARAgingQuery            = z.infer<typeof ARAgingQuerySchema>;
export const CreateStaffDeductionSchema = z.object({
  userId:        z.string().min(1),
  // Same catalogue as guard deductions (NSSF, PAYE, advances); any non-empty
  // string is accepted rather than a hardcoded enum.
  type:          z.string().min(1),
  amount:        z.number().int().positive(),
  description:   z.string().min(5),
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
});

export const RunStaffPayrollSchema = z.object({
  month:   z.number().int().min(1).max(12),
  year:    z.number().int().min(2024).max(2030),
  // Explicit tick-list from the staff roster: finance unticks anyone who
  // should not be paid, so the server never silently decides the roster.
  userIds: z.array(z.string().min(1)).min(1, 'At least one staff member must be selected'),
});

export type CreateDeductionInput    = z.infer<typeof CreateDeductionSchema>;

export const CreateAllowanceSchema = z.object({
  guardId:       z.string().min(1),
  type:          z.string().min(1),
  amount:        z.number().int().positive(),
  description:   z.string().min(5),
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
});

export type CreateAllowanceInput = z.infer<typeof CreateAllowanceSchema>;

export interface AllowanceResponse {
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
export type RunPayrollInput         = z.infer<typeof RunPayrollSchema>;
export const SharePayrollSchema = z.object({
  formats: z.array(z.enum(['EXCEL', 'PDF'])).min(1, 'Pick at least one format'),
  // Internal staff accounts only; guard and client portal roles are refused
  // by the service so payroll schedules never reach them.
  userIds: z.array(z.string().min(1)).min(1, 'Pick at least one staff member'),
  note:    z.string().max(300).optional(),
});

export type CreateStaffDeductionInput = z.infer<typeof CreateStaffDeductionSchema>;
export type RunStaffPayrollInput      = z.infer<typeof RunStaffPayrollSchema>;
export type SharePayrollInput           = z.infer<typeof SharePayrollSchema>;
export type RejectPayrollInput      = z.infer<typeof RejectPayrollSchema>;
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
  /** Monthly run batch (RUN-YYYY-MM) that raised this; null for single creates. */
  runBatchId:     string | null;
  /** User ids behind the run: raised by / issued by; names resolved alongside. */
  issuedBy:       string | null;
  issuedAt:       string | null;
  /** Client-facing heading; always present (derived from the period when unset). */
  description:    string;
  createdByName:  string | null;
  issuedByName:   string | null;
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
  /** Day the money moved (cheque/transfer date); null on pre-feature rows. */
  paymentDate:     string | null;
  /** Cheque number for cheque/bank payments; null otherwise. */
  chequeNumber:    string | null;
  yoTransactionId: string | null;
  reconciled:      boolean;
  recordedBy:      string;
  /** PENDING_APPROVAL | APPROVED | REJECTED; rows predating approval are APPROVED. */
  status:          string;
  approvedBy:      string | null;
  approvedAt:      string | null;
  rejectedReason:  string | null;
  recordedByName:  string | null;
  /** Present on the payments list only: the invoice and client it sits on. */
  invoiceNumber?: string;
  clientName?:    string;
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

export interface AllowanceResponse {
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

export interface StaffDeductionResponse {
  id:               string;
  userId:           string;
  staffName:        string;
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
  // GUARD | STAFF. Guard runs may also carry a zone; staff runs are
  // company-wide (zoneId null) and pay User rows instead of guards.
  runType:        string;
  totalStaff:     number;
  // Null on company-wide runs (both current and legacy) — UI labels them "Company-wide".
  zoneId:         string | null;
  zoneName:       string | null;
  totalGuards:    number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  status:         string; // DRAFT | APPROVED | HR_APPROVED | DISBURSING | DISBURSED | REJECTED
  approvedBy:     string | null;
  approvedAt:     string | null;
  // Rejection trail — present once a DRAFT/APPROVED run has been rejected.
  rejectedBy:     string | null;
  rejectedAt:     string | null;
  rejectReason:   string | null;
  hrApprovedBy:   string | null;
  hrApprovedAt:   string | null;
  hrNotes:        string | null;
  mdApprovedBy:   string | null;
  mdApprovedAt:   string | null;
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
  // Exactly one payee holds: a guard, or a staff user on staff-only runs.
  guardId:             string | null;
  guardName:           string;
  guardPhone:          string | null;
  userId:              string | null;
  staffName:           string;
  staffPhone:          string | null;
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
  zoneId:         string | null;
  zoneName:       string | null;
  totalGuards:    number;
  totalStaff:     number;
  totalGross:     number;
  totalDeductions:number;
  totalNet:       number;
  byGuard:        PayslipResponse[];
  byStaff?:       PayslipResponse[];
}

// One live guard run inside a period's zone-totals summary.
export interface PayrollZoneTotal {
  runId:      string;
  zoneId:     string | null;
  zoneName:   string | null;
  status:     string;
  guards:     number;
  gross:      number;
  deductions: number;
  net:        number;
}

// Period totals for the Payroll tab: one row per live guard run (zone runs, or
// the single company-wide run) plus the countrywide total across them. Clicking
// a row drills into the run's payslips via GET /finance/payroll/:id.
export interface PayrollPeriodSummary {
  month:  number;
  year:   number;
  scope:  'ZONE' | 'COMPANY' | 'NONE';
  zones:  PayrollZoneTotal[];
  totals: { zones: number; guards: number; gross: number; deductions: number; net: number };
}

// One staff member as offered on the staff payroll tick-list.
export interface StaffPayrollMember {
  userId:       string;
  name:         string;
  systemId:     string | null;
  role:         string;
  salaryRate:   number | null;
  phone:        string | null;
  hasPhone:     boolean;
}

export interface PayrollShareRecipientResponse {
  userId:    string;
  staffName: string;
  readAt:    string | null;
}

export interface PayrollShareResponse {
  id:          string;
  payrollRunId: string;
  period:      string;
  runType:     string;
  format:      string;
  filename:    string;
  note:        string | null;
  generatedBy: string;
  createdAt:   string;
  recipients:  PayrollShareRecipientResponse[];
}

export interface StaffPayrollRosterResponse {
  month:   number;
  year:    number;
  members: StaffPayrollMember[];
}

// ── Zone payroll roster ────────────────────────────────────────────────────────

/**
 * One guard as offered on a zone's payroll tick-list. Attribution is decided
 * per period: a guard belongs to the zone with the most deployment days that
 * month, so exactly one roster row has assignedHere = true per guard; the
 * others show them greyed with assignedZoneName as the "Paid under …" hint.
 */
export interface ZonePayrollGuard {
  guardId:          string;
  name:             string;
  systemId:         string | null;
  employmentStatus: string;
  salaryRate:       number;
  /** Deployment days at this zone's sites during the period. */
  deploymentDays:   number;
  /** Attendance (PRESENT/LATE) days across all sites — the pro-rata basis. */
  attendanceDays:   number;
  assignedHere:     boolean;
  assignedZoneName: string | null;
}

export interface ZonePayrollSite {
  siteId:   string;
  siteName: string;
  guards:   ZonePayrollGuard[];
}

export interface ZonePayrollRoster {
  zoneId:             string;
  zoneName:           string;
  sites:              ZonePayrollSite[];
  assignedCount:      number;
  alsoElsewhereCount: number;
}

/** Whole-period roster: every active zone plus guards deployed only to un-zoned sites. */
export interface ZonePayrollRosterResponse {
  month:                 number;
  year:                  number;
  zones:                 ZonePayrollRoster[];
  unZonedGuardCount:     number;
}

// ── Company-wide payroll roster ────────────────────────────────────────────────

/**
 * One guard as offered on the company-wide payroll tick-list: every payable
 * guard deployed anywhere in the period, zone ignored. A guard appears once,
 * under the site where they had most deployment days — the site/zone names are
 * context only and play no part in who is paid.
 */
export interface CompanyPayrollGuard {
  guardId:          string;
  name:             string;
  systemId:         string | null;
  employmentStatus: string;
  salaryRate:       number;
  /** Deployment days across ALL sites during the period. */
  deploymentDays:   number;
  /** Attendance (PRESENT/LATE) days across all sites — the pro-rata basis. */
  attendanceDays:   number;
  primarySiteName:  string;
  primaryZoneName:  string | null;
}

/** One company-wide period: every deployed guard, grouped by their main site. */
export interface CompanyPayrollRosterResponse {
  month:      number;
  year:       number;
  // Grouped by site NAME — guards land under their majority-day site, which
  // may sit in any zone (or none), so the site id adds nothing the name isn't.
  sites:      Array<{ siteName: string; guards: CompanyPayrollGuard[] }>;
  guardCount: number;
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
