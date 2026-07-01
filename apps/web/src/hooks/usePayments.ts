import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../lib/payments.api';

export function useInitiatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, phone }: { invoiceId: string; phone: string }) =>
      paymentsApi.initiate(invoiceId, phone),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function usePaymentStatus(extReference: string, enabled: boolean) {
  return useQuery({
    queryKey:     ['payment-status', extReference],
    queryFn:      () => paymentsApi.getStatus(extReference),
    enabled:      enabled && !!extReference,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' ? 10_000 : false;
    },
  });
}

export function useInvoicePayments(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-payments', invoiceId],
    queryFn:  () => paymentsApi.listForInvoice(invoiceId),
    enabled:  !!invoiceId,
  });
}
