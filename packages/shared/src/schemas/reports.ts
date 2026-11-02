import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const ReportQuerySchema = z.object({
  from:    z.string().datetime().optional(),
  to:      z.string().datetime().optional(),
  siteId:  z.string().min(1).optional(),
  guardId: z.string().min(1).optional(),
  format:  z.enum(['json', 'excel', 'pdf']).default('json'),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

export const ScheduledReportSchema = z.object({
  name:       z.string().min(3),
  reportType: z.enum(['DAILY_OPS', 'WEEKLY_PAYROLL_ESTIMATE', 'MONTHLY_AR_AGING', 'MONTHLY_PAYROLL']),
  schedule:   z.string().describe('cron expression'),
  recipients: z.array(z.string().email()).min(1),
  isActive:   z.boolean().default(true),
});
export type ScheduledReportInput = z.infer<typeof ScheduledReportSchema>;

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface DirectorDashboardStats {
  operations: {
    guardsDeployedToday:     number;
    guardsAbsentToday:       number;
    sitesWithIssues:         number;
    supervisorCheckinsToday: number;
    openComplaints:          number;
    pendingApprovals:        number;
  };
  finance: {
    monthlyRevenue:       number;
    outstandingAR:        number;
    payrollCostThisMonth: number;
    overdueInvoices:      number;
  };
  hr: {
    totalActiveGuards: number;
    newThisMonth:      number;
    expiringContracts: number;
    openDisciplinary:  number;
  };
  revenueVsPayroll: {
    month:   string;
    revenue: number;
    payroll: number;
  }[];
  attendanceTrend: {
    date:    string;
    present: number;
    absent:  number;
  }[];
}

export interface ScheduledReportRecord {
  id:         string;
  name:       string;
  reportType: string;
  schedule:   string;
  recipients: string[];
  isActive:   boolean;
  lastRunAt:  string | null;
  nextRunAt:  string | null;
  createdBy:  string;
  createdAt:  string;
}

/**
 * "How much did I make this month?" — cash actually moved in the period, from
 * the cashbook (approved client payments in; payroll, requisition payouts and
 * recorded expenses out), grouped for the MD's month filter.
 */
export interface IncomeExpensesReport {
  month: number;
  year:  number;
  /** Opening cash position carried from before the period. */
  openingBalance: number;
  /** Cash actually received in the period (ledger IN rows). */
  totalIn:        number;
  /**
   * What the period spent — approved payroll runs (by their service
   * month, split guards vs staff) + requisitions handed out (assigned/
   * in-progress/completed, by the date they were raised) + manual
   * ledger expenses. This is the "money out" that makes net revenue
   * honest, whether or not the cash has left the bank yet.
   */
  totalOut:       number;
  /** Money that actually left the bank in the period (all ledger OUT rows). */
  paidOut:        number;
  /** totalIn - totalOut: the MD's "how much did I make?". */
  netRevenue:     number;
  /** Cash position after the period's real movements (opening + in - paidOut). */
  closingBalance: number;
  /** Money in grouped by cashbook category (CLIENT_PAYMENT, .). */
  income:   { category: string; count: number; amount: number }[];
  /**
   * Money out: PAYROLL and REQUISITION are read from the runs and
   * requisitions themselves (never from the ledger copy, so a payout can
   * never be counted twice); everything else is a manual ledger expense.
   */
  expenses: {
    source:  'PAYROLL' | 'REQUISITION' | 'MANUAL';
    category: string;
    count:    number;
    amount:   number;
  }[];
  /**
   * The period's rows, chronological: real ledger movements plus one row per
   * committed run/requisition so the detail table explains the Out figure.
   */
  entries: {
    date:        string;
    description: string;
    category:    string;
    type:        'IN' | 'OUT';
    amount:      number;
    /** LEDGER = the money moved; COMMITTED = approved spend, not (yet) paid. */
    source:      'LEDGER' | 'COMMITTED';
  }[];
}

/**
 * The MD's "how is the business doing?" — which client pays us most, which
 * cost eats us most, and the six-month money in/out shape, for one service
 * month. Client payments are matched by their invoices' service month (the
 * same dating the cashbook ledger uses), costs reuse the Income & Expenses
 * expense split, and the trend reads the ledger so the figures can never
 * disagree with the month report.
 */
export interface BusinessAnalysisReport {
  month: number;
  year:  number;
  /** The month's money in (ledger IN rows) — the denominator for client shares. */
  totalIn:  number;
  /** The month's committed money out (same basis as Income & Expenses). */
  totalOut: number;
  /** Biggest paying clients of the month, sorted by amount, capped at 10. */
  topClients: {
    clientId:   string;
    clientName: string;
    /** Distinct invoices of the month that this client has paid into. */
    invoices:   number;
    amount:     number;
    /** Share of the month's money in, percent rounded to one decimal. */
    share:      number;
  }[];
  /** Cost lines of the month, biggest first — same shape as the I&E report. */
  costs: IncomeExpensesReport['expenses'];
  /** The trailing six months including the selected one, oldest first. */
  trend: {
    key:     string; // YYYY-MM
    label:   string; // 'May'
    moneyIn: number;
    /** Committed-basis money out for that month, straight from the ledger. */
    moneyOut: number;
    net:      number;
  }[];
  /**
   * What needs doing *now* — a live snapshot, deliberately not scoped to the
   * selected month: payments waiting on the MD's approval, and the overdue
   * invoices to chase. The charts explain the past; this block acts on it.
   */
  actions: {
    /** Manual payments awaiting approval, oldest first, capped at 10. */
    pendingPayments: {
      id:            string;
      invoiceNumber: string;
      clientName:    string;
      amount:        number;
      mode:          string;
      paymentDate:   string | null;
      createdAt:     string;
    }[];
    /** Sum of every pending payment, not just the listed ones. */
    pendingTotal: number;
    /** How many payments are pending overall — the list above caps at 10. */
    pendingCount: number;
    /** Overdue invoices by amount owed, worst first, capped at 10. */
    overdueInvoices: {
      id:            string;
      invoiceNumber: string;
      clientName:    string;
      outstanding:   number;
      dueDate:       string;
      /** Whole days past the due date, floored at 0. */
      daysOverdue:   number;
    }[];
    /** Full-population overdue figures — the list above is capped at 10. */
    overdueCount: number;
    overdueTotal: number;
  };
}
