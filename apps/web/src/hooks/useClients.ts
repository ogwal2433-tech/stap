import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '../lib/clients.api';
import type {
  ClientListQuery, CreateClientInput, UpdateClientInput, CreateSiteInput,
  UpdateSiteInput, CreateIncidentInput, GrantClientPortalInput,
} from '@stap/shared';

export function useClientList(params?: Partial<ClientListQuery>) {
  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => clientsApi.list(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useClientSummary() {
  return useQuery({
    queryKey: ['client-summary'],
    queryFn: () => clientsApi.getSummary(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientInput) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateClientInput> }) =>
      clientsApi.update(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', variables.id] });
    },
  });
}

export function useArchiveClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsApi.archive(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
}

export function useAllSites() {
  return useQuery({
    queryKey: ['all-sites'],
    queryFn:  () => clientsApi.getAllSites({ limit: 500 }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });
}

export function useClientSites(clientId: string) {
  return useQuery({
    queryKey: ['client-sites', clientId],
    queryFn: () => clientsApi.getSites(clientId),
    enabled: Boolean(clientId),
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: Omit<CreateSiteInput, 'clientId'> }) =>
      clientsApi.createSite(clientId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-sites', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, clientId, data }: { siteId: string; clientId: string; data: Partial<UpdateSiteInput> }) =>
      clientsApi.updateSite(siteId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-sites', variables.clientId] });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, clientId }: { siteId: string; clientId: string }) =>
      clientsApi.deleteSite(siteId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-sites', variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] });
    },
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, data }: { siteId: string; data: Omit<CreateIncidentInput, 'siteId'> }) =>
      clientsApi.createIncident(siteId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['site-incidents', variables.siteId] });
    },
  });
}

export function useSiteIncidents(siteId: string, page = 1) {
  return useQuery({
    queryKey: ['site-incidents', siteId, page],
    queryFn: () => clientsApi.getSiteIncidents(siteId, page),
    enabled: Boolean(siteId),
  });
}

// ── Client portal access ──────────────────────────────────────────────────────
// The portal is managed from the client profile, so every mutation refreshes
// the account list the panel renders.

export function useClientPortalAccounts(clientId: string) {
  return useQuery({
    queryKey: ['client-portal', clientId],
    queryFn:  () => clientsApi.listPortalAccounts(clientId),
    enabled:  Boolean(clientId),
  });
}

export function useGrantClientPortal(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GrantClientPortalInput) => clientsApi.grantPortalAccess(clientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal', clientId] });
    },
  });
}

export function useRevokeClientPortal(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId?: string) => clientsApi.revokePortalAccess(clientId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal', clientId] });
    },
  });
}

export function useResetClientPortalPassword(clientId: string) {
  return useMutation({
    mutationFn: (vars: { userId: string; newPassword: string }) =>
      clientsApi.resetPortalPassword(clientId, vars.userId, vars.newPassword),
  });
}
