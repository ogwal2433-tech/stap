import api from './api';
import type { DirectorDashboardStats, ScheduledReportInput, ScheduledReportRecord } from '@stap/shared';

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

  async downloadInventoryLedger(): Promise<void> {
    const r = await api.get('/reports/inventory-ledger', { params: { format: 'excel' }, responseType: 'blob' });
    triggerDownload(r.data, 'inventory-ledger.xlsx');
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
