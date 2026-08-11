import api from './api';
import type {
  RequisitionResponse,
  PurchaseOrderResponse,
  SupplierResponse,
  PaginatedResponse,
  CreateRequisitionInput,
  UpdateRequisitionInput,
  ApproveRequisitionInput,
  AssignRequisitionInput,
  UpdateProgressInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  AccountabilityResponse,
  CreateAccountabilityInput,
  ReviewAccountabilityInput,
  FundDispatchResponse,
  CreateFundDispatchInput,
} from '@stap/shared';

export const requisitionsApi = {
  list(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<RequisitionResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<RequisitionResponse>>('/requisitions', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  create(data: CreateRequisitionInput): Promise<RequisitionResponse> {
    return api
      .post<{ success: boolean; data: RequisitionResponse }>('/requisitions', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: UpdateRequisitionInput): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}`, data)
      .then((r) => r.data.data);
  },

  approve(id: string, data: ApproveRequisitionInput): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}/approve`, data)
      .then((r) => r.data.data);
  },

  hrApprove(id: string): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}/hr-approve`, {})
      .then((r) => r.data.data);
  },

  directorApprove(id: string): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}/director-approve`, {})
      .then((r) => r.data.data);
  },

  assign(id: string, data: AssignRequisitionInput): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}/assign`, data)
      .then((r) => r.data.data);
  },

  updateProgress(id: string, data: UpdateProgressInput): Promise<RequisitionResponse> {
    return api
      .patch<{ success: boolean; data: RequisitionResponse }>(`/requisitions/${id}/progress`, data)
      .then((r) => r.data.data);
  },

  createPurchaseOrder(requisitionId: string, data: Omit<CreatePurchaseOrderInput, 'requisitionId'>): Promise<PurchaseOrderResponse> {
    return api
      .post<{ success: boolean; data: PurchaseOrderResponse }>(
        `/requisitions/${requisitionId}/purchase-order`,
        data,
      )
      .then((r) => r.data.data);
  },

  getDispatches(requisitionId: string): Promise<FundDispatchResponse[]> {
    return api
      .get<{ success: boolean; data: FundDispatchResponse[] }>(`/requisitions/${requisitionId}/dispatches`)
      .then((r) => r.data.data);
  },

  recordDispatch(requisitionId: string, data: CreateFundDispatchInput): Promise<FundDispatchResponse> {
    return api
      .post<{ success: boolean; data: FundDispatchResponse }>(`/requisitions/${requisitionId}/dispatch`, data)
      .then((r) => r.data.data);
  },

  getAccountability(requisitionId: string): Promise<AccountabilityResponse | null> {
    return api
      .get<{ success: boolean; data: AccountabilityResponse | null }>(`/requisitions/${requisitionId}/accountability`)
      .then((r) => r.data.data);
  },

  submitAccountability(requisitionId: string, data: CreateAccountabilityInput): Promise<AccountabilityResponse> {
    return api
      .post<{ success: boolean; data: AccountabilityResponse }>(`/requisitions/${requisitionId}/accountability`, data)
      .then((r) => r.data.data);
  },

  reviewAccountability(
    requisitionId: string,
    stage: 'admin' | 'hr' | 'director',
    data: ReviewAccountabilityInput,
  ): Promise<AccountabilityResponse> {
    return api
      .patch<{ success: boolean; data: AccountabilityResponse }>(
        `/requisitions/${requisitionId}/accountability/${stage}`,
        data,
      )
      .then((r) => r.data.data);
  },

  getDashboard(): Promise<{
    pendingApprovals: number;
    totalSpendThisMonth: number;
    overdueDeliveries: number;
    spendByCategory: { category: string; total: number }[];
  }> {
    return api
      .get<{ success: boolean; data: any }>('/requisitions/dashboard')
      .then((r) => r.data.data);
  },
};

export const suppliersApi = {
  list(): Promise<SupplierResponse[]> {
    return api
      .get<{ success: boolean; data: SupplierResponse[] }>('/requisitions/suppliers')
      .then((r) => r.data.data);
  },

  create(data: CreateSupplierInput): Promise<SupplierResponse> {
    return api
      .post<{ success: boolean; data: SupplierResponse }>('/requisitions/suppliers', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: Partial<CreateSupplierInput>): Promise<SupplierResponse> {
    return api
      .patch<{ success: boolean; data: SupplierResponse }>(`/requisitions/suppliers/${id}`, data)
      .then((r) => r.data.data);
  },
};
