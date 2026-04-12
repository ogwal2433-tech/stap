import api from './api';
import type {
  ClientResponse,
  ClientSummary,
  SiteResponse,
  IncidentResponse,
  PaginatedResponse,
  ClientListQuery,
  CreateClientInput,
  UpdateClientInput,
  CreateSiteInput,
  UpdateSiteInput,
  CreateIncidentInput,
} from '@stap/shared';

export const clientsApi = {
  list(params?: Partial<ClientListQuery>): Promise<PaginatedResponse<ClientResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ClientResponse>>('/clients', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getById(id: string): Promise<ClientResponse> {
    return api
      .get<{ success: boolean; data: ClientResponse }>(`/clients/${id}`)
      .then((r) => r.data.data);
  },

  create(data: CreateClientInput): Promise<ClientResponse> {
    return api
      .post<{ success: boolean; data: ClientResponse }>('/clients', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: Partial<UpdateClientInput>): Promise<ClientResponse> {
    return api
      .patch<{ success: boolean; data: ClientResponse }>(`/clients/${id}`, data)
      .then((r) => r.data.data);
  },

  archive(id: string): Promise<ClientResponse> {
    return api
      .patch<{ success: boolean; data: ClientResponse }>(`/clients/${id}/archive`)
      .then((r) => r.data.data);
  },

  getSummary(): Promise<ClientSummary> {
    return api
      .get<{ success: boolean; data: ClientSummary }>('/clients/summary')
      .then((r) => r.data.data);
  },

  getSites(clientId: string): Promise<SiteResponse[]> {
    return api
      .get<{ success: boolean; data: SiteResponse[] }>(`/clients/${clientId}/sites`)
      .then((r) => r.data.data);
  },

  createSite(clientId: string, data: Omit<CreateSiteInput, 'clientId'>): Promise<SiteResponse> {
    return api
      .post<{ success: boolean; data: SiteResponse }>(`/clients/${clientId}/sites`, data)
      .then((r) => r.data.data);
  },

  getAllSites(params?: { page?: number; limit?: number; search?: string; clientId?: string }): Promise<PaginatedResponse<SiteResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<SiteResponse>>('/clients/sites/all', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getSite(siteId: string): Promise<SiteResponse> {
    return api
      .get<{ success: boolean; data: SiteResponse }>(`/clients/sites/${siteId}`)
      .then((r) => r.data.data);
  },

  updateSite(siteId: string, data: Partial<UpdateSiteInput>): Promise<SiteResponse> {
    return api
      .patch<{ success: boolean; data: SiteResponse }>(`/clients/sites/${siteId}`, data)
      .then((r) => r.data.data);
  },

  deleteSite(siteId: string): Promise<void> {
    return api.delete(`/clients/sites/${siteId}`).then(() => undefined);
  },

  createIncident(siteId: string, data: Omit<CreateIncidentInput, 'siteId'>): Promise<IncidentResponse> {
    return api
      .post<{ success: boolean; data: IncidentResponse }>(
        `/clients/sites/${siteId}/incidents`,
        { ...data, siteId },
      )
      .then((r) => r.data.data);
  },

  getSiteIncidents(
    siteId: string,
    page = 1,
  ): Promise<PaginatedResponse<IncidentResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<IncidentResponse>>(
        `/clients/sites/${siteId}/incidents`,
        { params: { page, limit: 20 } },
      )
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },
};
