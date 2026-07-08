import api from './api';
import type {
  SystemErrorResponse,
  SystemErrorStats,
  UpdateErrorStatusInput,
  BulkUpdateErrorStatusInput,
  PaginatedResponse,
} from '@stap/shared';

export interface SystemErrorQueryParams {
  status?:   string;
  severity?: string;
  category?: string;
  search?:   string;
  page?:     number;
  limit?:    number;
  dateFrom?: string;
  dateTo?:   string;
}

export const systemErrorsApi = {
  list(params?: SystemErrorQueryParams): Promise<PaginatedResponse<SystemErrorResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<SystemErrorResponse>>('/system-errors', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getStats(): Promise<SystemErrorStats> {
    return api
      .get<{ success: boolean; data: SystemErrorStats }>('/system-errors/stats')
      .then((r) => r.data.data);
  },

  getById(id: string): Promise<SystemErrorResponse> {
    return api
      .get<{ success: boolean; data: SystemErrorResponse }>(`/system-errors/${id}`)
      .then((r) => r.data.data);
  },

  updateStatus(id: string, data: UpdateErrorStatusInput): Promise<SystemErrorResponse> {
    return api
      .patch<{ success: boolean; data: SystemErrorResponse }>(`/system-errors/${id}/status`, data)
      .then((r) => r.data.data);
  },

  bulkUpdateStatus(data: BulkUpdateErrorStatusInput): Promise<{ updated: number }> {
    return api
      .patch<{ success: boolean; data: { updated: number } }>('/system-errors/bulk', data)
      .then((r) => r.data.data);
  },
};
