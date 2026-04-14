import api from './api';
import type {
  ContractResponse,
  CreateContractInput,
  UpdateContractInput,
  PaginatedResponse,
} from '@stap/shared';

export const contractsApi = {
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

  getExpiring(): Promise<ContractResponse[]> {
    return api
      .get<{ success: boolean; data: ContractResponse[] }>('/contracts/expiring')
      .then((r) => r.data.data);
  },
};
