import api from './api';

export interface InvoicePaymentResponse {
  id:                string;
  invoiceId:         string;
  extReference:      string;
  phone:             string;
  network:           string;
  amountPaid:        number;
  status:            string;
  xcelTransactionId: string | null;
  failureReason:     string | null;
  initiatedBy:       string;
  initiatedAt:       string;
  resolvedAt:        string | null;
}

export interface InitiatePaymentResult {
  extReference: string;
  network:      string;
  status:       string;
}

export interface PaymentStatusResult {
  status:            string;
  xcelTransactionId: string | null;
  failureReason:     string | null;
}

export const paymentsApi = {
  initiate(invoiceId: string, phone: string): Promise<InitiatePaymentResult> {
    return api
      .post<{ success: boolean; data: InitiatePaymentResult }>(`/payments/invoice/${invoiceId}`, { phone })
      .then((r) => r.data.data);
  },

  getStatus(extReference: string): Promise<PaymentStatusResult> {
    return api
      .get<{ success: boolean; data: PaymentStatusResult }>(`/payments/status/${extReference}`)
      .then((r) => r.data.data);
  },

  listForInvoice(invoiceId: string): Promise<InvoicePaymentResponse[]> {
    return api
      .get<{ success: boolean; data: InvoicePaymentResponse[] }>(`/payments/invoice/${invoiceId}`)
      .then((r) => r.data.data);
  },
};
