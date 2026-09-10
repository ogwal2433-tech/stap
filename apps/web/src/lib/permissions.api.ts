import api from './api';

export interface Permission {
  id:          string;
  key:         string;
  name:        string;
  description: string | null;
  module:      string;
}

/** A named permission set that can be applied to a role in one step. */
export interface RolePreset {
  id:             string;
  name:           string;
  description:    string | null;
  permissionKeys: string[];
  createdBy:      { id: string; name: string } | null;
  createdAt:      string;
  updatedAt:      string;
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

  /**
   * Replaces a role's whole set in one transaction. `reason` is recorded in the
   * audit log — "Applied preset: Front desk", "Revoke all: guards" — so the
   * trail reads as decisions rather than bare arrays of keys.
   */
  replace(role: string, permissionKeys: string[], reason?: string): Promise<void> {
    return api
      .put(`/permissions/roles/${role}`, { permissionKeys, ...(reason ? { reason } : {}) })
      .then(() => undefined);
  },

  // ── Presets ─────────────────────────────────────────────────────────────────

  presets(): Promise<RolePreset[]> {
    return api.get<{ data: RolePreset[] }>('/permissions/presets').then((r) => r.data.data);
  },

  createPreset(input: {
    name: string;
    description?: string;
    permissionKeys: string[];
  }): Promise<RolePreset> {
    return api
      .post<{ data: RolePreset }>('/permissions/presets', input)
      .then((r) => r.data.data);
  },

  deletePreset(id: string): Promise<void> {
    return api.delete(`/permissions/presets/${encodeURIComponent(id)}`).then(() => undefined);
  },
};
