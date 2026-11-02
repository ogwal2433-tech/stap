import api from './api';
import type {
  GunResponse, GunWithHistory, GunMovementResponse, GunInventoryRow,
  RegisterGunInput, RegisterGunBatchInput, AdjustBulletsInput,
  UpdateGunInput, DeployGunInput, WithdrawGunInput, TransferGunInput,
} from '@security360/shared';

export const gunsApi = {
  list(params?: { status?: string; siteId?: string; gunType?: string }): Promise<GunResponse[]> {
    return api
      .get<{ success: boolean; data: GunResponse[] }>('/guns', { params })
      .then((r) => r.data.data);
  },

  inventory(): Promise<GunInventoryRow[]> {
    return api
      .get<{ success: boolean; data: GunInventoryRow[] }>('/guns/inventory')
      .then((r) => r.data.data);
  },

  movements(params?: { gunId?: string; movementType?: string; limit?: number }): Promise<GunMovementResponse[]> {
    return api
      .get<{ success: boolean; data: GunMovementResponse[] }>('/guns/movements', { params })
      .then((r) => r.data.data);
  },

  update(id: string, body: UpdateGunInput): Promise<GunResponse> {
    return api
      .patch<{ success: boolean; data: GunResponse }>(`/guns/${id}`, body)
      .then((r) => r.data.data);
  },

  /** `retired` when the gun had a movement history and was kept instead. */
  remove(id: string): Promise<{ deleted: boolean; retired: boolean }> {
    return api
      .delete<{ success: boolean; data: { deleted: boolean; retired: boolean } }>(`/guns/${id}`)
      .then((r) => r.data.data);
  },

  get(id: string): Promise<GunWithHistory> {
    return api
      .get<{ success: boolean; data: GunWithHistory }>(`/guns/${id}`)
      .then((r) => r.data.data);
  },

  register(data: RegisterGunInput): Promise<GunResponse> {
    return api
      .post<{ success: boolean; data: GunResponse }>('/guns', data)
      .then((r) => r.data.data);
  },

  registerBatch(data: RegisterGunBatchInput): Promise<GunResponse[]> {
    return api
      .post<{ success: boolean; data: GunResponse[] }>('/guns/batch', data)
      .then((r) => r.data.data);
  },

  adjustBullets(id: string, data: AdjustBulletsInput): Promise<GunResponse> {
    return api
      .post<{ success: boolean; data: GunResponse }>(`/guns/${id}/adjust-bullets`, data)
      .then((r) => r.data.data);
  },

  reconcile(): Promise<{ ok: boolean; checkedAt: string; stockMismatches: unknown[]; ammoMismatches: unknown[] }> {
    return api
      .get<{ success: boolean; data: { ok: boolean; checkedAt: string; stockMismatches: unknown[]; ammoMismatches: unknown[] } }>('/guns/reconcile')
      .then((r) => r.data.data);
  },

  deploy(data: DeployGunInput): Promise<GunMovementResponse> {
    return api
      .post<{ success: boolean; data: GunMovementResponse }>('/guns/deploy', data)
      .then((r) => r.data.data);
  },

  withdraw(data: WithdrawGunInput): Promise<GunMovementResponse> {
    return api
      .post<{ success: boolean; data: GunMovementResponse }>('/guns/withdraw', data)
      .then((r) => r.data.data);
  },

  transfer(data: TransferGunInput): Promise<GunMovementResponse> {
    return api
      .post<{ success: boolean; data: GunMovementResponse }>('/guns/transfer', data)
      .then((r) => r.data.data);
  },
};
