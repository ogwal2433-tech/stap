import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveCompanyBranding, type CompanyBranding, type CompanyBrandingKey } from '@stap/shared';
import { COMPANY_BRANDING_DEFAULTS } from '../lib/branding';
import { settingsApi } from '../lib/settings.api';

const QUERY_KEY = ['company-branding'];

export function useCompanyBranding() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: settingsApi.getCompanyBranding,
    initialData: COMPANY_BRANDING_DEFAULTS,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  // Resolved once per server response, not once per render: callers seed form
  // state from this and re-seed when it changes, so a fresh object every render
  // wipes each keystroke and loops the component.
  const data = useMemo(() => resolveCompanyBranding(query.data, COMPANY_BRANDING_DEFAULTS), [query.data]);
  return { ...query, data };
}

/** What this deployment falls back to for each field, as the API resolves it. */
export function useCompanyBrandingDefaults() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'defaults'],
    queryFn: settingsApi.getCompanyBrandingDefaults,
    placeholderData: COMPANY_BRANDING_DEFAULTS,
    staleTime: Infinity,
  });
}

export function useSaveCompanyBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CompanyBranding>) => settingsApi.updateCompanyBranding(patch),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      void qc.invalidateQueries({ queryKey: ['system-settings'] });
    },
  });
}

export function useResetCompanyBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keys?: CompanyBrandingKey[]) => settingsApi.resetCompanyBranding(keys),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      void qc.invalidateQueries({ queryKey: ['system-settings'] });
    },
  });
}
