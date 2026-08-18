import api from './api';
import type { AuditLogEntry, AuditLogListResult } from '@stap/shared';

export interface AuditLogFilters {
  action?:   string;
  entity?:   string;
  userId?:   string;
  dateFrom?: string;
  dateTo?:   string;
  search?:   string;
  page?:     number;
  limit?:    number;
}

export const auditLogsApi = {
  list(params: AuditLogFilters): Promise<AuditLogListResult> {
    return api
      .get<{ success: boolean; data: AuditLogListResult }>('/audit-logs', { params })
      .then((r) => r.data.data);
  },

  getById(id: string): Promise<AuditLogEntry> {
    return api
      .get<{ success: boolean; data: AuditLogEntry }>(`/audit-logs/${id}`)
      .then((r) => r.data.data);
  },
};
