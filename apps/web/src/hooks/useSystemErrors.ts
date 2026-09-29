import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemErrorsApi, type SystemErrorQueryParams } from '../lib/systemErrors.api';
import type { UpdateErrorStatusInput, BulkUpdateErrorStatusInput } from '@security360/shared';

export function useSystemErrors(params: SystemErrorQueryParams) {
  return useQuery({
    queryKey: ['system-errors', params],
    queryFn:  () => systemErrorsApi.list(params),
  });
}

export function useSystemErrorStats(enabled = true) {
  return useQuery({
    queryKey:        ['system-errors-stats'],
    queryFn:         systemErrorsApi.getStats,
    staleTime:       15_000,
    refetchInterval: 30_000,
    enabled,
  });
}

export function useSystemError(id: string) {
  return useQuery({
    queryKey: ['system-errors', 'detail', id],
    queryFn:  () => systemErrorsApi.getById(id),
    enabled:  !!id,
  });
}

export function useUpdateErrorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateErrorStatusInput }) =>
      systemErrorsApi.updateStatus(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-errors'] });
      qc.invalidateQueries({ queryKey: ['system-errors-stats'] });
    },
  });
}

export function useBulkUpdateErrorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateErrorStatusInput) => systemErrorsApi.bulkUpdateStatus(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-errors'] });
      qc.invalidateQueries({ queryKey: ['system-errors-stats'] });
    },
  });
}
