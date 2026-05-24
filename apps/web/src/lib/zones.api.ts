import api from './api';
import type {
  ZoneResponse,
  ZoneSummaryResponse,
  CreateZoneInput,
  UpdateZoneInput,
} from '@stap/shared';

export const zonesApi = {
  list(activeOnly = false): Promise<ZoneSummaryResponse[]> {
    return api
      .get<{ success: boolean; data: ZoneSummaryResponse[] }>('/zones', {
        params: activeOnly ? { active: 'true' } : undefined,
      })
      .then((r) => r.data.data);
  },

  getById(id: string): Promise<ZoneResponse> {
    return api
      .get<{ success: boolean; data: ZoneResponse }>(`/zones/${id}`)
      .then((r) => r.data.data);
  },

  create(data: CreateZoneInput): Promise<ZoneResponse> {
    return api
      .post<{ success: boolean; data: ZoneResponse }>('/zones', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: UpdateZoneInput): Promise<ZoneResponse> {
    return api
      .patch<{ success: boolean; data: ZoneResponse }>(`/zones/${id}`, data)
      .then((r) => r.data.data);
  },

  assignSites(id: string, siteIds: string[]): Promise<ZoneResponse> {
    return api
      .post<{ success: boolean; data: ZoneResponse }>(`/zones/${id}/sites`, { siteIds })
      .then((r) => r.data.data);
  },

  removeSites(id: string, siteIds: string[]): Promise<ZoneResponse> {
    return api
      .delete<{ success: boolean; data: ZoneResponse }>(`/zones/${id}/sites`, { data: { siteIds } })
      .then((r) => r.data.data);
  },

  deactivate(id: string): Promise<ZoneResponse> {
    return api
      .patch<{ success: boolean; data: ZoneResponse }>(`/zones/${id}/deactivate`)
      .then((r) => r.data.data);
  },

  activate(id: string): Promise<ZoneResponse> {
    return api
      .patch<{ success: boolean; data: ZoneResponse }>(`/zones/${id}/activate`)
      .then((r) => r.data.data);
  },

  delete(id: string): Promise<void> {
    return api.delete(`/zones/${id}`).then(() => undefined);
  },
};
