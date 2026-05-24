import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zonesApi } from '../lib/zones.api';
import type { CreateZoneInput, UpdateZoneInput } from '@stap/shared';

export function useZones(activeOnly = false) {
  return useQuery({
    queryKey: ['zones', { activeOnly }],
    queryFn:  () => zonesApi.list(activeOnly),
  });
}

export function useZone(id: string | undefined) {
  return useQuery({
    queryKey: ['zones', id],
    queryFn:  () => zonesApi.getById(id!),
    enabled:  !!id,
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateZoneInput) => zonesApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateZoneInput }) =>
      zonesApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['zones', id] });
    },
  });
}

export function useAssignSitesToZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteIds }: { id: string; siteIds: string[] }) =>
      zonesApi.assignSites(id, siteIds),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['zones', id] });
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useRemoveSitesFromZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteIds }: { id: string; siteIds: string[] }) =>
      zonesApi.removeSites(id, siteIds),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['zones', id] });
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useDeactivateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => zonesApi.deactivate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useActivateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => zonesApi.activate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => zonesApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}
