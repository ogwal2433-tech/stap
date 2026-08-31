import api from './api';
import type { ShiftReportInput, ShiftReportResponse } from '@stap/shared';

export interface ShiftReportListResult {
  data:  ShiftReportResponse[];
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export interface ShiftReportFilters {
  shift?:    string;
  status?:   string;
  dateFrom?: string;
  dateTo?:   string;
  page?:     number;
  limit?:    number;
}

export const shiftReportsApi = {
  formOptions(): Promise<{ zones: string[] }> {
    return api.get('/shift-reports/form-options').then(r => r.data.data);
  },

  list(filters: ShiftReportFilters = {}): Promise<ShiftReportListResult> {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return api.get(`/shift-reports?${q.toString()}`).then(r => r.data);
  },

  get(id: string): Promise<ShiftReportResponse> {
    return api.get(`/shift-reports/${id}`).then(r => r.data.data);
  },

  create(body: ShiftReportInput): Promise<ShiftReportResponse> {
    return api.post('/shift-reports', body).then(r => r.data.data);
  },

  update(id: string, body: ShiftReportInput): Promise<ShiftReportResponse> {
    return api.patch(`/shift-reports/${id}`, body).then(r => r.data.data);
  },

  acknowledge(id: string): Promise<ShiftReportResponse> {
    return api.patch(`/shift-reports/${id}/acknowledge`).then(r => r.data.data);
  },

  /** The browser cannot follow the URL directly — the PDF route needs the token. */
  async downloadPdf(id: string, filename: string): Promise<void> {
    const res  = await api.get(`/shift-reports/${id}/pdf`, { responseType: 'blob' });
    const url  = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
