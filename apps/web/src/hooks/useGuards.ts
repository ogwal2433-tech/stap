import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guardsApi } from '../lib/guards.api';
import type { CreateGuardInput, GuardListQuery } from '@stap/shared';

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

export function useGuardDeploymentHistory(guardId: string, page: number) {
  return useQuery({
    queryKey: ['guard-deployments', guardId, page],
    queryFn: () => guardsApi.getDeploymentHistory(guardId, page),
    enabled: Boolean(guardId),
  });
}
