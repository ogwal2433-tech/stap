import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '../lib/complaints.api';
import type { AssignComplaintInput, UpdateComplaintStatusInput } from '@security360/shared';

export function useComplaints(params?: {
  clientId?:  string;
  status?:    string;
  category?:  string;
  page?:      number;
  limit?:     number;
}) {
  return useQuery({
    queryKey:  ['complaints', params],
    queryFn:   () => complaintsApi.list(params),
    staleTime: 60_000,
  });
}

export function useClientComplaints(clientId: string) {
  return useQuery({
    queryKey:  ['complaints', { clientId }],
    queryFn:   () => complaintsApi.list({ clientId, page: 1, limit: 100 }),
    enabled:   Boolean(clientId),
    staleTime: 60_000,
  });
}

export function useComplaint(id: string) {
  return useQuery({
    queryKey:  ['complaint', id],
    queryFn:   () => complaintsApi.getById(id),
    enabled:   Boolean(id),
    staleTime: 60_000,
  });
}

export function useAssignComplaint(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AssignComplaintInput) => complaintsApi.assign(complaintId, data),
    onSuccess:  (updated) => {
      qc.setQueryData(['complaint', complaintId], updated);
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}

export function useUpdateComplaintStatus(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateComplaintStatusInput) => complaintsApi.updateStatus(complaintId, data),
    onSuccess:  (updated) => {
      qc.setQueryData(['complaint', complaintId], updated);
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}
