import api from './api';
import type { SystemSettingResponse, UserResponse, PaginatedResponse, UserRole } from '@stap/shared';

export const settingsApi = {
  getAll(): Promise<SystemSettingResponse[]> {
    return api
      .get<{ success: boolean; data: SystemSettingResponse[] }>('/settings')
      .then((r) => r.data.data);
  },

  getGroup(group: string): Promise<SystemSettingResponse[]> {
    return api
      .get<{ success: boolean; data: SystemSettingResponse[] }>(`/settings/group/${group}`)
      .then((r) => r.data.data);
  },

  updateMany(settings: { key: string; value: string }[]): Promise<SystemSettingResponse[]> {
    return api
      .patch<{ success: boolean; data: SystemSettingResponse[] }>('/settings', { settings })
      .then((r) => r.data.data);
  },

  listUsers(params?: { role?: string; status?: string; page?: number; limit?: number }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<UserResponse>>('/settings/users', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  createUser(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<UserResponse> {
    return api
      .post<{ success: boolean; data: UserResponse }>('/settings/users', data)
      .then((r) => r.data.data);
  },

  updateUser(
    id: string,
    data: { name?: string; role?: UserRole; status?: string },
  ): Promise<UserResponse> {
    return api
      .patch<{ success: boolean; data: UserResponse }>(`/settings/users/${id}`, data)
      .then((r) => r.data.data);
  },

  resetPassword(id: string, newPassword: string): Promise<void> {
    return api
      .post(`/settings/users/${id}/reset-password`, { newPassword })
      .then(() => undefined);
  },

  deactivateUser(id: string): Promise<void> {
    return api
      .post(`/settings/users/${id}/deactivate`)
      .then(() => undefined);
  },
};
