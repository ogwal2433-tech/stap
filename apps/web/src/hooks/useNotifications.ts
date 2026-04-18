import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../lib/notifications.api';

export function useNotifications(params?: { isRead?: boolean; page?: number; limit?: number }) {
  return useQuery({
    queryKey:       ['notifications', params],
    queryFn:        () => notificationsApi.getAll(params),
    staleTime:      30_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey:       ['notifications-unread'],
    queryFn:        notificationsApi.getUnreadCount,
    staleTime:      15_000,
    refetchInterval: 30_000,
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}
