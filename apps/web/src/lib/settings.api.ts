import api from './api';
import type {
  StaffPositionResponse,
  CreateStaffPositionInput,
  UpdateStaffPositionInput,
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
  ShiftTypeResponse,
  CreateShiftTypeInput,
  UpdateShiftTypeInput,
  ReportKey, ReportTitleConfig, ReportTitlesMap,
  CompanyBranding, CompanyBrandingKey,
  CompanyBankAccountResponse, CompanyBankAccountCreateInput, CompanyBankAccountUpdateInput,
} from '@security360/shared';

export const settingsApi = {
  getCompanyBranding(): Promise<CompanyBranding> {
    return api.get<{ data: CompanyBranding }>('/settings/company-branding').then(r => r.data.data);
  },
  getCompanyBrandingDefaults(): Promise<CompanyBranding> {
    return api.get<{ data: CompanyBranding }>('/settings/company-branding/defaults').then(r => r.data.data);
  },
  updateCompanyBranding(values: Partial<CompanyBranding>): Promise<CompanyBranding> {
    return api.patch<{ data: CompanyBranding }>('/settings/company-branding', values).then(r => r.data.data);
  },
  resetCompanyBranding(keys?: CompanyBrandingKey[]): Promise<CompanyBranding> {
    return api.post<{ data: CompanyBranding }>('/settings/company-branding/reset', keys ? { keys } : {}).then(r => r.data.data);
  },
  // ── Company payment accounts ──────────────────────────────────────────────
  listCompanyBankAccounts(): Promise<CompanyBankAccountResponse[]> {
    return api.get<{ success: boolean; data: CompanyBankAccountResponse[] }>('/settings/company-bank-accounts').then(r => r.data.data);
  },
  createCompanyBankAccount(data: CompanyBankAccountCreateInput): Promise<CompanyBankAccountResponse> {
    return api.post<{ success: boolean; data: CompanyBankAccountResponse }>('/settings/company-bank-accounts', data).then(r => r.data.data);
  },
  updateCompanyBankAccount(id: string, data: CompanyBankAccountUpdateInput): Promise<CompanyBankAccountResponse> {
    return api.patch<{ success: boolean; data: CompanyBankAccountResponse }>(`/settings/company-bank-accounts/${id}`, data).then(r => r.data.data);
  },
  setDefaultCompanyBankAccount(id: string): Promise<CompanyBankAccountResponse> {
    return api.post<{ success: boolean; data: CompanyBankAccountResponse }>(`/settings/company-bank-accounts/${id}/default`).then(r => r.data.data);
  },
  deleteCompanyBankAccount(id: string): Promise<void> {
    return api.delete(`/settings/company-bank-accounts/${id}`).then(() => undefined);
  },
  getReportTitles(): Promise<ReportTitlesMap> {
    return api.get<{ data: ReportTitlesMap }>('/settings/report-titles').then(r => r.data.data);
  },
  updateReportTitle(key: ReportKey, config: Partial<ReportTitleConfig>): Promise<ReportTitlesMap> {
    return api.patch<{ data: ReportTitlesMap }>(`/settings/report-titles/${key}`, config).then(r => r.data.data);
  },
  resetReportTitle(key?: ReportKey): Promise<ReportTitlesMap> {
    return api.post<{ data: ReportTitlesMap }>('/settings/report-titles/reset', key ? { key } : {}).then(r => r.data.data);
  },
  getReportEmailPrefix(): Promise<string> {
    return api.get<{ data: string }>('/settings/report-titles/email-prefix').then(r => r.data.data);
  },
  updateReportEmailPrefix(prefix: string): Promise<string> {
    return api.patch<{ data: string }>('/settings/report-titles/email-prefix', { prefix }).then(r => r.data.data);
  },
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
    clientId?: string | null;
  }): Promise<UserResponse> {
    return api
      .post<{ success: boolean; data: UserResponse }>('/settings/users', data)
      .then((r) => r.data.data);
  },

  updateUser(
    id: string,
    data: { name?: string; role?: UserRole; status?: string; clientId?: string | null },
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

  // ── Staff Positions ──────────────────────────────────────────────────────────

  getStaffPositions(activeOnly = true): Promise<StaffPositionResponse[]> {
    return api
      .get<{ success: boolean; data: StaffPositionResponse[] }>('/settings/staff-positions', {
        params: { activeOnly: activeOnly ? 'true' : 'false' },
      })
      .then((r) => r.data.data);
  },

  createStaffPosition(data: CreateStaffPositionInput): Promise<StaffPositionResponse> {
    return api
      .post<{ success: boolean; data: StaffPositionResponse }>('/settings/staff-positions', data)
      .then((r) => r.data.data);
  },

  updateStaffPosition(id: string, data: UpdateStaffPositionInput): Promise<StaffPositionResponse> {
    return api
      .patch<{ success: boolean; data: StaffPositionResponse }>(`/settings/staff-positions/${id}`, data)
      .then((r) => r.data.data);
  },

  deactivateStaffPosition(id: string): Promise<{ position: StaffPositionResponse; staffWithPosition: number }> {
    return api
      .patch<{ success: boolean; data: StaffPositionResponse; staffWithPosition: number }>(
        `/settings/staff-positions/${id}/deactivate`,
      )
      .then((r) => ({ position: r.data.data, staffWithPosition: r.data.staffWithPosition }));
  },

  activateStaffPosition(id: string): Promise<StaffPositionResponse> {
    return api
      .patch<{ success: boolean; data: StaffPositionResponse }>(`/settings/staff-positions/${id}/activate`)
      .then((r) => r.data.data);
  },

  deleteStaffPosition(id: string): Promise<void> {
    return api.delete(`/settings/staff-positions/${id}`).then(() => undefined);
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

  bulkUpdateRankSalary(
    id: string,
    newSalary: number,
    previousSalary?: number,
  ): Promise<{ updatedCount: number }> {
    return api
      .post<{ success: boolean; data: { updatedCount: number } }>(
        `/settings/ranks/${id}/bulk-update-salary`,
        { newSalary, previousSalary },
      )
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

  getShiftTypes(activeOnly = true): Promise<ShiftTypeResponse[]> {
    return api
      .get<{ success: boolean; data: ShiftTypeResponse[] }>('/settings/shift-types', { params: { activeOnly } })
      .then((r) => r.data.data);
  },

  createShiftType(data: CreateShiftTypeInput): Promise<ShiftTypeResponse> {
    return api
      .post<{ success: boolean; data: ShiftTypeResponse }>('/settings/shift-types', data)
      .then((r) => r.data.data);
  },

  updateShiftType(id: string, data: UpdateShiftTypeInput): Promise<ShiftTypeResponse> {
    return api
      .patch<{ success: boolean; data: ShiftTypeResponse }>(`/settings/shift-types/${id}`, data)
      .then((r) => r.data.data);
  },

  deactivateShiftType(id: string): Promise<ShiftTypeResponse> {
    return api
      .patch<{ success: boolean; data: ShiftTypeResponse }>(`/settings/shift-types/${id}/deactivate`)
      .then((r) => r.data.data);
  },

  activateShiftType(id: string): Promise<ShiftTypeResponse> {
    return api
      .patch<{ success: boolean; data: ShiftTypeResponse }>(`/settings/shift-types/${id}/activate`)
      .then((r) => r.data.data);
  },

  deleteShiftType(id: string): Promise<void> {
    return api.delete(`/settings/shift-types/${id}`).then(() => undefined);
  },

  reorderShiftTypes(orderedIds: string[]): Promise<ShiftTypeResponse[]> {
    return api
      .put<{ success: boolean; data: ShiftTypeResponse[] }>('/settings/shift-types/reorder', { orderedIds })
      .then((r) => r.data.data);
  },
};
