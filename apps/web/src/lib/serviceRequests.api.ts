import api from './api';
import type {
  ServiceRequestResponse,
  CreateServiceRequestInput,
  UpdateServiceRequestInput,
  PaginatedResponse,
} from '@stap/shared';

export const serviceRequestsApi = {
  listByClient(clientId: string, page = 1, limit = 50): Promise<PaginatedResponse<ServiceRequestResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ServiceRequestResponse>>(`/service-requests/client/${clientId}`, { params: { page, limit } })
      .then((r) => r.data);
  },

  listAll(params?: { status?: string; clientId?: string; page?: number; limit?: number }): Promise<PaginatedResponse<ServiceRequestResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ServiceRequestResponse>>('/service-requests', { params })
      .then((r) => r.data);
  },

  create(data: CreateServiceRequestInput): Promise<ServiceRequestResponse> {
    return api
      .post<{ success: boolean; data: ServiceRequestResponse }>('/service-requests', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: UpdateServiceRequestInput): Promise<ServiceRequestResponse> {
    return api
      .patch<{ success: boolean; data: ServiceRequestResponse }>(`/service-requests/${id}`, data)
      .then((r) => r.data.data);
  },

  delete(id: string): Promise<void> {
    return api.delete(`/service-requests/${id}`).then(() => undefined);
  },
};
