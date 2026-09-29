import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    invoice:  { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    payment:  { create: vi.fn(), aggregate: vi.fn() },
    client:   { findUnique: vi.fn() },
    contract: { findMany: vi.fn(), findUnique: vi.fn() },
    invoicePayment:      { aggregate: vi.fn() },
    invoiceCarryForward: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit:        vi.fn().mockResolvedValue(undefined),
    sendEmail:       vi.fn().mockResolvedValue(undefined),
    generateInvoice: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../lib/yoPayments', () => ({
  yoPayments: { requestPayment: vi.fn().mockResolvedValue({ success: true, transactionRef: 'YO-STUB', status: 'PENDING', message: 'ok' }) },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { invoiceService } from '../../services/invoiceService';

const mp = prisma as any;

const MOCK_CLIENT = {
  id: 'client-1', clientName: 'KCCA', email: 'kcca@test.ug', contactPhone: '+256700000001', billingTerms: 30,
};

const MOCK_INVOICE = {
  id: 'inv-1', clientId: 'client-1', contractId: null,
  invoiceNumber: 'S360/INV/2026/0001',
  periodStart: new Date('2026-04-01'), periodEnd: new Date('2026-04-30'),
  guardsDeployed: 3, ratePerGuard: 800000, subtotal: 2400000, taxAmount: 0, totalAmount: 2400000,
  status: 'PENDING', dueDate: new Date('2026-05-01'), paidAt: null, pdfPath: null, yoPaymentRef: null,
  createdAt: new Date(), updatedAt: new Date(),
  client: { clientName: 'KCCA' }, contract: null, payments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.client.findUnique.mockResolvedValue(MOCK_CLIENT);
  mp.invoice.count.mockResolvedValue(0);
  mp.invoice.create.mockResolvedValue(MOCK_INVOICE);
  mp.invoice.findUnique.mockResolvedValue(MOCK_INVOICE);
  mp.invoice.findMany.mockResolvedValue([MOCK_INVOICE]);
  mp.invoice.findFirst.mockResolvedValue(null);
  // No balances carried from earlier invoices unless a test says otherwise.
  mp.invoiceCarryForward.findMany.mockResolvedValue([]);
  mp.payment.create.mockResolvedValue({
    id: 'pay-1', invoiceId: 'inv-1', amountPaid: 2400000, mode: 'BANK',
    referenceNumber: null, yoTransactionId: null, reconciled: false,
    recordedBy: 'user-1', createdAt: new Date(),
  });
  mp.invoice.update.mockResolvedValue({ ...MOCK_INVOICE, status: 'PAID', paidAt: new Date() });
  mp.invoice.updateMany.mockResolvedValue({ count: 0 });
  mp.contract.findMany.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('invoiceService.create()', () => {
  it('generates correct invoice number (S360/INV/YEAR/XXXX)', async () => {
    const inv = await invoiceService.create(
      { clientId: 'client-1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-30T23:59:59.000Z',
        guardsDeployed: 3, ratePerGuard: 800000, taxAmount: 0, dueDate: '2026-05-01T00:00:00.000Z' },
      'user-1',
    );
    expect(inv.invoiceNumber).toMatch(/^S360\/INV\/\d{4}\/\d{4}$/);
  });

  it('calculates subtotal and totalAmount correctly', async () => {
    await invoiceService.create(
      { clientId: 'client-1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-30T23:59:59.000Z',
        guardsDeployed: 3, ratePerGuard: 800000, taxAmount: 120000, dueDate: '2026-05-01T00:00:00.000Z' },
      'user-1',
    );
    const createCall = mp.invoice.create.mock.calls[0][0].data;
    expect(createCall.subtotal).toBe(2400000);     // 3 * 800000
    expect(createCall.totalAmount).toBe(2520000);  // 2400000 + 120000
  });

  it('enqueues PDF generation job', async () => {
    await invoiceService.create(
      { clientId: 'client-1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-30T23:59:59.000Z',
        guardsDeployed: 3, ratePerGuard: 800000, taxAmount: 0, dueDate: '2026-05-01T00:00:00.000Z' },
      'user-1',
    );
    expect(QueueService.generateInvoice).toHaveBeenCalled();
  });

  it('enqueues email job when client has email', async () => {
    await invoiceService.create(
      { clientId: 'client-1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-30T23:59:59.000Z',
        guardsDeployed: 3, ratePerGuard: 800000, taxAmount: 0, dueDate: '2026-05-01T00:00:00.000Z' },
      'user-1',
    );
    expect(QueueService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'invoice' }),
    );
  });
});

