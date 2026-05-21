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
