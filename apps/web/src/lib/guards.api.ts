export interface GuardIdStats {
  total: number; ownId: number; relativeId: number; otherDoc: number; noId: number;
  ownIdPct: number; relativeIdPct: number; otherDocPct: number; noIdPct: number;
}

import api from './api';
import { FILE_PREFIX } from './branding';
import type {
  GuardResponse,
  GuardExportResponse,
  GuardDocumentResponse,
  DeploymentHistoryEntry,
  PaginatedResponse,
  CreateGuardInput,
  GuardListQuery,
  GuardExportQuery,
  BulkImportResult,
  GuardDashboardStats,
  GuardRelativeInput,
  GuardAssociateInput,
  CreateGuardTransferInput,
  GuardTransferResponse,
  PromoteGuardInput,
  GuardPromotionResponse,
  GrantGuardAccessInput,
  LinkedAccount,
} from '@security360/shared';

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

  reinstateGuard(guardId: string, reason: string): Promise<GuardResponse> {
    return api
      .post<{ success: boolean; data: GuardResponse }>(`/guards/${guardId}/reinstate`, { reason })
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
        a.download = `${FILE_PREFIX}_Guard_Import_Template.xlsx`;
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

  /** Only a guard with no history; anyone who has worked is terminated instead. */
  remove(id: string, body?: { override?: boolean; reason?: string }): Promise<{ id: string; name: string }> {
    return api.delete(`/guards/${id}`, { data: body }).then((r) => r.data.data);
  },

  restore(id: string): Promise<{ id: string; name: string }> {
    return api.post(`/guards/${id}/restore`).then((r) => r.data.data);
  },

  /** Permanently deletes a deserted guard from the archive. Irreversible. */
  purge(id: string, systemId: string, reason: string): Promise<{ id: string; name: string }> {
    return api.delete(`/guards/${id}/permanent`, { data: { systemId, reason } }).then((r) => r.data.data);
  },

  /**
   * The roll for the Excel export — deliberately not paginated, but it does take
   * the filters the table is under, so the file answers the same question the
   * screen was answering when Export was pressed.
   */
  exportAll(params?: GuardExportQuery): Promise<GuardExportResponse> {
    return api
      .get<{ success: boolean; data: GuardExportResponse }>('/guards/export', { params })
      .then((r) => r.data.data);
  },

  /**
   * The same filtered roll, printed on the letterhead. Fetched through the API
   * client rather than linked directly, because the access token is held in
   * memory and would not be sent on a bare navigation.
   */
  async downloadRollPdf(params?: GuardExportQuery): Promise<void> {
    const r = await api.get('/guards/export/pdf', { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${FILE_PREFIX}_Guards_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  idStats(): Promise<GuardIdStats> {
    return api.get<{ success: boolean; data: GuardIdStats }>('/guards/id-stats').then((r) => r.data.data);
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

  downloadIdCard(guardId: string): Promise<void> {
    return api
      .get(`/guards/${guardId}/id-card`, { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${FILE_PREFIX}-Guard-ID-${guardId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  },

  transferGuard(guardId: string, data: CreateGuardTransferInput): Promise<GuardTransferResponse> {
    return api
      .post<{ success: boolean; data: GuardTransferResponse }>(`/guards/${guardId}/transfer`, data)
      .then((r) => r.data.data);
  },

  getTransferHistory(guardId: string): Promise<GuardTransferResponse[]> {
    return api
      .get<{ success: boolean; data: GuardTransferResponse[] }>(`/guards/${guardId}/transfers`)
      .then((r) => r.data.data);
  },

  promoteGuard(guardId: string, data: PromoteGuardInput): Promise<GuardPromotionResponse> {
    return api
      .post<{ success: boolean; data: GuardPromotionResponse }>(`/guards/${guardId}/promote`, data)
      .then((r) => r.data.data);
  },

  getPromotionHistory(guardId: string): Promise<GuardPromotionResponse[]> {
    return api
      .get<{ success: boolean; data: GuardPromotionResponse[] }>(`/guards/${guardId}/promotions`)
      .then((r) => r.data.data);
  },

  runSalaryIncrements(): Promise<void> {
    return api
      .post<{ success: boolean }>('/guards/salary-increment/run')
      .then(() => undefined);
  },

  /** Gives this guard a login. They are already on record; only the credentials are new. */
  grantAccess(id: string, data: GrantGuardAccessInput): Promise<LinkedAccount> {
    return api
      .post<{ success: boolean; data: LinkedAccount }>(`/guards/${id}/grant-access`, data)
      .then((r) => r.data.data);
  },

  revokeAccess(id: string): Promise<void> {
    return api
      .delete<{ success: boolean }>(`/guards/${id}/revoke-access`)
      .then(() => undefined);
  },
};
