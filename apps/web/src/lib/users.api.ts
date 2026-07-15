import api from './api';

export interface UserSummary {
  id: string;
  name: string;
  role: string;
  systemId: string | null;
}

export const usersApi = {
  list(params?: { roles?: string; status?: string }): Promise<{ data: UserSummary[] }> {
    return api
      .get<{ success: boolean; data: UserSummary[] }>('/users', { params })
      .then((r) => ({ data: r.data.data }));
  },
};
