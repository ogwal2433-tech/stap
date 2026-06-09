import api from './api';
import type {
  InvoiceResponse,
  PaymentResponse,
  DeductionResponse,
  PayrollRunResponse,
  PayslipResponse,
  CashbookEntryResponse,
  ARAgingReport,
  PayrollSummary,
  PaginatedResponse,
  CreateInvoiceInput,
  RecordPaymentInput,
  CreateDeductionInput,
  RunPayrollInput,
  CashbookEntryInput,
} from '@stap/shared';

// ── Invoices ──────────────────────────────────────────────────────────────────

export const invoicesApi = {
  list(params?: {
    clientId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<InvoiceResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<InvoiceResponse>>('/finance/invoices', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getById(id: string): Promise<InvoiceResponse> {
    return api
      .get<{ success: boolean; data: InvoiceResponse }>(`/finance/invoices/${id}`)
      .then((r) => r.data.data);
  },

  create(data: CreateInvoiceInput): Promise<InvoiceResponse> {
    return api
      .post<{ success: boolean; data: InvoiceResponse }>('/finance/invoices', data)
      .then((r) => r.data.data);
  },

  recordPayment(invoiceId: string, data: Omit<RecordPaymentInput, 'invoiceId'>): Promise<PaymentResponse> {
    return api
      .post<{ success: boolean; data: PaymentResponse }>(`/finance/invoices/${invoiceId}/pay`, data)
      .then((r) => r.data.data);
  },

  initiateYoPayment(invoiceId: string): Promise<{ paymentRef: string; status: string }> {
    return api
      .post<{ success: boolean; data: { paymentRef: string; status: string } }>(
        `/finance/invoices/${invoiceId}/yo-payment`,
      )
      .then((r) => r.data.data);
  },

  getARAgingReport(): Promise<ARAgingReport> {
    return api
      .get<{ success: boolean; data: ARAgingReport }>('/finance/invoices/aging')
      .then((r) => r.data.data);
  },

  sendEmail(invoiceId: string): Promise<void> {
    return api
      .post(`/finance/invoices/${invoiceId}/send-email`)
      .then(() => undefined);
  },

  runAutoSend(): Promise<void> {
    return api
      .post('/finance/invoices/run-auto-send')
      .then(() => undefined);
  },
};

// ── Deductions ────────────────────────────────────────────────────────────────

export const deductionsApi = {
  list(params?: { guardId?: string; status?: string }): Promise<DeductionResponse[]> {
    return api
      .get<{ success: boolean; data: DeductionResponse[] }>('/finance/deductions', { params })
      .then((r) => r.data.data);
  },

  create(data: CreateDeductionInput): Promise<DeductionResponse> {
    return api
      .post<{ success: boolean; data: DeductionResponse }>('/finance/deductions', data)
      .then((r) => r.data.data);
  },

  cancel(id: string): Promise<DeductionResponse> {
    return api
      .patch<{ success: boolean; data: DeductionResponse }>(`/finance/deductions/${id}/cancel`)
      .then((r) => r.data.data);
  },
};

// ── Payroll ───────────────────────────────────────────────────────────────────

export const payrollApi = {
  list(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<PayrollRunResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<PayrollRunResponse>>('/finance/payroll', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  calculate(data: RunPayrollInput): Promise<PayrollSummary> {
    return api
      .post<{ success: boolean; data: PayrollSummary }>('/finance/payroll/calculate', data)
      .then((r) => r.data.data);
  },

  approve(id: string): Promise<PayrollRunResponse> {
    return api
      .post<{ success: boolean; data: PayrollRunResponse }>(`/finance/payroll/${id}/approve`)
      .then((r) => r.data.data);
  },

  disburse(id: string): Promise<void> {
    return api.post(`/finance/payroll/${id}/disburse`).then(() => undefined);
  },

  getDetail(id: string): Promise<PayrollRunResponse & { payslips: PayslipResponse[] }> {
    return api
      .get<{ success: boolean; data: PayrollRunResponse & { payslips: PayslipResponse[] } }>(
        `/finance/payroll/${id}`,
      )
      .then((r) => r.data.data);
  },

  getPayslips(runId: string): Promise<PayslipResponse[]> {
    return api
      .get<{ success: boolean; data: PayslipResponse[] }>(`/finance/payroll/${runId}/payslips`)
      .then((r) => r.data.data);
  },

  getPayslip(id: string): Promise<PayslipResponse> {
    return api
      .get<{ success: boolean; data: PayslipResponse }>(`/finance/payslips/${id}`)
      .then((r) => r.data.data);
  },
};

// ── Cashbook ──────────────────────────────────────────────────────────────────

export const cashbookApi = {
  list(params?: {
    month?: number;
    year?: number;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<CashbookEntryResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<CashbookEntryResponse>>('/finance/cashbook', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  addEntry(data: CashbookEntryInput): Promise<CashbookEntryResponse> {
    return api
      .post<{ success: boolean; data: CashbookEntryResponse }>('/finance/cashbook', data)
      .then((r) => r.data.data);
  },

  getMonthSummary(month: number, year: number): Promise<{
    totalIn: number;
    totalOut: number;
    netCash: number;
    openingBalance: number;
    closingBalance: number;
  }> {
    return api
      .get<{ success: boolean; data: any }>('/finance/cashbook/summary', { params: { month, year } })
      .then((r) => r.data.data);
  },
};
