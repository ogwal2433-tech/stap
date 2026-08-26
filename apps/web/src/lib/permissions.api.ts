import api from './api';

export interface Permission {
  id:          string;
  key:         string;
  name:        string;
  description: string | null;
  module:      string;
}

export interface RoleSummary {
  role:     string;
  count:    number;
  editable: boolean;
}

export const permissionsApi = {
  catalogue(): Promise<Permission[]> {
    return api.get<{ data: Permission[] }>('/permissions').then((r) => r.data.data);
  },

  roles(): Promise<RoleSummary[]> {
    return api.get<{ data: RoleSummary[] }>('/permissions/roles').then((r) => r.data.data);
  },

  forRole(role: string): Promise<{ role: string; editable: boolean; permissions: Permission[] }> {
    return api
      .get<{ data: { role: string; editable: boolean; permissions: Permission[] } }>(
        `/permissions/roles/${role}`,
      )
      .then((r) => r.data.data);
  },

  defaultsFor(role: string): Promise<string[]> {
    return api
      .get<{ data: { permissionKeys: string[] } }>(`/permissions/roles/${role}/defaults`)
      .then((r) => r.data.data.permissionKeys);
  },

  grant(role: string, permissionKey: string): Promise<void> {
    return api.post(`/permissions/roles/${role}/grant`, { permissionKey }).then(() => undefined);
  },

  revoke(role: string, permissionKey: string): Promise<void> {
    return api
      .delete(`/permissions/roles/${role}/revoke/${encodeURIComponent(permissionKey)}`)
      .then(() => undefined);
  },

  replace(role: string, permissionKeys: string[]): Promise<void> {
    return api.put(`/permissions/roles/${role}`, { permissionKeys }).then(() => undefined);
  },
};
