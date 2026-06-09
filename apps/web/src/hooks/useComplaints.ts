import { useQuery } from '@tanstack/react-query';
import { complaintsApi } from '../lib/complaints.api';

export function useComplaints(params?: {
  clientId?:  string;
  status?:    string;
  category?:  string;
  page?:      number;
  limit?:     number;
}) {
  return useQuery({
    queryKey: ['complaints', params],
    queryFn:  () => complaintsApi.list(params),
    staleTime: 60_000,
  });
}

export function useClientComplaints(clientId: string) {
  return useQuery({
    queryKey: ['complaints', { clientId }],
    queryFn:  () => complaintsApi.list({ clientId, page: 1, limit: 100 }),
    enabled:  Boolean(clientId),
    staleTime: 60_000,
  });
}

export function useComplaint(id: string) {
  return useQuery({
    queryKey: ['complaint', id],
    queryFn:  () => complaintsApi.getById(id),
    enabled:  Boolean(id),
    staleTime: 60_000,
  });
}
