import api from './api';
import type {
  ClientContactInput,
  ClientContactResponse,
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
  SiteShiftResponse,
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

  // ── Contact persons ────────────────────────────────────────────────────────

  contacts(clientId: string): Promise<ClientContactResponse[]> {
    return api
      .get<{ success: boolean; data: ClientContactResponse[] }>(`/clients/${clientId}/contacts`)
      .then((r) => r.data.data);
  },

  addContact(clientId: string, data: ClientContactInput): Promise<ClientContactResponse> {
    return api
      .post<{ success: boolean; data: ClientContactResponse }>(`/clients/${clientId}/contacts`, data)
      .then((r) => r.data.data);
  },

  updateContact(
    clientId: string,
    contactId: string,
    data: Partial<ClientContactInput>,
  ): Promise<ClientContactResponse> {
    return api
      .patch<{ success: boolean; data: ClientContactResponse }>(
        `/clients/${clientId}/contacts/${contactId}`, data,
      )
      .then((r) => r.data.data);
  },

  deleteContact(clientId: string, contactId: string): Promise<void> {
    return api.delete(`/clients/${clientId}/contacts/${contactId}`).then(() => undefined);
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

  /**
   * Reads go to /sites, which is gated on sites.view rather than on the client
   * roles — a Trainer deploying a firearm needs the site list and has no client
   * access. Site writes and incidents stay under /clients below.
   */
  getAllSites(params?: { page?: number; limit?: number; search?: string; clientId?: string; unzoned?: string }): Promise<PaginatedResponse<SiteResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<SiteResponse>>('/sites', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getSite(siteId: string): Promise<SiteResponse> {
    return api
      .get<{ success: boolean; data: SiteResponse }>(`/sites/${siteId}`)
      .then((r) => r.data.data);
  },

  /** The shift a site deploys on — fills the deployment sheet's Shift column. */
  getSiteShift(siteId: string): Promise<SiteShiftResponse> {
    return api
      .get<{ success: boolean; data: SiteShiftResponse }>(`/sites/${siteId}/shift`)
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
