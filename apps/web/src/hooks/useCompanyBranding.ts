import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COMPANY_BRANDING_DEFAULTS, resolveCompanyBranding, type CompanyBranding, type CompanyBrandingKey } from '@stap/shared';
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
  return { ...query, data: resolveCompanyBranding(query.data) };
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
