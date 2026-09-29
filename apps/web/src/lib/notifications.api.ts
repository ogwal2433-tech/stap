import api from './api';
import type { NotificationResponse, NotificationPreferenceInput, PaginatedResponse } from '@security360/shared';

export const notificationsApi = {
  getAll(params?: { isRead?: boolean; page?: number; limit?: number }): Promise<PaginatedResponse<NotificationResponse>> {
    return api.get('/notifications', { params }).then(r => r.data);
  },

  getUnreadCount(): Promise<{ count: number }> {
    return api.get('/notifications/unread-count').then(r => r.data.data);
  },

  markAsRead(id: string): Promise<void> {
    return api.patch(`/notifications/${id}/read`).then(() => undefined);
  },

  markAllAsRead(): Promise<void> {
    return api.patch('/notifications/mark-all-read').then(() => undefined);
  },

  getPreferences(role: string): Promise<any> {
    return api.get(`/notifications/preferences/${role}`).then(r => r.data.data);
  },

  savePreferences(role: string, preferences: NotificationPreferenceInput['preferences']): Promise<void> {
    return api.put(`/notifications/preferences/${role}`, { preferences }).then(() => undefined);
  },
};
