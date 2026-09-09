import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BillingSummary } from '@stap/shared';
import BillingSummaryCard from '../components/clients/BillingSummaryCard';

const q = vi.hoisted(() => ({
  data: undefined as BillingSummary | undefined,
  isLoading: false,
  isError: false,
  calls: [] as { clientId: string; enabled: boolean }[],
}));

vi.mock('../hooks/useClients', () => ({
  useClientBillingSummary: (clientId: string, enabled: boolean) => {
    q.calls.push({ clientId, enabled });
    return { data: q.data, isLoading: q.isLoading, isError: q.isError };
  },
}));

const summary = (o: Partial<BillingSummary> = {}): BillingSummary => ({
  totalMonthlyBilling:     3_400_000,
  activeContractCount:     1,
  totalGuardsDeployed:     4,
  activeContracts:         [],
  totalOutstanding:        10_599_880,
  outstandingInvoiceCount: 4,
  totalOverdue:            7_199_920,
  overdueCount:            3,
  lastPayment:             { amount: 300_000, paidAt: '2026-08-29T18:52:44.501Z' },
  ...o,
});

const draw = (canView = true) =>
  render(<BillingSummaryCard clientId="client-kcca-001" canView={canView} />);

beforeEach(() => {
  q.data = summary();
  q.isLoading = false;
  q.isError = false;
  q.calls = [];
});

describe('permission gate', () => {
  it('renders nothing without contracts.view', () => {
    const { container } = draw(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not even request the figures without permission', () => {
    // A hidden card that still fetched would put the amounts in the network
    // tab of someone not allowed to see them.
    draw(false);
    expect(q.calls.every((c) => c.enabled === false)).toBe(true);
  });

  it('requests them with permission', () => {
    draw(true);
    expect(q.calls.some((c) => c.enabled === true)).toBe(true);
  });
});

describe('the headline figure', () => {
  it('is the monthly total, grouped for reading', () => {
    draw();
    expect(screen.getByText('UGX 3,400,000')).toBeInTheDocument();
  });

  it('says what the figure covers', () => {
    draw();
    expect(screen.getByText(/1 active contract · 4 guards deployed/)).toBeInTheDocument();
  });

  it('singularises a single guard', () => {
    q.data = summary({ totalGuardsDeployed: 1, activeContractCount: 1 });
    draw();
    expect(screen.getByText(/1 active contract · 1 guard deployed/)).toBeInTheDocument();
  });

  it('explains a zero rather than leaving it bare', () => {
    // "UGX 0" alone reads as a data problem; the sentence says it is a fact.
    q.data = summary({ totalMonthlyBilling: 0, activeContractCount: 0, totalGuardsDeployed: 0 });
    draw();
    expect(screen.getByText('UGX 0')).toBeInTheDocument();
    expect(screen.getByText(/not currently being billed/)).toBeInTheDocument();
  });
});

describe('amounts owed', () => {
  it('shows outstanding and overdue with their invoice counts', () => {
    draw();
    expect(screen.getByText('UGX 10,599,880')).toBeInTheDocument();
    expect(screen.getByText('UGX 7,199,920')).toBeInTheDocument();
    expect(screen.getByText('4 invoices')).toBeInTheDocument();
    expect(screen.getByText('3 invoices')).toBeInTheDocument();
  });

  it('warns when money is past due', () => {
    draw();
    expect(screen.getByText(/3 overdue invoices/)).toBeInTheDocument();
    expect(screen.getByText(/past its due date/)).toBeInTheDocument();
  });

  it('stays quiet when nothing is overdue', () => {
    q.data = summary({ totalOverdue: 0, overdueCount: 0 });
    draw();
    expect(screen.queryByText(/past its due date/)).not.toBeInTheDocument();
    expect(screen.getByText('0 invoices')).toBeInTheDocument();
  });

  it('singularises a lone overdue invoice', () => {
    q.data = summary({ overdueCount: 1, totalOverdue: 500_000 });
    draw();
    expect(screen.getByText(/1 overdue invoice/)).toBeInTheDocument();
  });
});

describe('last payment', () => {
  it('shows the amount and the date', () => {
    draw();
    expect(screen.getByText('UGX 300,000')).toBeInTheDocument();
    expect(screen.getByText('29 Aug 2026')).toBeInTheDocument();
  });

  it('says so plainly when there has never been one', () => {
    q.data = summary({ lastPayment: null });
    draw();
    expect(screen.getByText('No payments yet')).toBeInTheDocument();
  });
});

describe('while loading or on failure', () => {
  it('shows placeholders, never a zero that looks like a fact', () => {
    q.isLoading = true;
    q.data = undefined;
    draw();
    expect(screen.getByLabelText('Loading billing summary')).toBeInTheDocument();
    expect(screen.queryByText('UGX 0')).not.toBeInTheDocument();
  });

  it('disappears rather than breaking the page it sits on', () => {
    q.isError = true;
    q.data = undefined;
    const { container } = draw();
    expect(container).toBeEmptyDOMElement();
  });
});
