import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../lib/settings.api';
import type {
  UserRole,
  CreateGuardRankInput,
  UpdateGuardRankInput,
  CreateDeductionTypeInput,
  UpdateDeductionTypeInput,
} from '@stap/shared';

export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn:  () => settingsApi.getAll(),
  });
}

export function useSettingsGroup(group: string) {
  return useQuery({
    queryKey: ['system-settings', group],
    queryFn:  () => settingsApi.getGroup(group),
    enabled:  !!group,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: { key: string; value: string }[]) => settingsApi.updateMany(settings),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['system-settings'] }),
  });
}

export function useUsers(params?: Parameters<typeof settingsApi.listUsers>[0]) {
  return useQuery({
    queryKey: ['users-mgmt', params],
    queryFn:  () => settingsApi.listUsers(params),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: UserRole }) =>
      settingsApi.createUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-mgmt'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; role?: UserRole; status?: string };
    }) => settingsApi.updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-mgmt'] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      settingsApi.resetPassword(id, newPassword),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deactivateUser(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['users-mgmt'] }),
  });
}

// ── Guard Rank hooks ───────────────────────────────────────────────────────────

export function useGuardRanks(activeOnly = true) {
  return useQuery({
    queryKey:  ['guard-ranks', activeOnly],
    queryFn:   () => settingsApi.getRanks(activeOnly),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllGuardRanks() {
  return useGuardRanks(false);
}

export function useCreateRank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGuardRankInput) => settingsApi.createRank(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

export function useUpdateRank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGuardRankInput }) =>
      settingsApi.updateRank(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

export function useDeactivateRank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deactivateRank(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

export function useActivateRank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.activateRank(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

export function useDeleteRank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteRank(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

export function useReorderRanks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => settingsApi.reorderRanks(orderedIds),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guard-ranks'] }),
  });
}

// ── Deduction Type hooks ───────────────────────────────────────────────────────

export function useDeductionTypes(activeOnly = true) {
  return useQuery({
    queryKey:  ['deduction-types', activeOnly],
    queryFn:   () => settingsApi.getDeductionTypes(activeOnly),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllDeductionTypes() {
  return useDeductionTypes(false);
}

export function useCreateDeductionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDeductionTypeInput) => settingsApi.createDeductionType(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}

export function useUpdateDeductionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDeductionTypeInput }) =>
      settingsApi.updateDeductionType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}

export function useDeactivateDeductionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deactivateDeductionType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}

export function useActivateDeductionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.activateDeductionType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}

export function useDeleteDeductionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteDeductionType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}

export function useReorderDeductionTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => settingsApi.reorderDeductionTypes(orderedIds),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deduction-types'] }),
  });
}
