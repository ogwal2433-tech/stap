import api from './api';
import type {
  StaffResponse,
  StaffListResponse,
  CreateStaffInput,
  UpdateStaffInput,
} from '@stap/shared';

export interface StaffListParams {
  role?:     string;
  isActive?: boolean;
  search?:   string;
  page?:     number;
  limit?:    number;
}

export const staffApi = {
  list(params: StaffListParams = {}): Promise<StaffListResponse> {
    return api
      .get<{ success: boolean; data: StaffListResponse }>('/staff', {
        params: {
          ...(params.role ? { role: params.role } : {}),
          ...(params.isActive !== undefined ? { isActive: String(params.isActive) } : {}),
          ...(params.search?.trim() ? { search: params.search.trim() } : {}),
          page:  params.page ?? 1,
          limit: params.limit ?? 20,
        },
      })
      .then((r) => r.data.data);
  },

  getById(id: string): Promise<StaffResponse> {
    return api
      .get<{ success: boolean; data: StaffResponse }>(`/staff/${id}`)
      .then((r) => r.data.data);
  },

  create(data: CreateStaffInput): Promise<StaffResponse> {
    return api
      .post<{ success: boolean; data: StaffResponse }>('/staff', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: UpdateStaffInput): Promise<StaffResponse> {
    return api
      .patch<{ success: boolean; data: StaffResponse }>(`/staff/${id}`, data)
      .then((r) => r.data.data);
  },

  deactivate(id: string, reason: string): Promise<StaffResponse> {
    return api
      .patch<{ success: boolean; data: StaffResponse }>(`/staff/${id}/deactivate`, { reason })
      .then((r) => r.data.data);
  },

  reactivate(id: string): Promise<StaffResponse> {
    return api
      .patch<{ success: boolean; data: StaffResponse }>(`/staff/${id}/reactivate`)
      .then((r) => r.data.data);
  },

  /** Only an account that never signed in; anyone else is deactivated instead. */
  remove(id: string): Promise<{ id: string; name: string }> {
    return api.delete(`/staff/${id}`).then((r) => r.data.data);
  },

  restore(id: string): Promise<{ id: string; name: string }> {
    return api.post(`/staff/${id}/restore`).then((r) => r.data.data);
  },

  resetPassword(id: string): Promise<void> {
    return api.post(`/staff/${id}/reset-password`).then(() => undefined);
  },
};
