import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marketingApi } from '../lib/marketing.api';
import type {
  CreateProspectInput, UpdateProspectInput, CreateBidInput, UpdateBidInput,
  CreateTargetInput, MarketingReportType,
} from '@stap/shared';

export function useProspects(params?: {
  status?: string; search?: string; limit?: number; assignedToId?: string;
}) {
  return useQuery({
    queryKey: ['marketing', 'prospects', params],
    queryFn:  () => marketingApi.listProspects({ limit: 200, ...params }),
  });
}

export function useProspect(id: string | null) {
  return useQuery({
    queryKey: ['marketing', 'prospect', id],
    queryFn:  () => marketingApi.getProspect(id!),
    enabled:  Boolean(id),
  });
}

/** Anything that moves the pipeline invalidates every marketing figure. */
function useMarketingMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['marketing'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useCreateProspect = () =>
  useMarketingMutation<CreateProspectInput>(marketingApi.createProspect);

export const useUpdateProspect = () =>
  useMarketingMutation<{ id: string; data: UpdateProspectInput }>(({ id, data }) =>
    marketingApi.updateProspect(id, data));

export const useConvertProspect = () =>
  useMarketingMutation<string>((id) => marketingApi.convertProspect(id));

export function useBids(params?: { status?: string; bidType?: string; search?: string }) {
  return useQuery({
    queryKey: ['marketing', 'bids', params],
    queryFn:  () => marketingApi.listBids({ limit: 200, ...params }),
  });
}

export const useCreateBid = () => useMarketingMutation<CreateBidInput>(marketingApi.createBid);

export const useUpdateBid = () =>
  useMarketingMutation<{ id: string; data: UpdateBidInput }>(({ id, data }) =>
    marketingApi.updateBid(id, data));

export function useTargets(params?: { assignedToId?: string; period?: string }) {
  return useQuery({
    queryKey: ['marketing', 'targets', params],
    queryFn:  () => marketingApi.listTargets(params),
  });
}

export const useCreateTarget = () => useMarketingMutation<CreateTargetInput>(marketingApi.createTarget);

export function useMarketingDashboard() {
  return useQuery({
    queryKey: ['marketing', 'dashboard'],
    queryFn:  () => marketingApi.dashboard(),
  });
}

export function useMarketingReport(
  type: MarketingReportType,
  params?: { dateFrom?: string; dateTo?: string; assignedToId?: string },
) {
  return useQuery({
    queryKey: ['marketing', 'report', type, params],
    queryFn:  () => marketingApi.report(type, params),
  });
}
