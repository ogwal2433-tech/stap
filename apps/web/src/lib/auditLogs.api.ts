import api from './api';
import type { AuditLogEntry, AuditLogListResult, SecurityLogResult } from '@security360/shared';

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

export interface SecurityLogFilters {
  action?:   string;
  role?:     string;
  userId?:   string;
  dateFrom?: string;
  dateTo?:   string;
  page?:     number;
  limit?:    number;
}

export const auditLogsApi = {
  /** Refused requests and sign-in failures, with a seven-day summary. */
  security(params: SecurityLogFilters): Promise<SecurityLogResult> {
    return api
      .get<{ success: boolean; data: SecurityLogResult }>('/audit-logs/security', { params })
      .then((r) => r.data.data);
  },

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
