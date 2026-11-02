import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateGunInput } from '@security360/shared';
import { gunsApi } from '../lib/guns.api';
import type {
  RegisterGunInput, RegisterGunBatchInput, AdjustBulletsInput, DeployGunInput, WithdrawGunInput, TransferGunInput,
} from '@security360/shared';

export function useGuns(params?: { status?: string; siteId?: string; gunType?: string }) {
  return useQuery({
    queryKey: ['guns', params],
    queryFn:  () => gunsApi.list(params),
  });
}

export function useGunInventory() {
  return useQuery({
    queryKey: ['guns', 'inventory'],
    queryFn:  () => gunsApi.inventory(),
  });
}

export function useGunMovements(params?: { gunId?: string; movementType?: string; limit?: number }) {
  return useQuery({
    queryKey: ['guns', 'movements', params],
    queryFn:  () => gunsApi.movements(params),
  });
}

export function useGun(id: string | null) {
  return useQuery({
    queryKey: ['guns', 'detail', id],
    queryFn:  () => gunsApi.get(id!),
    enabled:  Boolean(id),
  });
}

/** Every gun mutation shifts the armoury, so they all invalidate the same root. */
function useGunMutation<TInput>(fn: (data: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['guns'] }),
  });
}

export const useRegisterGun = () => useGunMutation<RegisterGunInput>(gunsApi.register);
export const useDeployGun   = () => useGunMutation<DeployGunInput>(gunsApi.deploy);
export const useWithdrawGun = () => useGunMutation<WithdrawGunInput>(gunsApi.withdraw);
export const useTransferGun = () => useGunMutation<TransferGunInput>(gunsApi.transfer);
export const useRegisterGunBatch = () => useGunMutation<RegisterGunBatchInput>(gunsApi.registerBatch);

export function useAdjustBullets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdjustBulletsInput }) => gunsApi.adjustBullets(id, body),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['guns'] }); },
  });
}

export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => gunsApi.reconcile(),
  });
}

export function useUpdateGun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateGunInput }) => gunsApi.update(id, body),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['guns'] }); },
  });
}

export function useDeleteGun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gunsApi.remove(id),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['guns'] }); },
  });
}
