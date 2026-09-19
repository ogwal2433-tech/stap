import api from './api';
import type {
  ContractResponse,
  CreateContractInput,
  UpdateContractInput,
  PaginatedResponse,
  AmendContractInput,
  ContractAmendmentResponse,
} from '@stap/shared';

export const contractsApi = {
  amend(id: string, body: AmendContractInput): Promise<ContractAmendmentResponse> {
    return api.post<{ success: boolean; data: ContractAmendmentResponse }>(`/contracts/${id}/amend`, body)
      .then(r => r.data.data);
  },

  amendments(id: string): Promise<ContractAmendmentResponse[]> {
    return api.get<{ success: boolean; data: ContractAmendmentResponse[] }>(`/contracts/${id}/amendments`)
      .then(r => r.data.data);
  },

  listByClient(clientId: string): Promise<ContractResponse[]> {
    return api
      .get<{ success: boolean } & PaginatedResponse<ContractResponse>>('/contracts', {
        params: { clientId, limit: 100 },
      })
      .then((r) => r.data.data);
  },

  create(data: CreateContractInput): Promise<ContractResponse> {
    return api
      .post<{ success: boolean; data: ContractResponse }>('/contracts', data)
      .then((r) => r.data.data);
  },

  update(id: string, data: Partial<UpdateContractInput>): Promise<ContractResponse> {
    return api
      .patch<{ success: boolean; data: ContractResponse }>(`/contracts/${id}`, data)
      .then((r) => r.data.data);
  },

  delete(id: string): Promise<void> {
    return api.delete(`/contracts/${id}`).then(() => undefined);
  },

  restore(id: string): Promise<{ id: string; name: string }> {
    return api.post(`/contracts/${id}/restore`).then((r) => r.data.data);
  },

  getExpiring(): Promise<ContractResponse[]> {
    return api
      .get<{ success: boolean; data: ContractResponse[] }>('/contracts/expiring')
      .then((r) => r.data.data);
  },

  /**
   * Both expiry lists in one request. The dashboard shows them side by side,
   * so asking twice risks two answers computed either side of midnight.
   */
  getExpiryAlerts(limit = 10): Promise<{ expiring: ContractResponse[]; expired: ContractResponse[] }> {
    return api
      .get<{ success: boolean; data: { expiring: ContractResponse[]; expired: ContractResponse[] } }>(
        '/contracts/expiry-alerts',
        { params: { limit } },
      )
      .then((r) => r.data.data);
  },
};
