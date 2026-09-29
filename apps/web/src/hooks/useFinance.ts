import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoicesApi, deductionsApi, payrollApi, payrollGroupsApi, cashbookApi } from '../lib/finance.api';
import type {
  CreateInvoiceInput,
  GenerateInvoiceInput,
  RecordPaymentInput,
  AddFeeIncrementInput,
  CreateDeductionInput,
  RunPayrollInput,
  CashbookEntryInput,
  FlagPayslipInput,
  CreatePayrollGroupInput,
  UpdatePayrollGroupInput,
} from '@security360/shared';

// ── Invoice hooks ──────────────────────────────────────────────────────────────

export function useInvoices(params?: Parameters<typeof invoicesApi.list>[0]) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn:  () => invoicesApi.list(params),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn:  () => invoicesApi.getById(id),
    enabled:  !!id,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceInput) => invoicesApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, ...data }: RecordPaymentInput & { invoiceId: string }) =>
      invoicesApi.recordPayment(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      // A payment moves the ageing report and the dashboard's outstanding
      // figure too; without these they kept showing the pre-payment balance
      // until something else happened to refetch them.
      qc.invalidateQueries({ queryKey: ['ar-aging'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddFeeIncrement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, ...data }: AddFeeIncrementInput & { invoiceId: string }) =>
      invoicesApi.addFeeIncrement(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['ar-aging'] });
    },
  });
}

export function useInitiateYoPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.initiateYoPayment(invoiceId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useARAgingReport() {
  return useQuery({
    queryKey: ['invoices', 'aging'],
    queryFn:  () => invoicesApi.getARAgingReport(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateInvoiceInput) => invoicesApi.generate(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

// ── Deduction hooks ────────────────────────────────────────────────────────────

export function useDeductions(params?: { guardId?: string; status?: string }) {
  return useQuery({
    queryKey: ['deductions', params],
    queryFn:  () => deductionsApi.list(params),
  });
}

export function useCreateDeduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDeductionInput) => deductionsApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deductions'] }),
  });
}

export function useCancelDeduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deductionsApi.cancel(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['deductions'] }),
  });
}

// ── Payroll hooks ──────────────────────────────────────────────────────────────

export function usePayrollRuns(params?: { page?: number; limit?: number; payrollGroupId?: string }) {
  return useQuery({
    queryKey: ['payroll', params],
    queryFn:  () => payrollApi.list(params),
  });
}

export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RunPayrollInput) => payrollApi.calculate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      // Deduction statuses change from PENDING → APPLIED during payroll calculation
      qc.invalidateQueries({ queryKey: ['deductions'] });
    },
  });
}

export function useApprovePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.approve(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useHrApprovePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => payrollApi.hrApprove(id, notes),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useDisbursePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.disburse(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useFlagPayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payslipId, data }: { payslipId: string; data: FlagPayslipInput }) =>
      payrollApi.flagPayslip(payslipId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useUnflagPayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payslipId: string) => payrollApi.unflagPayslip(payslipId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function usePayrollDetail(id: string) {
  return useQuery({
    queryKey: ['payroll', id],
    queryFn:  () => payrollApi.getDetail(id),
    enabled:  !!id,
  });
}

// ── Cashbook hooks ─────────────────────────────────────────────────────────────

export function useCashbook(params?: Parameters<typeof cashbookApi.list>[0]) {
  return useQuery({
    queryKey: ['cashbook', params],
    queryFn:  () => cashbookApi.list(params),
  });
}

export function useAddCashbookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CashbookEntryInput) => cashbookApi.addEntry(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      qc.invalidateQueries({ queryKey: ['cashbook-summary'] });
    },
  });
}

export function useCashbookSummary(month: number, year: number) {
  return useQuery({
    queryKey: ['cashbook-summary', month, year],
    queryFn:  () => cashbookApi.getMonthSummary(month, year),
  });
}

// ── Payroll group hooks ─────────────────────────────────────────────────────────────

export function usePayrollGroups() {
  return useQuery({
    queryKey: ['payroll-groups'],
    queryFn:  () => payrollGroupsApi.list(),
  });
}

export function useCreatePayrollGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePayrollGroupInput) => payrollGroupsApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-groups'] }),
  });
}

export function useUpdatePayrollGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePayrollGroupInput }) =>
      payrollGroupsApi.update(id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-groups'] }),
  });
}

export function useDeletePayrollGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollGroupsApi.remove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-groups'] }),
  });
}
