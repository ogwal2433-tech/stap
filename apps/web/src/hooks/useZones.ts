import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zonesApi } from '../lib/zones.api';
import { clientsApi } from '../lib/clients.api';
import type { CreateZoneInput, UpdateZoneInput } from '@security360/shared';

export function useZones(params?: { page?: number; limit?: number; isActive?: boolean; search?: string }) {
  return useQuery({
    queryKey: ['zones', params],
    queryFn:  () => zonesApi.list(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyZones() {
  return useQuery({
    queryKey: ['zones', 'my-zones'],
    queryFn:  () => zonesApi.myZones(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The zone the signed-in supervisor covers. `enabled` is left to the caller so
 * screens can skip the request entirely for roles that work across all zones.
 */
export function useMyZone(enabled = true) {
  return useQuery({
    queryKey:  ['zones', 'my-zone'],
    queryFn:   () => zonesApi.myZone(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useZoneSites(zoneId: string | null | undefined) {
  return useQuery({
    queryKey:  ['zones', zoneId, 'sites'],
    queryFn:   () => zonesApi.listSites(zoneId!),
    enabled:   !!zoneId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useZone(id: string) {
  return useQuery({
    queryKey: ['zones', id],
    queryFn:  () => zonesApi.getById(id),
    enabled:  !!id,
  });
}

export function useZoneRosterData(zoneId: string | null, date: string) {
  return useQuery({
    queryKey: ['zone-roster-data', zoneId, date],
    queryFn:  () => zonesApi.getRosterData(zoneId!, date),
    enabled:  !!zoneId && !!date,
    staleTime: 60 * 1000,
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateZoneInput) => zonesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['all-sites'] });
      qc.invalidateQueries({ queryKey: ['sites-all'] });
    },
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateZoneInput }) => zonesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['all-sites'] });
      qc.invalidateQueries({ queryKey: ['sites-all'] });
    },
  });
}

export function useRemoveSitesFromZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteIds }: { id: string; siteIds: string[] }) =>
      Promise.all(siteIds.map((siteId) => clientsApi.updateSite(siteId, { zoneId: null }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['zone-roster-data'] });
      qc.invalidateQueries({ queryKey: ['sites-all'] });
    },
  });
}

export function useDeactivateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => zonesApi.update(id, { isActive: false }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useActivateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => zonesApi.update(id, { isActive: true }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useAssignSitesToZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      zoneId,
      addSiteIds,
      removeSiteIds,
    }: {
      zoneId:        string;
      addSiteIds:    string[];
      removeSiteIds: string[];
    }) => {
      await Promise.all([
        ...addSiteIds.map((id) => clientsApi.updateSite(id, { zoneId })),
        ...removeSiteIds.map((id) => clientsApi.updateSite(id, { zoneId: null })),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['zone-roster-data'] });
      qc.invalidateQueries({ queryKey: ['sites-all'] });
    },
  });
}
