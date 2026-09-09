import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    client:         { findUnique: vi.fn() },
    contract:       { findMany: vi.fn() },
    invoice:        { findMany: vi.fn() },
    payment:        { findFirst: vi.fn() },
    invoicePayment: { findFirst: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { clientService } from '../../services/clientService';
import { NotFoundError } from '../../errors/AppError';

const db = prisma as unknown as {
  client:         { findUnique: ReturnType<typeof vi.fn> };
  contract:       { findMany: ReturnType<typeof vi.fn> };
  invoice:        { findMany: ReturnType<typeof vi.fn> };
  payment:        { findFirst: ReturnType<typeof vi.fn> };
  invoicePayment: { findFirst: ReturnType<typeof vi.fn> };
};

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const contract = (o: Record<string, unknown> = {}) => ({
  id: 'ct1', guardsRequired: 4, totalMonthlyValue: 3_400_000,
  status: 'ACTIVE', contractEnd: daysFromNow(90), ...o,
});

const invoice = (o: Record<string, unknown> = {}) => ({
  id: 'inv1', invoiceNumber: 'INV-001', totalAmount: 1_000_000, paidAmount: 0,
  outstandingBalance: 1_000_000, status: 'PENDING', dueDate: daysFromNow(10), ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findUnique.mockResolvedValue({ id: 'c1' });
  db.contract.findMany.mockResolvedValue([]);
  db.invoice.findMany.mockResolvedValue([]);
  db.payment.findFirst.mockResolvedValue(null);
  db.invoicePayment.findFirst.mockResolvedValue(null);
});

describe('what counts as being billed', () => {
  it('sums contracts in force', async () => {
    db.contract.findMany.mockResolvedValue([
      contract({ totalMonthlyValue: 3_400_000, guardsRequired: 4 }),
      contract({ id: 'ct2', totalMonthlyValue: 2_000_000, guardsRequired: 3, status: 'EXPIRING' }),
    ]);

    const s = await clientService.getBillingSummary('c1');
    expect(s.totalMonthlyBilling).toBe(5_400_000);
    expect(s.activeContractCount).toBe(2);
    expect(s.totalGuardsDeployed).toBe(7);
  });

  it('asks only for ACTIVE and EXPIRING contracts', async () => {
    // A contract in its final month is still invoiced, so EXPIRING counts.
    // DRAFT has not started and EXPIRED has stopped; either would overstate.
    await clientService.getBillingSummary('c1');
    const { where } = db.contract.findMany.mock.calls[0]![0];
    expect(where.status).toEqual({ in: ['ACTIVE', 'EXPIRING'] });
  });

  it('reports zero for a client with nothing in force', async () => {
    const s = await clientService.getBillingSummary('c1');
    expect(s.totalMonthlyBilling).toBe(0);
    expect(s.activeContractCount).toBe(0);
  });

  it('rejects an unknown client instead of reporting zeroes for it', async () => {
    db.client.findUnique.mockResolvedValue(null);
    await expect(clientService.getBillingSummary('nope')).rejects.toThrow(NotFoundError);
  });
});

describe('what is owed', () => {
  it('excludes settled invoices from the query', async () => {
    await clientService.getBillingSummary('c1');
    const { where } = db.invoice.findMany.mock.calls[0]![0];
    expect(where.status).toEqual({ not: 'PAID' });
  });

  it('sums the outstanding balances', async () => {
    db.invoice.findMany.mockResolvedValue([
      invoice({ outstandingBalance: 600_000 }),
      invoice({ id: 'inv2', outstandingBalance: 400_000 }),
    ]);
    const s = await clientService.getBillingSummary('c1');
    expect(s.totalOutstanding).toBe(1_000_000);
    expect(s.outstandingInvoiceCount).toBe(2);
  });

  it('falls back to the arithmetic when the cached balance is zero but money is owed', async () => {
    // outstandingBalance is derived and maintained; a row written before it
    // existed, or left behind by a failed recompute, must not read as settled.
    db.invoice.findMany.mockResolvedValue([
      invoice({ outstandingBalance: 0, totalAmount: 900_000, paidAmount: 200_000 }),
    ]);
    const s = await clientService.getBillingSummary('c1');
    expect(s.totalOutstanding).toBe(700_000);
  });

  it('counts an invoice past its due date even if the status has not caught up', async () => {
    // Status is refreshed when an invoice is touched, so one that fell due this
    // morning can still read PENDING.
    db.invoice.findMany.mockResolvedValue([
      invoice({ status: 'PENDING', dueDate: daysFromNow(-1), outstandingBalance: 500_000 }),
    ]);
    const s = await clientService.getBillingSummary('c1');
    expect(s.overdueCount).toBe(1);
    expect(s.totalOverdue).toBe(500_000);
  });

  it('does not count an invoice that is merely unpaid and not yet due', async () => {
    db.invoice.findMany.mockResolvedValue([invoice({ dueDate: daysFromNow(10) })]);
    const s = await clientService.getBillingSummary('c1');
    expect(s.overdueCount).toBe(0);
    expect(s.totalOutstanding).toBe(1_000_000);
  });
});

describe('last payment', () => {
  it('ignores mobile-money attempts that did not succeed', async () => {
    // The trap: InvoicePayment holds attempts, not receipts. Counting a FAILED
    // or PENDING one would tell a manager money arrived when it did not.
    await clientService.getBillingSummary('c1');
    const { where } = db.invoicePayment.findFirst.mock.calls[0]![0];
    expect(where.status).toBe('SUCCESS');
  });

  it('takes a manual payment when it is the more recent', async () => {
    db.payment.findFirst.mockResolvedValue({
      amountPaid: 300_000, createdAt: new Date('2026-08-29T00:00:00Z'),
    });
    db.invoicePayment.findFirst.mockResolvedValue({
      amountPaid: 100_000, initiatedAt: new Date('2026-08-01T00:00:00Z'), resolvedAt: null,
    });
    const s = await clientService.getBillingSummary('c1');
    expect(s.lastPayment).toEqual({ amount: 300_000, paidAt: '2026-08-29T00:00:00.000Z' });
  });

  it('takes the mobile-money payment when it is the more recent', async () => {
    db.payment.findFirst.mockResolvedValue({
      amountPaid: 300_000, createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    db.invoicePayment.findFirst.mockResolvedValue({
      amountPaid: 100_000,
      initiatedAt: new Date('2026-08-01T00:00:00Z'),
      resolvedAt:  new Date('2026-08-02T00:00:00Z'),
    });
    const s = await clientService.getBillingSummary('c1');
    // Dated when it settled, not when it was started.
    expect(s.lastPayment).toEqual({ amount: 100_000, paidAt: '2026-08-02T00:00:00.000Z' });
  });

  it('works when only one kind of payment exists', async () => {
    db.invoicePayment.findFirst.mockResolvedValue({
      amountPaid: 50_000, initiatedAt: new Date('2026-08-01T00:00:00Z'), resolvedAt: null,
    });
    const s = await clientService.getBillingSummary('c1');
    expect(s.lastPayment?.amount).toBe(50_000);
  });

  it('is null when the client has never paid', async () => {
    const s = await clientService.getBillingSummary('c1');
    expect(s.lastPayment).toBeNull();
  });
});
