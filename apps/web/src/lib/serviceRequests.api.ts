import api from './api';
import type {
  ServiceRequestResponse,
  ServiceRequestSummary,
  UpdateServiceRequestInput,
  PaginatedResponse,
} from '@stap/shared';

export interface ServiceRequestFilters {
  status?:   string;
  clientId?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?:   string;
  page?:     number;
  limit?:    number;
}

/** Staff-side service requests — every client's, unlike the portal endpoints. */
export const serviceRequestsApi = {
  list(params: ServiceRequestFilters): Promise<PaginatedResponse<ServiceRequestResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ServiceRequestResponse>>('/service-requests', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getSummary(): Promise<ServiceRequestSummary> {
    return api
      .get<{ success: boolean; data: ServiceRequestSummary }>('/service-requests/summary')
      .then((r) => r.data.data);
  },

  updateStatus(id: string, data: UpdateServiceRequestInput): Promise<ServiceRequestResponse> {
    return api
      .patch<{ success: boolean; data: ServiceRequestResponse }>(`/service-requests/${id}/status`, data)
      .then((r) => r.data.data);
  },
};
