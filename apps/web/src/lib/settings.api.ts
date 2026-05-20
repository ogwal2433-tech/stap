import api from './api';
import type {
  SystemSettingResponse,
  UserResponse,
  PaginatedResponse,
  UserRole,
  GuardRankResponse,
  CreateGuardRankInput,
  UpdateGuardRankInput,
  DeductionTypeResponse,
  CreateDeductionTypeInput,
  UpdateDeductionTypeInput,
} from '@stap/shared';

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

  // ── Guard Ranks ──────────────────────────────────────────────────────────────

  getRanks(activeOnly = true): Promise<GuardRankResponse[]> {
    return api
      .get<{ success: boolean; data: GuardRankResponse[] }>('/settings/ranks', {
        params: { activeOnly: activeOnly ? 'true' : 'false' },
      })
      .then((r) => r.data.data);
  },

  createRank(data: CreateGuardRankInput): Promise<GuardRankResponse> {
    return api
      .post<{ success: boolean; data: GuardRankResponse }>('/settings/ranks', data)
      .then((r) => r.data.data);
  },

  updateRank(id: string, data: UpdateGuardRankInput): Promise<GuardRankResponse> {
    return api
      .patch<{ success: boolean; data: GuardRankResponse }>(`/settings/ranks/${id}`, data)
      .then((r) => r.data.data);
  },

  deactivateRank(id: string): Promise<{ rank: GuardRankResponse; guardsWithRank: number }> {
    return api
      .patch<{ success: boolean; data: GuardRankResponse; guardsWithRank: number }>(`/settings/ranks/${id}/deactivate`)
      .then((r) => ({ rank: r.data.data, guardsWithRank: r.data.guardsWithRank }));
  },

  activateRank(id: string): Promise<GuardRankResponse> {
    return api
      .patch<{ success: boolean; data: GuardRankResponse }>(`/settings/ranks/${id}/activate`)
      .then((r) => r.data.data);
  },

  deleteRank(id: string): Promise<void> {
    return api.delete(`/settings/ranks/${id}`).then(() => undefined);
  },

  reorderRanks(orderedIds: string[]): Promise<GuardRankResponse[]> {
    return api
      .put<{ success: boolean; data: GuardRankResponse[] }>('/settings/ranks/reorder', { orderedIds })
      .then((r) => r.data.data);
  },

  // ── Deduction Types ──────────────────────────────────────────────────────────

  getDeductionTypes(activeOnly = true): Promise<DeductionTypeResponse[]> {
    return api
      .get<{ success: boolean; data: DeductionTypeResponse[] }>('/settings/deduction-types', {
        params: { activeOnly: activeOnly ? 'true' : 'false' },
      })
      .then((r) => r.data.data);
  },

  createDeductionType(data: CreateDeductionTypeInput): Promise<DeductionTypeResponse> {
    return api
      .post<{ success: boolean; data: DeductionTypeResponse }>('/settings/deduction-types', data)
      .then((r) => r.data.data);
  },

  updateDeductionType(id: string, data: UpdateDeductionTypeInput): Promise<DeductionTypeResponse> {
    return api
      .patch<{ success: boolean; data: DeductionTypeResponse }>(`/settings/deduction-types/${id}`, data)
      .then((r) => r.data.data);
  },

  deactivateDeductionType(id: string): Promise<DeductionTypeResponse> {
    return api
      .patch<{ success: boolean; data: DeductionTypeResponse }>(`/settings/deduction-types/${id}/deactivate`)
      .then((r) => r.data.data);
  },

  activateDeductionType(id: string): Promise<DeductionTypeResponse> {
    return api
      .patch<{ success: boolean; data: DeductionTypeResponse }>(`/settings/deduction-types/${id}/activate`)
      .then((r) => r.data.data);
  },

  deleteDeductionType(id: string): Promise<void> {
    return api.delete(`/settings/deduction-types/${id}`).then(() => undefined);
  },

  reorderDeductionTypes(orderedIds: string[]): Promise<DeductionTypeResponse[]> {
    return api
      .put<{ success: boolean; data: DeductionTypeResponse[] }>('/settings/deduction-types/reorder', { orderedIds })
      .then((r) => r.data.data);
  },
};
