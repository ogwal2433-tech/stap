import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClientResponse } from '@security360/shared';
import InvoiceFormModal from '../components/finance/InvoiceFormModal';

/**
 * A contract's rate lines are the starting point of an invoice, not its full
 * story: relief cover, a part-month posting or a transport charge all belong on
 * the same bill. These drive the contract-loaded table, add a line on top of it,
 * and follow both through to the payload — the API already takes every line from
 * `lineItemOverrides`, so the only thing that was missing was a way to add one.
 */

const h = vi.hoisted(() => ({
  generate: vi.fn(() => Promise.resolve({ id: 'inv-1' })),
  preview:  vi.fn(() => Promise.resolve({
    lineItems: [
      { guardType: 'Armed Guard', count: 4, ratePerGuard: 16666.67, billingDays: 30, lineTotal: 2000000.4 },
    ],
  })),
}));

const CLIENT = { id: '1', clientName: 'Acacia Mall', systemId: 'SSLC-1' } as unknown as ClientResponse;

const CONTRACT = {
  id: 'c-1', status: 'ACTIVE', totalMonthlyValue: 2000000, guardsRequired: 4, guardRates: [],
} as any;

vi.mock('../hooks/useClients', () => ({
  useClientList: () => ({ data: { data: [CLIENT], pagination: { hasNext: false } }, isLoading: false }),
}));

vi.mock('../hooks/useContracts', () => ({
  useClientContracts: () => ({ data: [CONTRACT] }),
}));

vi.mock('../hooks/useFinance', () => ({
  useGenerateInvoice: () => ({ mutateAsync: h.generate, isPending: false }),
}));

vi.mock('../lib/finance.api', () => ({
  invoicesApi: { getInvoicePreview: h.preview },
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

/** Client picked, contract chosen, and its one rate line on screen. */
async function openWithContractLine() {
  render(<InvoiceFormModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Client' }));
  fireEvent.click(await screen.findByRole('option', { name: /Acacia Mall/ }));

  // The contract field is a plain <select> with no accessible name to aim at.
  fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: CONTRACT.id } });

  await screen.findByText('Armed Guard');
}

beforeEach(() => {
  h.generate.mockClear();
  h.preview.mockClear();
});

describe('extra lines on a contract invoice', () => {
  it('leaves the contract line without a description field of its own', async () => {
    await openWithContractLine();

    // Only the rows added here are nameable; the contract's own line keeps the
    // guard type the contract holds.
    expect(screen.queryByPlaceholderText(/Night guard/)).not.toBeInTheDocument();
  });

  it('adds a typed line beside the contract lines and bills both', async () => {
    await openWithContractLine();
    fireEvent.click(screen.getByRole('button', { name: /Add line/ }));

    const description = screen.getByPlaceholderText(/Night guard/) as HTMLInputElement;
    fireEvent.change(description, { target: { value: 'Relief cover, weekend' } });

    // Two rate fields now: the contract line's, and the added one (last).
    const rates = screen.getAllByPlaceholderText('e.g. 16666.67');
    fireEvent.change(rates[rates.length - 1], { target: { value: '50000' } });

    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-01' } });
    fireEvent.change(end,   { target: { value: '2026-09-30' } });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Invoice' }));

    expect(h.generate).toHaveBeenCalledWith({
      contractId: CONTRACT.id,
      billingPeriodStart: new Date('2026-09-01').toISOString(),
      billingPeriodEnd:   new Date('2026-09-30').toISOString(),
      billingDays: 30,
      lineItemOverrides: [
        { guardType: 'Armed Guard', count: 4, ratePerGuard: 16666.67, billingDays: 30 },
        { guardType: 'Relief cover, weekend', count: 1, ratePerGuard: 50000, billingDays: 30 },
      ],
    });
  });

  it('refuses to generate while an added line has no description', async () => {
    await openWithContractLine();
    fireEvent.click(screen.getByRole('button', { name: /Add line/ }));

    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-01' } });
    fireEvent.change(end,   { target: { value: '2026-09-30' } });

    // An unnamed line would reach the client as a charge with nothing on it.
    expect(screen.getByRole('button', { name: 'Generate Invoice' })).toBeDisabled();
  });

  it('removes an added line but never a contract line', async () => {
    await openWithContractLine();
    fireEvent.click(screen.getByRole('button', { name: /Add line/ }));

    // One remove control, belonging to the row just added.
    const removes = screen.getAllByTitle('Remove this line');
    expect(removes).toHaveLength(1);

    fireEvent.click(removes[0]);
    expect(screen.queryByPlaceholderText(/Night guard/)).not.toBeInTheDocument();
    expect(screen.getByText('Armed Guard')).toBeInTheDocument();
  });
});
