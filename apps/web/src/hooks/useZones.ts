import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zonesApi } from '../lib/zones.api';
import type { CreateZoneInput, UpdateZoneInput } from '@stap/shared';

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
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateZoneInput }) => zonesApi.update(id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}
