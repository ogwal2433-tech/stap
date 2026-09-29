import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guardsApi } from '../lib/guards.api';
import { useToast } from '../context/ToastContext';
import type {
  CreateGuardInput, GuardListQuery, GuardRelativeInput, GuardAssociateInput,
  CreateGuardTransferInput, PromoteGuardInput, GrantGuardAccessInput,
} from '@security360/shared';

export function useGuardList(params?: Partial<GuardListQuery>) {
  return useQuery({
    queryKey: ['guards', params],
    queryFn: () => guardsApi.list(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useGuard(id: string) {
  return useQuery({
    queryKey: ['guard', id],
    queryFn: () => guardsApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useCreateGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGuardInput) => guardsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
    },
  });
}

export function useUpdateGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateGuardInput> }) =>
      guardsApi.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.invalidateQueries({ queryKey: ['guard', variables.id] });
    },
  });
}

export function useUpdateGuardStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) =>
      guardsApi.updateStatus(id, status, reason),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.invalidateQueries({ queryKey: ['guard', variables.id] });
    },
  });
}

export function useReinstateGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guardId, reason }: { guardId: string; reason: string }) =>
      guardsApi.reinstateGuard(guardId, reason),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.invalidateQueries({ queryKey: ['guard', variables.guardId] });
    },
  });
}

export function useGuardDeploymentHistory(guardId: string, page: number) {
  return useQuery({
    queryKey: ['guard-deployments', guardId, page],
    queryFn: () => guardsApi.getDeploymentHistory(guardId, page),
    enabled: Boolean(guardId),
  });
}

export function useGuardDashboard() {
  return useQuery({
    queryKey:      ['guard-dashboard'],
    queryFn:       () => guardsApi.getDashboardStats(),
    staleTime:     5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useDownloadTemplate() {
  return useMutation({ mutationFn: () => guardsApi.downloadTemplate() });
}

export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => guardsApi.bulkImport(file),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['guards'] }); },
  });
}

export function useUpdateVettingData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      guardId,
      relatives,
      associates,
    }: {
      guardId: string;
      relatives?: GuardRelativeInput[];
      associates?: GuardAssociateInput[];
    }) => guardsApi.updateVettingData(guardId, { relatives, associates }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guard', variables.guardId] });
    },
  });
}

export function useRecentGuardActivity() {
  return useQuery({
    queryKey:  ['guard-recent-activity'],
    queryFn:   () => guardsApi.getRecentActivity(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDownloadIdCard() {
  return useMutation({
    mutationFn: (guardId: string) => guardsApi.downloadIdCard(guardId),
  });
}

export function useTransferGuard(guardId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (data: CreateGuardTransferInput) => guardsApi.transferGuard(guardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guard', guardId] });
      queryClient.invalidateQueries({ queryKey: ['transfers', guardId] });
      showToast('Guard transferred successfully', 'success');
    },
  });
}

export function useTransferHistory(guardId: string) {
  return useQuery({
    queryKey: ['transfers', guardId],
    queryFn:  () => guardsApi.getTransferHistory(guardId),
    enabled:  Boolean(guardId),
  });
}

export function usePromoteGuard(guardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PromoteGuardInput) => guardsApi.promoteGuard(guardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guard', guardId] });
      queryClient.invalidateQueries({ queryKey: ['promotions', guardId] });
    },
  });
}

export function usePromotionHistory(guardId: string) {
  return useQuery({
    queryKey: ['promotions', guardId],
    queryFn:  () => guardsApi.getPromotionHistory(guardId),
    enabled:  Boolean(guardId),
  });
}

export function useRunSalaryIncrements() {
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => guardsApi.runSalaryIncrements(),
    onSuccess: () => showToast('Salary increment check completed successfully', 'success'),
    onError: () => showToast('Salary increment check failed', 'danger'),
  });
}

/**
 * System access for a guard. Both mutations refresh the profile query, because
 * the System Access panel reads `systemAccess` straight off the guard.
 */
export function useGrantGuardAccess(guardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GrantGuardAccessInput) => guardsApi.grantAccess(guardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guard', guardId] });
      queryClient.invalidateQueries({ queryKey: ['guards'] });
    },
  });
}

export function useRevokeGuardAccess(guardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => guardsApi.revokeAccess(guardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guard', guardId] });
      queryClient.invalidateQueries({ queryKey: ['guards'] });
    },
  });
}
