import api from './api';

export type DeletableType = 'client' | 'guard' | 'staff' | 'contract' | 'site';

export interface DeletedRecord {
  id:            string;
  name:          string;
  detail:        string | null;
  deletedAt:     string;
  deletedByName: string | null;
}

/** Which permission lets a user see — and restore — each kind of deleted record. */
export const DELETE_PERMISSION: Record<DeletableType, string> = {
  client:   'clients.delete',
  guard:    'guards.delete',
  staff:    'staff.delete',
  contract: 'contracts.delete',
  site:     'sites.delete',
};

export const DELETE_PERMISSIONS = Object.values(DELETE_PERMISSION);

/** Each restore lives on its entity's own routes, beside the delete. */
const RESTORE_PATH: Record<DeletableType, (id: string) => string> = {
  client:   (id) => `/clients/${id}/restore`,
  guard:    (id) => `/guards/${id}/restore`,
  staff:    (id) => `/staff/${id}/restore`,
  contract: (id) => `/contracts/${id}/restore`,
  site:     (id) => `/clients/sites/${id}/restore`,
};

export const deletedRecordsApi = {
  list(type: DeletableType): Promise<DeletedRecord[]> {
    return api
      .get<{ success: boolean; data: DeletedRecord[] }>('/deleted-records', { params: { type } })
      .then((r) => r.data.data);
  },

  restore(type: DeletableType, id: string): Promise<{ id: string; name: string }> {
    return api.post(RESTORE_PATH[type](id)).then((r) => r.data.data);
  },
};
