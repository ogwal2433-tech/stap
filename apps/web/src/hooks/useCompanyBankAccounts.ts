import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyBankAccountCreateInput, CompanyBankAccountUpdateInput } from '@security360/shared';
import { settingsApi } from '../lib/settings.api';

const QUERY_KEY = ['company-bank-accounts'];

export function useCompanyBankAccounts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: settingsApi.listCompanyBankAccounts,
  });
}

/**
 * A payment-account change also moves what an invoice prints, so alongside the
 * list it busts the company-branding cache the invoice reads through.
 */
function useInvalidateOnSuccess() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
    void qc.invalidateQueries({ queryKey: ['company-branding'] });
  };
}

export function useCreateCompanyBankAccount() {
  const invalidate = useInvalidateOnSuccess();
  return useMutation({
    mutationFn: (data: CompanyBankAccountCreateInput) => settingsApi.createCompanyBankAccount(data),
    onSuccess: invalidate,
  });
}

export function useUpdateCompanyBankAccount() {
  const invalidate = useInvalidateOnSuccess();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CompanyBankAccountUpdateInput }) =>
      settingsApi.updateCompanyBankAccount(id, data),
    onSuccess: invalidate,
  });
}

export function useSetDefaultCompanyBankAccount() {
  const invalidate = useInvalidateOnSuccess();
  return useMutation({
    mutationFn: (id: string) => settingsApi.setDefaultCompanyBankAccount(id),
    onSuccess: invalidate,
  });
}

export function useDeleteCompanyBankAccount() {
  const invalidate = useInvalidateOnSuccess();
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteCompanyBankAccount(id),
    onSuccess: invalidate,
  });
}
