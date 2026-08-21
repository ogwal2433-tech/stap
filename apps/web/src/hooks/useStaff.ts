import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, type StaffListParams } from '../lib/staff.api';
import type { CreateStaffInput, UpdateStaffInput } from '@stap/shared';

/**
 * Every mutation invalidates the whole `staff` tree rather than a single key —
 * a role change or deactivation moves the row between filtered lists and
 * shifts the head-count cards, so the cached slices are all stale at once.
 */
function useStaffMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
      // The Director and Administrator dashboards both carry a staff head-count.
      void qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

/**
 * `enabled` lets a caller hold the request back when the viewer is not allowed
 * to read the staff directory — /staff answers 403 to anyone outside
 * Director / Assistant Manager / Administrator, so firing it regardless just
 * buys a guaranteed failure.
 */
export function useStaffList(params: StaffListParams, enabled = true) {
  return useQuery({
    queryKey: ['staff', 'list', params],
    queryFn:  () => staffApi.list(params),
    enabled,
  });
}

export function useStaffMember(id: string | null) {
  return useQuery({
    queryKey: ['staff', 'detail', id],
    queryFn:  () => staffApi.getById(id!),
    enabled:  !!id,
  });
}

export function useCreateStaff() {
  return useStaffMutation((data: CreateStaffInput) => staffApi.create(data));
}

export function useUpdateStaff() {
  return useStaffMutation(({ id, data }: { id: string; data: UpdateStaffInput }) =>
    staffApi.update(id, data),
  );
}

export function useDeactivateStaff() {
  return useStaffMutation(({ id, reason }: { id: string; reason: string }) =>
    staffApi.deactivate(id, reason),
  );
}

export function useReactivateStaff() {
  return useStaffMutation((id: string) => staffApi.reactivate(id));
}

export function useResetStaffPassword() {
  return useStaffMutation((id: string) => staffApi.resetPassword(id));
}
