import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requisitionsApi, suppliersApi } from '../lib/requisitions.api';
import type {
  CreateRequisitionInput,
  ApproveRequisitionInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
} from '@stap/shared';

export function useRequisitions(params?: Parameters<typeof requisitionsApi.list>[0]) {
  return useQuery({
    queryKey: ['requisitions', params],
    queryFn:  () => requisitionsApi.list(params),
  });
}

export function useCreateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRequisitionInput) => requisitionsApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useApproveRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApproveRequisitionInput }) =>
      requisitionsApi.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requisitionId,
      ...data
    }: { requisitionId: string } & Omit<CreatePurchaseOrderInput, 'requisitionId'>) =>
      requisitionsApi.createPurchaseOrder(requisitionId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useRequisitionDashboard() {
  return useQuery({
    queryKey: ['requisitions', 'dashboard'],
    queryFn:  () => requisitionsApi.getDashboard(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn:  () => suppliersApi.list(),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupplierInput) => suppliersApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSupplierInput> }) =>
      suppliersApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
