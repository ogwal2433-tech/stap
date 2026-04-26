import api from './api';
import type {
  GuardResponse,
  GuardDocumentResponse,
  DeploymentHistoryEntry,
  PaginatedResponse,
  CreateGuardInput,
  GuardListQuery,
  BulkImportResult,
  GuardDashboardStats,
  GuardRelativeInput,
  GuardAssociateInput,
} from '@stap/shared';

export const guardsApi = {
  list(params?: Partial<GuardListQuery>): Promise<PaginatedResponse<GuardResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<GuardResponse>>('/guards', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getById(id: string): Promise<GuardResponse> {
    return api
      .get<{ success: boolean; data: GuardResponse }>(`/guards/${id}`)
      .then((r) => r.data.data);
  },

  create(data: CreateGuardInput): Promise<GuardResponse> {
    return api
      .post<{ success: boolean; data: GuardResponse }>('/guards', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: Partial<CreateGuardInput>): Promise<GuardResponse> {
    return api
      .patch<{ success: boolean; data: GuardResponse }>(`/guards/${id}`, data)
      .then((r) => r.data.data);
  },

  updateStatus(id: string, status: string, reason: string): Promise<GuardResponse> {
    return api
      .patch<{ success: boolean; data: GuardResponse }>(`/guards/${id}/status`, { status, reason })
      .then((r) => r.data.data);
  },

  uploadPhoto(id: string, file: File): Promise<{ photoUrl: string }> {
    const form = new FormData();
    form.append('photo', file);
    return api
      .post<{ success: boolean; data: { photoUrl: string } }>(`/guards/${id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  uploadDocument(id: string, file: File, documentType: string): Promise<GuardDocumentResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return api
      .post<{ success: boolean; data: GuardDocumentResponse }>(`/guards/${id}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  getDocuments(id: string): Promise<GuardDocumentResponse[]> {
    return api
      .get<{ success: boolean; data: GuardDocumentResponse[] }>(`/guards/${id}/documents`)
      .then((r) => r.data.data);
  },

  deleteDocument(guardId: string, docId: string): Promise<void> {
    return api
      .delete(`/guards/${guardId}/documents/${docId}`)
      .then(() => undefined);
  },

  getDeploymentHistory(
    id: string,
    page = 1,
  ): Promise<PaginatedResponse<DeploymentHistoryEntry>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<DeploymentHistoryEntry>>(
        `/guards/${id}/deployment-history`,
        { params: { page, limit: 5 } },
      )
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  downloadTemplate(): Promise<void> {
    return api
      .get('/guards/import/template', { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'STAP_Guard_Import_Template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      });
  },

  bulkImport(file: File): Promise<BulkImportResult> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ success: boolean; data: BulkImportResult }>('/guards/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  getDashboardStats(): Promise<GuardDashboardStats> {
    return api
      .get<{ success: boolean; data: GuardDashboardStats }>('/guards/dashboard')
      .then((r) => r.data.data);
  },

  updateVettingData(
    guardId: string,
    data: { relatives?: GuardRelativeInput[]; associates?: GuardAssociateInput[] },
  ): Promise<void> {
    return api
      .put(`/guards/${guardId}/vetting-data`, data)
      .then(() => undefined);
  },

  getRecentActivity(): Promise<{ id: string; fullName: string; employmentStatus: string; updatedAt: string }[]> {
    return api
      .get<{ success: boolean; data: { id: string; fullName: string; employmentStatus: string; updatedAt: string }[] }>('/guards/recent-activity')
      .then((r) => r.data.data);
  },
};
