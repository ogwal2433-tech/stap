import api from './api';
import type { CreateRoleInput, RoleRecord, UpdateRoleInput } from '@stap/shared';

/** Which roles exist. What each may do is permissions.api. */
export const rolesApi = {
  list(opts: { assignable?: boolean } = {}): Promise<RoleRecord[]> {
    return api
      .get<{ data: RoleRecord[] }>('/roles', { params: opts.assignable ? { assignable: 'true' } : undefined })
      .then((r) => r.data.data);
  },

  create(input: CreateRoleInput): Promise<RoleRecord> {
    return api.post<{ data: RoleRecord }>('/roles', input).then((r) => r.data.data);
  },

  update(name: string, input: UpdateRoleInput): Promise<RoleRecord> {
    return api
      .patch<{ data: RoleRecord }>(`/roles/${encodeURIComponent(name)}`, input)
      .then((r) => r.data.data);
  },

  remove(name: string): Promise<void> {
    return api.delete(`/roles/${encodeURIComponent(name)}`).then(() => undefined);
  },
};
