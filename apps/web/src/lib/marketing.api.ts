import api from './api';
import { FILE_PREFIX } from './branding';
import type {
  ProspectResponse, ProspectWithHistory, BidResponse, MarketingTargetResponse,
  MarketingDashboardData, MarketingReport, MarketingReportType,
  CreateProspectInput, UpdateProspectInput, CreateBidInput, UpdateBidInput,
  CreateTargetInput, PaginatedResponse,
} from '@security360/shared';

type Page<T> = { success: boolean } & PaginatedResponse<T>;

export const marketingApi = {
  // ── Prospects ───────────────────────────────────────────────────────────────
  /** Sales officers leads may be assigned to — for the head's board filter. */
  salesStaff(): Promise<Array<{ id: string; name: string; email: string }>> {
    return api
      .get<{ data: Array<{ id: string; name: string; email: string }> }>('/marketing/sales-staff')
      .then((r) => r.data.data);
  },

  listProspects(params?: { status?: string; assignedToId?: string; search?: string; page?: number; limit?: number }) {
    return api.get<Page<ProspectResponse>>('/marketing/prospects', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getProspect(id: string): Promise<ProspectWithHistory> {
    return api.get<{ data: ProspectWithHistory }>(`/marketing/prospects/${id}`).then((r) => r.data.data);
  },

  createProspect(data: CreateProspectInput): Promise<ProspectResponse> {
    return api.post<{ data: ProspectResponse }>('/marketing/prospects', data).then((r) => r.data.data);
  },

  updateProspect(id: string, data: UpdateProspectInput): Promise<ProspectResponse> {
    return api.patch<{ data: ProspectResponse }>(`/marketing/prospects/${id}`, data).then((r) => r.data.data);
  },

  convertProspect(id: string): Promise<{ prospect: ProspectResponse; clientId: string }> {
    return api.post<{ data: { prospect: ProspectResponse; clientId: string } }>(
      `/marketing/prospects/${id}/convert`,
    ).then((r) => r.data.data);
  },

  // ── Bids ────────────────────────────────────────────────────────────────────
  listBids(params?: { status?: string; bidType?: string; search?: string; page?: number; limit?: number }) {
    return api.get<Page<BidResponse>>('/marketing/bids', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  createBid(data: CreateBidInput): Promise<BidResponse> {
    return api.post<{ data: BidResponse }>('/marketing/bids', data).then((r) => r.data.data);
  },

  updateBid(id: string, data: UpdateBidInput): Promise<BidResponse> {
    return api.patch<{ data: BidResponse }>(`/marketing/bids/${id}`, data).then((r) => r.data.data);
  },

  // ── Targets ─────────────────────────────────────────────────────────────────
  listTargets(params?: { assignedToId?: string; period?: string }): Promise<MarketingTargetResponse[]> {
    return api.get<{ data: MarketingTargetResponse[] }>('/marketing/targets', { params }).then((r) => r.data.data);
  },

  createTarget(data: CreateTargetInput): Promise<MarketingTargetResponse> {
    return api.post<{ data: MarketingTargetResponse }>('/marketing/targets', data).then((r) => r.data.data);
  },

  // ── Dashboard and reports ───────────────────────────────────────────────────
  dashboard(): Promise<MarketingDashboardData> {
    return api.get<{ data: MarketingDashboardData }>('/marketing/dashboard').then((r) => r.data.data);
  },

  report(type: MarketingReportType, params?: { dateFrom?: string; dateTo?: string; assignedToId?: string }): Promise<MarketingReport> {
    return api.get<{ data: MarketingReport }>(`/marketing/reports/${type}`, { params }).then((r) => r.data.data);
  },

  /**
   * Downloads a report as Excel.
   *
   * Fetched through the API client rather than a plain link because the access
   * token lives in memory — a bare navigation would arrive unauthenticated.
   */
  async exportReport(
    type: MarketingReportType,
    params?: { dateFrom?: string; dateTo?: string; assignedToId?: string },
  ): Promise<void> {
    const res = await api.get(`/marketing/reports/${type}/export`, { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${FILE_PREFIX}_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
