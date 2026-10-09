import api from './api';
import type {
  InvoiceResponse,
  InvoicePreviewResponse,
  PaymentResponse,
  DeductionResponse,
  StaffDeductionResponse,
  PayrollRunResponse,
  PayslipResponse,
  CashbookEntryResponse,
  ARAgingReport,
  PayrollSummary,
  PaginatedResponse,
  CreateInvoiceInput,
  GenerateInvoiceInput,
  UpdateInvoiceInput,
  RecordPaymentInput,
  AddFeeIncrementInput,
  CreateDeductionInput,
  CreateStaffDeductionInput,
  RunPayrollInput,
  RunStaffPayrollInput,
  SharePayrollInput,
  CashbookEntryInput,
  FlagPayslipInput,
  ZonePayrollRosterResponse,
  CompanyPayrollRosterResponse,
  StaffPayrollRosterResponse,
  PayrollShareResponse,
} from '@security360/shared';

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

  /**
   * Opens the invoice PDF in a new tab. Fetched through the API client rather
   * than a plain link, because the access token is held in memory and would not
   * be sent on a bare navigation.
   */
  openInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
    return api
      .get(`/finance/invoices/${invoiceId}/pdf`, { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
        const win = window.open(url, '_blank', 'noopener');
        // Popup blocked — fall back to a download so the user still gets it.
        if (!win) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `${invoiceNumber.replace(/[^A-Za-z0-9]/g, '_')}.pdf`;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
  },

  addFeeIncrement(invoiceId: string, data: AddFeeIncrementInput): Promise<InvoiceResponse> {
    return api
      .post<{ success: boolean; data: InvoiceResponse }>(`/finance/invoices/${invoiceId}/increment`, data)
      .then((r) => r.data.data);
  },

  /** Edits a still-PENDING invoice; supplied line items replace the rows wholesale. */
  update(invoiceId: string, data: UpdateInvoiceInput): Promise<InvoiceResponse> {
    return api
      .patch<{ success: boolean; data: InvoiceResponse }>(`/finance/invoices/${invoiceId}`, data)
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

  /** Voids, never deletes: the invoice stays on file marked VOID with the reason. */
  voidInvoice(invoiceId: string, reason: string): Promise<{ id: string; name: string }> {
    return api.post(`/finance/invoices/${invoiceId}/void`, { reason }).then((r) => r.data.data);
  },

  /**
   * The aging report takes the same narrowing as the invoice list — which days
   * and which customer — minus the paging, since a page of buckets would total
   * something nobody owes.
   */
  getARAgingReport(params?: { clientId?: string; from?: string; to?: string }): Promise<ARAgingReport> {
    return api
      .get<{ success: boolean; data: ARAgingReport }>('/finance/invoices/aging', { params })
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

  getInvoicePreview(params: {
    contractId:  string;
    billingDays?: number;
  }): Promise<InvoicePreviewResponse> {
    return api
      .get<{ success: boolean; data: InvoicePreviewResponse }>('/finance/invoices/preview', { params })
      .then((r) => r.data.data);
  },

  generate(data: GenerateInvoiceInput): Promise<InvoiceResponse> {
    return api
      .post<{ success: boolean; data: InvoiceResponse }>('/finance/invoices/generate', data)
      .then((r) => r.data.data);
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
  list(params?: { page?: number; limit?: number; runType?: string }): Promise<PaginatedResponse<PayrollRunResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<PayrollRunResponse>>('/finance/payroll', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  calculate(data: RunPayrollInput): Promise<PayrollSummary> {
    return api
      .post<{ success: boolean; data: PayrollSummary }>('/finance/payroll/calculate', data)
      .then((r) => r.data.data);
  },

  /** Zone → sites → employees tick-list for a period. */
  zoneRoster(month: number, year: number): Promise<ZonePayrollRosterResponse> {
    return api
      .get<{ success: boolean; data: ZonePayrollRosterResponse }>('/finance/payroll/zones-roster', { params: { month, year } })
      .then((r) => r.data.data);
  },

  /** Company-wide tick-list: every deployed guard for a period, zone ignored. */
  companyRoster(month: number, year: number): Promise<CompanyPayrollRosterResponse> {
    return api
      .get<{ success: boolean; data: CompanyPayrollRosterResponse }>('/finance/payroll/company-roster', { params: { month, year } })
      .then((r) => r.data.data);
  },

  approve(id: string): Promise<PayrollRunResponse> {
    return api
      .post<{ success: boolean; data: PayrollRunResponse }>(`/finance/payroll/${id}/approve`)
      .then((r) => r.data.data);
  },

  mdApprove(id: string): Promise<PayrollRunResponse> {
    return api
      .post<{ success: boolean; data: PayrollRunResponse }>(`/finance/payroll/${id}/md-approve`)
      .then((r) => r.data.data);
  },

  hrApprove(id: string, notes?: string): Promise<PayrollRunResponse> {
    return api
      .post<{ success: boolean; data: PayrollRunResponse }>(`/finance/payroll/${id}/hr-approve`, { notes })
      .then((r) => r.data.data);
  },

  disburse(id: string): Promise<void> {
    return api.post(`/finance/payroll/${id}/disburse`).then(() => undefined);
  },

  reject(id: string, reason: string): Promise<PayrollRunResponse> {
    return api
      .post<{ success: boolean; data: PayrollRunResponse }>(`/finance/payroll/${id}/reject`, { reason })
      .then((r) => r.data.data);
  },

  remove(id: string): Promise<void> {
    return api.delete(`/finance/payroll/${id}`).then(() => undefined);
  },

  flagPayslip(payslipId: string, data: FlagPayslipInput): Promise<PayslipResponse> {
    return api
      .patch<{ success: boolean; data: PayslipResponse }>(`/finance/payroll/payslips/${payslipId}/flag`, data)
      .then((r) => r.data.data);
  },

  unflagPayslip(payslipId: string): Promise<PayslipResponse> {
    return api
      .patch<{ success: boolean; data: PayslipResponse }>(`/finance/payroll/payslips/${payslipId}/unflag`)
      .then((r) => r.data.data);
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

  // ── Printable exports of a calculated run ─────────────────────────────────
  // Fetched through the API client rather than linked directly, because the
  // access token is held in memory and would not be sent on a bare navigation.

  async downloadRunExcel(runId: string, filename: string): Promise<void> {
    const r = await api.get(`/finance/payroll/${runId}/export/excel`, { responseType: 'blob' });
    downloadBlob(r.data as Blob, filename);
  },

  async downloadRunPdf(runId: string, filename: string): Promise<void> {
    const r = await api.get(`/finance/payroll/${runId}/export/pdf`, { responseType: 'blob' });
    downloadBlob(r.data as Blob, filename);
  },
};

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Cashbook ──────────────────────────────────────────────────────────────────

export const staffPayrollApi = {
  roster(month: number, year: number): Promise<StaffPayrollRosterResponse> {
    return api
      .get<{ success: boolean; data: StaffPayrollRosterResponse }>('/finance/payroll/staff-roster', { params: { month, year } })
      .then((r) => r.data.data);
  },

  calculate(data: RunStaffPayrollInput): Promise<PayrollSummary> {
    return api
      .post<{ success: boolean; data: PayrollSummary }>('/finance/staff-payroll/calculate', data)
      .then((r) => r.data.data);
  },
};

export const staffDeductionsApi = {
  list(params?: { userId?: string; status?: string }): Promise<StaffDeductionResponse[]> {
    return api
      .get<{ success: boolean; data: StaffDeductionResponse[] }>('/finance/staff-deductions', { params })
      .then((r) => r.data.data);
  },

  create(data: CreateStaffDeductionInput): Promise<StaffDeductionResponse> {
    return api
      .post<{ success: boolean; data: StaffDeductionResponse }>('/finance/staff-deductions', data)
      .then((r) => r.data.data);
  },

  cancel(id: string): Promise<StaffDeductionResponse> {
    return api
      .patch<{ success: boolean; data: StaffDeductionResponse }>(`/finance/staff-deductions/${id}/cancel`)
      .then((r) => r.data.data);
  },
};

export const payrollSharesApi = {
  share(runId: string, data: SharePayrollInput): Promise<PayrollShareResponse[]> {
    return api
      .post<{ success: boolean; data: PayrollShareResponse[] }>(`/finance/payroll/${runId}/share`, data)
      .then((r) => r.data.data);
  },

  list(params?: { runId?: string; format?: string }): Promise<PayrollShareResponse[]> {
    return api
      .get<{ success: boolean; data: PayrollShareResponse[] }>('/finance/shares', { params })
      .then((r) => r.data.data);
  },

  async download(shareId: string, filename: string): Promise<void> {
    const r = await api.get(`/finance/shares/${shareId}/download`, { responseType: 'blob' });
    downloadBlob(r.data as Blob, filename);
  },
};

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
