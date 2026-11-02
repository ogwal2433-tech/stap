import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requisitionsApi, suppliersApi } from '../lib/requisitions.api';
import type {
  CreateRequisitionInput,
  UpdateRequisitionInput,
  ApproveRequisitionInput,
  AssignRequisitionInput,
  UpdateProgressInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  CreateAccountabilityInput,
  ReviewAccountabilityInput,
  CreateFundDispatchInput,
} from '@security360/shared';

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

export function useUpdateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRequisitionInput }) =>
      requisitionsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
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

export function useHRApproveRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requisitionsApi.hrApprove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useDirectorApproveRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requisitionsApi.directorApprove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useRevokeRequisitionApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      requisitionsApi.revokeApproval(id, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useAssignRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignRequisitionInput }) =>
      requisitionsApi.assign(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useUpdateRequisitionProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProgressInput }) =>
      requisitionsApi.updateProgress(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useCompleteRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requisitionsApi.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisitions', 'dashboard'] });
    },
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

export function useFundDispatches(requisitionId: string, enabled = true) {
  return useQuery({
    queryKey: ['fundDispatches', requisitionId],
    queryFn:  () => requisitionsApi.getDispatches(requisitionId),
    enabled:  Boolean(requisitionId) && enabled,
  });
}

export function useRecordDispatch(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFundDispatchInput) =>
      requisitionsApi.recordDispatch(requisitionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fundDispatches', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}

export function useAccountability(requisitionId: string) {
  return useQuery({
    queryKey: ['accountability', requisitionId],
    queryFn:  () => requisitionsApi.getAccountability(requisitionId),
    enabled:  Boolean(requisitionId),
  });
}

export function useSubmitAccountability(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAccountabilityInput) =>
      requisitionsApi.submitAccountability(requisitionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accountability', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}

export function useReviewAccountability(requisitionId: string, stage: 'admin' | 'hr' | 'director') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewAccountabilityInput) =>
      requisitionsApi.reviewAccountability(requisitionId, stage, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accountability', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}

export function useRequisitionDashboard(from?: string, to?: string) {
  return useQuery({
    // Keyed on the date window: changing the filter panel refetches the tiles
    // for the new period instead of showing stale all-time figures.
    queryKey: ['requisitions', 'dashboard', from ?? '', to ?? ''],
    queryFn:  () => requisitionsApi.getDashboard({ from: from || undefined, to: to || undefined }),
    staleTime: 30 * 1000,
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
