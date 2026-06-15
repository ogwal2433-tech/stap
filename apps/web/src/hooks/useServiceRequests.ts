import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceRequestsApi } from '../lib/serviceRequests.api';
import type { CreateServiceRequestInput, UpdateServiceRequestInput } from '@stap/shared';

export function useClientServiceRequests(clientId: string) {
  return useQuery({
    queryKey: ['service-requests', clientId],
    queryFn: () => serviceRequestsApi.listByClient(clientId),
    enabled: Boolean(clientId),
  });
}

export function useCreateServiceRequest(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServiceRequestInput) => serviceRequestsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests', clientId] });
    },
  });
}

export function useUpdateServiceRequest(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServiceRequestInput }) =>
      serviceRequestsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests', clientId] });
    },
  });
}

export function useDeleteServiceRequest(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serviceRequestsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests', clientId] });
    },
  });
}