describe('invoiceService.generateAutoInvoices()', () => {
  const contractWithRates = {
    id: 'c-1', clientId: 'client-1',
    client: { clientName: 'KCCA' },
    guardRates: [{ guardType: 'Guard', guardsCount: 5, ratePerGuard: 500000 }],
  };

  it('creates invoice for contract with matching billing day', async () => {
    const today = new Date();
    mp.contract.findMany.mockResolvedValue([
      { id: 'c-1', clientId: 'client-1', guardsRequired: 5,
        billingDay: today.getDate(), client: { ...MOCK_CLIENT } },
    ]);
    mp.contract.findUnique.mockResolvedValue(contractWithRates);

    await invoiceService.generateAutoInvoices();
    expect(mp.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('skips contract that already has invoice for current period', async () => {
    const today = new Date();
    mp.contract.findMany.mockResolvedValue([
      { id: 'c-1', clientId: 'client-1', guardsRequired: 5,
        billingDay: today.getDate(), client: { ...MOCK_CLIENT } },
    ]);
    mp.contract.findUnique.mockResolvedValue(contractWithRates);
    mp.invoice.findFirst.mockResolvedValue({ id: 'existing-inv' });

    await invoiceService.generateAutoInvoices();
    expect(mp.invoice.create).not.toHaveBeenCalled();
  });

  it('does not throw the whole batch when one contract has no guard rate lines', async () => {
    const today = new Date();
    mp.contract.findMany.mockResolvedValue([
      { id: 'c-1', clientId: 'client-1', guardsRequired: 5,
        billingDay: today.getDate(), client: { ...MOCK_CLIENT } },
    ]);
    mp.contract.findUnique.mockResolvedValue({ ...contractWithRates, guardRates: [] });

    await expect(invoiceService.generateAutoInvoices()).resolves.not.toThrow();
    expect(mp.invoice.create).not.toHaveBeenCalled();
  });
});

describe('invoiceService.recordManualPayment()', () => {
  /** recomputeInvoiceBalance sums manual + mobile-money payments. */
  const mockPaidTotals = (manual: number, momo = 0) => {
    mp.payment.aggregate.mockResolvedValue({ _sum: { amountPaid: manual } });
    mp.invoicePayment.aggregate.mockResolvedValue({ _sum: { amountPaid: momo } });
  };

  it('updates invoice status to PAID when fully paid', async () => {
    mp.invoice.findUnique.mockResolvedValue({ ...MOCK_INVOICE, payments: [] });
    mockPaidTotals(2400000);

    await invoiceService.recordManualPayment(
      { invoiceId: 'inv-1', amountPaid: 2400000, mode: 'BANK' },
      'user-1',
    );

    expect(mp.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', paidAmount: 2400000, outstandingBalance: 0 }),
      }),
    );
    // Nothing left owing, so nothing is carried onto a later invoice.
    expect(mp.invoiceCarryForward.upsert).not.toHaveBeenCalled();
  });

  it('marks the invoice PARTIALLY_PAID and records the balance when paid in part', async () => {
    mp.invoice.findUnique.mockResolvedValue({ ...MOCK_INVOICE, payments: [] });
    mockPaidTotals(1000000);

    await invoiceService.recordManualPayment(
      { invoiceId: 'inv-1', amountPaid: 1000000, mode: 'CASH' },
      'user-1',
    );

    expect(mp.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status:             'PARTIALLY_PAID',
          paidAmount:         1000000,
          outstandingBalance: 1400000,
        }),
      }),
    );
    // The unpaid remainder is queued for the client's next invoice.
    expect(mp.invoiceCarryForward.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ carryAmount: 1400000 }),
      }),
    );
  });
});

describe('invoiceService.getARAgingReport()', () => {
  it('buckets invoices correctly', async () => {
    const now = new Date();
    // `paid` defaults to nothing owed against the total, so a bucket reflects
    // what is still owed rather than what was billed.
    const makeInv = (daysAgo: number, amount: number, paid = 0) => ({
      ...MOCK_INVOICE,
      id: `inv-${daysAgo}`,
      totalAmount: amount,
      paidAmount: paid,
      outstandingBalance: amount - paid,
      dueDate: new Date(now.getTime() - daysAgo * 86_400_000),
      status: paid > 0 ? 'PARTIALLY_PAID' : daysAgo > 0 ? 'OVERDUE' : 'PENDING',
      payments: [],
    });

    mp.invoice.findMany.mockResolvedValue([
      makeInv(0,  500000),   // current
      makeInv(45, 300000),   // 31-60
      makeInv(75, 200000),   // 61-90
      makeInv(100, 100000),  // 90+
    ]);

    const report = await invoiceService.getARAgingReport();
    expect(report.buckets.total).toBe(1100000);
    expect(report.buckets.days31_60).toBe(300000);
    expect(report.buckets.days61_90).toBe(200000);
    expect(report.buckets.over90).toBe(100000);
  });

  it('ages what is still owed, not what was billed', async () => {
    const now = new Date();
    // Half settled: the report should show the remaining 250,000, not 500,000.
    mp.invoice.findMany.mockResolvedValue([{
      ...MOCK_INVOICE,
      id: 'inv-part',
      totalAmount: 500000,
      paidAmount: 250000,
      outstandingBalance: 250000,
      dueDate: new Date(now.getTime() - 45 * 86_400_000),
      status: 'PARTIALLY_PAID',
      payments: [],
    }]);

    const report = await invoiceService.getARAgingReport();
    expect(report.buckets.total).toBe(250000);
    expect(report.buckets.days31_60).toBe(250000);
  });

  it('still counts a part-paid invoice as outstanding', async () => {
    await invoiceService.getARAgingReport();
    // PARTIALLY_PAID has to be in the filter, or a part payment drops the
    // invoice out of the ageing report altogether instead of reducing it.
    const where = mp.invoice.findMany.mock.calls.at(-1)[0].where;
    expect(where.status.in).toContain('PARTIALLY_PAID');
    expect(where.status.in).toEqual(expect.arrayContaining(['PENDING', 'OVERDUE']));
  });

  it('auto-marks overdue invoices', async () => {
    await invoiceService.getARAgingReport();
    expect(mp.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OVERDUE' } }),
    );
  });
});
