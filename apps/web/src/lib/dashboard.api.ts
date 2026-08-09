import api from './api';
import type { DashboardData } from '@stap/shared';

export const dashboardApi = {
  getStats(): Promise<DashboardData> {
    return api
      .get<{ success: boolean; data: DashboardData }>('/dashboard/stats')
      .then((r) => r.data.data);
  },
};
