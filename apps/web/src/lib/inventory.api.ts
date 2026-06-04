import api from './api';
import type {
  InventoryItemResponse,
  InventoryTransactionResponse,
  GuardInventoryItem,
  PaginatedResponse,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  IssueItemInput,
  ReturnItemInput,
  StockAdjustmentInput,
  AdjustConditionInput,
  BatchIssueInput,
  BatchIssueResult,
} from '@stap/shared';

export const inventoryApi = {
  listItems(params?: {
    itemType?: string;
    isLowStock?: boolean;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<InventoryItemResponse>>('/inventory/items', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  createItem(data: CreateInventoryItemInput): Promise<InventoryItemResponse> {
    return api
      .post<{ success: boolean; data: InventoryItemResponse }>('/inventory/items', data)
      .then((r) => r.data.data);
  },

  updateItem(id: string, data: UpdateInventoryItemInput): Promise<InventoryItemResponse> {
    return api
      .patch<{ success: boolean; data: InventoryItemResponse }>(`/inventory/items/${id}`, data)
      .then((r) => r.data.data);
  },

  issueItem(data: IssueItemInput): Promise<InventoryTransactionResponse> {
    return api
      .post<{ success: boolean; data: InventoryTransactionResponse }>('/inventory/items/issue', data)
      .then((r) => r.data.data);
  },

  returnItem(data: ReturnItemInput): Promise<InventoryTransactionResponse> {
    return api
      .post<{ success: boolean; data: InventoryTransactionResponse }>('/inventory/items/return', data)
      .then((r) => r.data.data);
  },

  adjustStock(data: StockAdjustmentInput): Promise<InventoryTransactionResponse> {
    return api
      .post<{ success: boolean; data: InventoryTransactionResponse }>('/inventory/items/adjust-stock', data)
      .then((r) => r.data.data);
  },

  getTransactions(params?: {
    itemId?: string;
    guardId?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<InventoryTransactionResponse>>('/inventory/transactions', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getGuardInventory(guardId: string): Promise<GuardInventoryItem[]> {
    return api
      .get<{ success: boolean; data: GuardInventoryItem[] }>(`/inventory/guards/${guardId}/items`)
      .then((r) => r.data.data);
  },

  getLowStockItems(): Promise<InventoryItemResponse[]> {
    return api
      .get<{ success: boolean; data: InventoryItemResponse[] }>('/inventory/items/low-stock')
      .then((r) => r.data.data);
  },

  adjustCondition(itemId: string, data: AdjustConditionInput): Promise<InventoryItemResponse> {
    return api
      .patch<{ success: boolean; data: InventoryItemResponse }>(`/inventory/items/${itemId}/condition`, data)
      .then((r) => r.data.data);
  },

  batchIssueItems(data: BatchIssueInput): Promise<BatchIssueResult> {
    return api
      .post<{ success: boolean; data: BatchIssueResult }>('/inventory/items/issue/batch', data)
      .then((r) => r.data.data);
  },
};
