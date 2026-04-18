import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../lib/settings.api';
import type { UserRole } from '@stap/shared';

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
