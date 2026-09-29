import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClientResponse } from '@security360/shared';
import InvoiceFormModal from '../components/finance/InvoiceFormModal';

/**
 * A line's rate is a daily figure, and the one that matters — a contract's
 * monthly rate divided by 30 — is rarely whole. The field used to parse to an
 * integer, so 16666.67 arrived at the server as 16666. These drive the manual
 * line with the values a number input reports, and follow them through the line
 * total and the payload.
 */

const h = vi.hoisted(() => ({ generate: vi.fn(() => Promise.resolve({ id: 'inv-1' })) }));

const CLIENT = { id: '1', clientName: 'Acacia Mall', systemId: 'S360C-1' } as unknown as ClientResponse;

vi.mock('../hooks/useClients', () => ({
  useClientList: () => ({ data: { data: [CLIENT], pagination: { hasNext: false } }, isLoading: false }),
}));

vi.mock('../hooks/useContracts', () => ({
  useClientContracts: () => ({ data: [] }),
}));

vi.mock('../hooks/useFinance', () => ({
  useGenerateInvoice: () => ({ mutateAsync: h.generate, isPending: false }),
}));

vi.mock('../lib/finance.api', () => ({
  invoicesApi: { getInvoicePreview: vi.fn(() => Promise.resolve({ lineItems: [] })) },
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const rateField = () => screen.getByPlaceholderText('e.g. 16666.67') as HTMLInputElement;

/** One manual line on screen, with the client picked and the switch flipped. */
async function openOneManualLine() {
  render(<InvoiceFormModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Client' }));
  fireEvent.click(await screen.findByRole('option', { name: /Acacia Mall/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /No contract yet/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add line/ }));
}

beforeEach(() => {
  h.generate.mockClear();
});

describe('invoice line rate accepts two decimals', () => {
  it('keeps the decimals of every rate it is handed', async () => {
    await openOneManualLine();
    const input = rateField();

    // Each step is a value a number input reports back whole. Binding the field
    // to parseInt(e.target.value) used to truncate all of these to 16666.
    for (const v of ['16666', '16666.6', '16666.67']) {
      fireEvent.change(input, { target: { value: v } });
      expect(input.value).toBe(v);
    }
  });

  it('shows the line total with the cents it now carries', async () => {
    await openOneManualLine();
    fireEvent.change(rateField(), { target: { value: '16666.67' } });

    // 1 guard × 16666.67 × 30 days = 500,000.10 — a whole-shilling rate would
    // have billed 500,010 or 500,000 depending on how it was rounded. The figure
    // is repeated on the line, the table footer and the summary band.
    expect(screen.getAllByText('UGX 500,000.10').length).toBeGreaterThan(0);
    expect(screen.queryByText('UGX 500,000.5')).not.toBeInTheDocument();
  });

  it('sends the rate as a number, not a rounded one', async () => {
    await openOneManualLine();
    fireEvent.change(screen.getByPlaceholderText(/Night guard/), { target: { value: 'Relief cover' } });
    fireEvent.change(rateField(), { target: { value: '16666.67' } });
    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-01' } });
    fireEvent.change(end,   { target: { value: '2026-09-30' } });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Invoice' }));

    expect(h.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: '1',
        lineItemOverrides: [
          { guardType: 'Relief cover', count: 1, ratePerGuard: 16666.67, billingDays: 30 },
        ],
      }),
    );
  });
});
