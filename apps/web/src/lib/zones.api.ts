import api from './api';
import type { ZoneResponse, ZoneRosterData, PaginatedResponse, CreateZoneInput, UpdateZoneInput } from '@stap/shared';

export const zonesApi = {
  list(params?: { page?: number; limit?: number; isActive?: boolean; search?: string }): Promise<PaginatedResponse<ZoneResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ZoneResponse>>('/zones', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  myZones(): Promise<ZoneResponse[]> {
    return api
      .get<{ success: boolean; data: ZoneResponse[] }>('/zones/my-zones')
      .then((r) => r.data.data);
  },

  getById(id: string): Promise<ZoneResponse> {
    return api
      .get<{ success: boolean; data: ZoneResponse }>(`/zones/${id}`)
      .then((r) => r.data.data);
  },

  getRosterData(zoneId: string, date: string): Promise<ZoneRosterData> {
    return api
      .get<{ success: boolean; data: ZoneRosterData }>(`/zones/${zoneId}/roster-data`, { params: { date } })
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
};
