import { z } from 'zod';

export const REPORT_KEYS = [
  'daily_operations_report', 'monthly_payroll_report', 'pipeline_report', 'prospects_report',
  'closed_business_report', 'bid_performance_report', 'marketing_performance_report',
  'shift_handover_report', 'invoice', 'receivables_aging_report',
] as const;
export type ReportKey = typeof REPORT_KEYS[number];
export type ReportTitleConfig = {
  title: string;
  shortTitle?: string;
  subtitle?: string;
  footerText?: string;
  logoUrl?: string;
  enabled: boolean;
};
export type ReportTitlesMap = Record<ReportKey, ReportTitleConfig>;
export const ReportTitleConfigSchema = z.object({
  title: z.string(), shortTitle: z.string().optional(), subtitle: z.string().optional(),
  footerText: z.string().optional(), logoUrl: z.string().optional(), enabled: z.boolean(),
}).strict();
export const ReportTitleConfigPatchSchema = ReportTitleConfigSchema.partial();
export const ReportTitlesMapSchema = z.record(z.enum(REPORT_KEYS), ReportTitleConfigSchema);

const config = (title: string, shortTitle?: string): ReportTitleConfig => ({
  title, shortTitle: shortTitle ?? title, subtitle: '', footerText: '', logoUrl: '', enabled: true,
});
export const REPORT_TITLE_DEFAULTS: ReportTitlesMap = {
  daily_operations_report: config('Daily Operations Report', 'STAP Security — Daily Operations Report'),
  monthly_payroll_report: config('Monthly Payroll Report', 'STAP Security — Payroll Report'),
  pipeline_report: config('Pipeline Report'), prospects_report: config('Prospects Report'),
  closed_business_report: config('Closed Business Report'), bid_performance_report: config('Bid Performance Report'),
  marketing_performance_report: config('Marketing Performance Report'),
  shift_handover_report: config('CONTROL ROOM SHIFT HANDOVER REPORT'),
  invoice: config('Invoice'),
  receivables_aging_report: config('Accounts Receivable Aging Report', 'AR Aging'),
};

export function resolveReportTitle(key: ReportKey, overrides?: Partial<ReportTitlesMap> | null): ReportTitleConfig {
  const base = REPORT_TITLE_DEFAULTS[key];
  const override: Partial<ReportTitleConfig> = overrides?.[key] ?? {};
  const result: ReportTitleConfig = { ...base, ...override };
  for (const field of ['title', 'shortTitle', 'subtitle', 'footerText', 'logoUrl'] as const) {
    if (field in result && !result[field]?.trim()) result[field] = base[field] ?? '';
  }
  if (override.enabled === undefined) result.enabled = base.enabled;
  return result;
}
