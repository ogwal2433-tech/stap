import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractsApi } from '../lib/contracts.api';
import type { CreateContractInput, UpdateContractInput } from '@stap/shared';

export function useClientContracts(clientId: string) {
  return useQuery({
    queryKey: ['contracts', clientId],
    queryFn: () => contractsApi.listByClient(clientId),
    enabled: Boolean(clientId),
  });
}

export function useCreateContract(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateContractInput) => contractsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    },
  });
}

export function useUpdateContract(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateContractInput> }) =>
      contractsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['contracts-expiring'] });
    },
  });
}

export function useDeleteContract(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contractsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', clientId] });
      queryClient.invalidateQueries({ queryKey: ['contracts-expiring'] });
    },
  });
}

export function useExpiringContracts() {
  return useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: () => contractsApi.getExpiring(),
    staleTime: 10 * 60 * 1000,
  });
}
