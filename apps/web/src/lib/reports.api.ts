import api from './api';
import type {
  DirectorDashboardStats, ScheduledReportInput, ScheduledReportRecord,
  IncomeExpensesReport, BusinessAnalysisReport,
} from '@security360/shared';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const reportsApi = {
  getDirectorDashboard(): Promise<DirectorDashboardStats> {
    return api.get('/reports/dashboard/director').then(r => r.data.data);
  },

  async downloadDailyOps(date?: string): Promise<void> {
    const params = { format: 'excel', ...(date && { date }) };
    const r = await api.get('/reports/daily-ops', { params, responseType: 'blob' });
    triggerDownload(r.data, `daily-ops-${date ?? 'today'}.xlsx`);
  },

  async downloadARAgingExcel(): Promise<void> {
    const r = await api.get('/reports/ar-aging', { params: { format: 'excel' }, responseType: 'blob' });
    triggerDownload(r.data, 'ar-aging.xlsx');
  },

  async downloadPayrollExcel(month: number, year: number): Promise<void> {
    const r = await api.get(`/reports/payroll/${month}/${year}`, { params: { format: 'excel' }, responseType: 'blob' });
    triggerDownload(r.data, `payroll-${year}-${month}.xlsx`);
  },

  getPayroll(month: number, year: number): Promise<{
    month: number; year: number;
    runs: Array<{
      id: string; runType: string; status: string; zoneName: string;
      totalGuards: number; totalStaff: number; totalGross: number;
      totalDeductions: number; totalNet: number;
      payslips: Array<{
        id: string; name: string; grossSalary: number; totalDeductions: number;
        netSalary: number; phone: string; daysWorked: number; disbursementStatus: string;
      }>;
    }>;
    totals: { runs: number; payslips: number; gross: number; deductions: number; net: number };
    hasPayroll: boolean;
  }> {
    return api.get(`/reports/payroll/${month}/${year}`, { params: { format: 'json' } }).then(r => r.data.data);
  },

  async downloadInventoryLedger(): Promise<void> {
    const r = await api.get('/reports/inventory-ledger', { params: { format: 'excel' }, responseType: 'blob' });
    triggerDownload(r.data, 'inventory-ledger.xlsx');
  },

  getDeploymentReport(params: { month: number; year: number; day?: number }): Promise<any> {
    return api.get('/reports/deployment', { params }).then(r => r.data.data);
  },

  getIncomeExpenses(month: number, year: number): Promise<IncomeExpensesReport> {
    return api
      .get('/reports/income-expenses', { params: { month, year } })
      .then(r => r.data.data);
  },

  getBusinessAnalysis(month: number, year: number): Promise<BusinessAnalysisReport> {
    return api
      .get('/reports/business-analysis', { params: { month, year } })
      .then(r => r.data.data);
  },

  async downloadBusinessAnalysisExcel(month: number, year: number): Promise<void> {
    const r = await api.get('/reports/business-analysis', {
      params: { month, year, format: 'excel' },
      responseType: 'blob',
    });
    triggerDownload(r.data, `business-analysis-${year}-${String(month).padStart(2, '0')}.xlsx`);
  },

  async downloadIncomeExpensesExcel(month: number, year: number): Promise<void> {
    const r = await api.get('/reports/income-expenses', {
      params: { month, year, format: 'excel' },
      responseType: 'blob',
    });
    triggerDownload(r.data, `income-expenses-${year}-${String(month).padStart(2, '0')}.xlsx`);
  },

  getScheduledReports(): Promise<ScheduledReportRecord[]> {
    return api.get('/reports/scheduled').then(r => r.data.data);
  },

  createScheduledReport(data: ScheduledReportInput): Promise<ScheduledReportRecord> {
    return api.post('/reports/scheduled', data).then(r => r.data.data);
  },

  deleteScheduledReport(id: string): Promise<void> {
    return api.delete(`/reports/scheduled/${id}`).then(() => undefined);
  },
};
