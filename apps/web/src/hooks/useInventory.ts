import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../lib/inventory.api';
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  IssueItemInput,
  ReturnItemInput,
  UpdateIssuedTransactionInput,
  StockAdjustmentInput,
  AdjustConditionInput,
  BatchIssueInput,
  InventoryItemResponse,
} from '@stap/shared';

export function useInventoryItems(params?: Parameters<typeof inventoryApi.listItems>[0]) {
  return useQuery({
    queryKey: ['inventory-items', params],
    queryFn:  () => inventoryApi.listItems(params),
  });
}

export function useLowStockItems() {
  return useQuery({
    queryKey: ['low-stock'],
    queryFn:  () => inventoryApi.getLowStockItems(),
  });
}

export function useInventoryTransactions(params?: Parameters<typeof inventoryApi.getTransactions>[0]) {
  return useQuery({
    queryKey: ['inventory-txns', params],
    queryFn:  () => inventoryApi.getTransactions(params),
  });
}

export function useGuardInventory(guardId: string) {
  return useQuery({
    queryKey: ['guard-inventory', guardId],
    queryFn:  () => inventoryApi.getGuardInventory(guardId),
    enabled:  !!guardId,
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInventoryItemInput) => inventoryApi.createItem(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInventoryItemInput }) =>
      inventoryApi.updateItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}

export function useIssueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IssueItemInput) => inventoryApi.issueItem(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-txns'] });
      qc.invalidateQueries({ queryKey: ['guard-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}

export function useReturnItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReturnItemInput) => inventoryApi.returnItem(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-txns'] });
      qc.invalidateQueries({ queryKey: ['guard-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory-outstanding'] });
    },
  });
}

export function useUpdateIssuedTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIssuedTransactionInput }) =>
      inventoryApi.updateIssuedTransaction(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-txns'] });
      qc.invalidateQueries({ queryKey: ['guard-inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-outstanding'] });
    },
  });
}

export function useOutstandingHolders(exGuardsOnly = false) {
  return useQuery({
    queryKey: ['inventory-outstanding', exGuardsOnly],
    queryFn:  () => inventoryApi.getOutstandingHolders(exGuardsOnly),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StockAdjustmentInput) => inventoryApi.adjustStock(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-txns'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}

export function useAdjustCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: AdjustConditionInput }) =>
      inventoryApi.adjustCondition(itemId, data),
    onSuccess: (_result: InventoryItemResponse) => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}

export function useBatchIssueItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BatchIssueInput) => inventoryApi.batchIssueItems(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-txns'] });
      qc.invalidateQueries({ queryKey: ['guard-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}
