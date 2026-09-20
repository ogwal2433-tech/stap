import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../lib/settings.api';
import type {
  CreateStaffPositionInput,
  UpdateStaffPositionInput,
  UserRole,
  CreateGuardRankInput,
  UpdateGuardRankInput,
  CreateDeductionTypeInput,
  UpdateDeductionTypeInput,
  CreateShiftTypeInput,
  UpdateShiftTypeInput,
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
    mutationFn: (data: { name: string; email: string; password: string; role: UserRole; clientId?: string | null }) =>
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
      data: { name?: string; role?: UserRole; status?: string; clientId?: string | null };
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

// ── Staff Positions ────────────────────────────────────────────────────────────

export function useStaffPositions(activeOnly = true) {
  return useQuery({
    queryKey:  ['staff-positions', activeOnly],
    queryFn:   () => settingsApi.getStaffPositions(activeOnly),
    staleTime: 5 * 60 * 1000,
  });
}

/** Includes deactivated positions — for the settings page, not the staff form. */
export function useAllStaffPositions() {
  return useStaffPositions(false);
}

export function useCreateStaffPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStaffPositionInput) => settingsApi.createStaffPosition(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  });
}

export function useUpdateStaffPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStaffPositionInput }) =>
      settingsApi.updateStaffPosition(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  });
}

export function useDeactivateStaffPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deactivateStaffPosition(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  });
}

export function useActivateStaffPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.activateStaffPosition(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  });
}

export function useDeleteStaffPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteStaffPosition(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  });
}

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

export function useBulkUpdateRankSalary() {
  return useMutation({
    mutationFn: ({
      id,
      newSalary,
      previousSalary,
    }: {
      id: string;
      newSalary: number;
      previousSalary?: number;
    }) => settingsApi.bulkUpdateRankSalary(id, newSalary, previousSalary),
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

// ── Shift Types ────────────────────────────────────────────────────────────────

export function useShiftTypes(activeOnly = true) {
  return useQuery({
    queryKey: ['shift-types', activeOnly],
    queryFn:  () => settingsApi.getShiftTypes(activeOnly),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllShiftTypes() {
  return useShiftTypes(false);
}

export function useCreateShiftType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateShiftTypeInput) => settingsApi.createShiftType(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}

export function useUpdateShiftType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShiftTypeInput }) =>
      settingsApi.updateShiftType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}

export function useDeactivateShiftType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deactivateShiftType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}

export function useActivateShiftType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.activateShiftType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}

export function useDeleteShiftType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteShiftType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}

export function useReorderShiftTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => settingsApi.reorderShiftTypes(orderedIds),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shift-types'] }),
  });
}
