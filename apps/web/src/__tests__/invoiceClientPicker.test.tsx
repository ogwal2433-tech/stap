import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClientResponse } from '@security360/shared';
import InvoiceFormModal from '../components/finance/InvoiceFormModal';

/**
 * The invoice form loaded one unfiltered page of clients — the first 20 by
 * name — so any client past that could not be invoiced. It now searches the
 * server as the user types. These drive the client field and check what is
 * asked of the API and what the contract field does as a result.
 */

const h = vi.hoisted(() => ({
  calls: [] as { search?: string; limit?: number }[],
  hasNext: false,
}));

const client = (id: string, clientName: string) =>
  ({ id, clientName, systemId: `S360C-${id}` }) as unknown as ClientResponse;

// The first page by name, and a client that is only ever reachable by search.
const FIRST_PAGE = [client('1', 'Acacia Mall'), client('2', 'Bugolobi Flats')];
const ZETA       = client('99', 'Zeta Security Ltd');

vi.mock('../hooks/useClients', () => ({
  useClientList: (params: { search?: string; limit?: number }) => {
    h.calls.push(params);
    const data = params.search
      ? [ZETA, ...FIRST_PAGE].filter((c) => c.clientName.toLowerCase().includes(params.search!.toLowerCase()))
      : FIRST_PAGE;
    return { data: { data, pagination: { hasNext: h.hasNext } }, isLoading: false };
  },
}));

vi.mock('../hooks/useContracts', () => ({
  useClientContracts: () => ({ data: [] }),
}));

vi.mock('../hooks/useFinance', () => ({
  useGenerateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../lib/finance.api', () => ({
  invoicesApi: { getInvoicePreview: vi.fn(() => Promise.resolve({ lineItems: [] })) },
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const draw = () => render(<InvoiceFormModal onClose={() => {}} />);

// By name: the contract field is a native <select>, which is a combobox too.
const clientField   = () => screen.getByRole('combobox', { name: 'Client' });
const contractField = () => document.querySelector('select') as HTMLSelectElement;
const search        = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText(/Type a client name/), { target: { value: text } });

beforeEach(() => {
  h.calls = [];
  h.hasNext = false;
});

describe('invoice form client picker', () => {
  it('asks for the first page of clients by name, without a search', () => {
    draw();
    expect(h.calls[0]).toMatchObject({ search: undefined, limit: 20, sortBy: 'clientName' });
  });

  it('sends what is typed to the API once typing pauses', async () => {
    draw();
    fireEvent.click(clientField());
    search('zeta');

    await waitFor(() => expect(h.calls.at(-1)?.search).toBe('zeta'));
  });

  it('reaches a client that is not on the first page', async () => {
    draw();
    // The contract field waits for a client.
    expect(contractField()).toBeDisabled();

    fireEvent.click(clientField());
    search('zeta');
    const option = await screen.findByRole('option', { name: /Zeta Security Ltd/ });
    fireEvent.click(option);

    expect(clientField()).toHaveTextContent('Zeta Security Ltd');
    expect(contractField()).not.toBeDisabled();
  });

  it('keeps the chosen client named after the search is reset', async () => {
    draw();
    fireEvent.click(clientField());
    search('zeta');
    fireEvent.click(await screen.findByRole('option', { name: /Zeta Security Ltd/ }));

    // Selecting resets the search, so Zeta is no longer in the loaded results.
    await waitFor(() => expect(h.calls.at(-1)?.search).toBeUndefined());
    expect(clientField()).toHaveTextContent('Zeta Security Ltd');
  });

  it('clearing the client disables the contract field again', async () => {
    draw();
    fireEvent.click(clientField());
    fireEvent.click(screen.getByRole('option', { name: /Acacia Mall/ }));
    expect(contractField()).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(clientField()).toHaveTextContent('Search and select a client');
    expect(contractField()).toBeDisabled();
  });

  it('says so when a search finds nothing', async () => {
    draw();
    fireEvent.click(clientField());
    search('xyz');

    expect(await screen.findByText('No clients match "xyz"')).toBeInTheDocument();
  });

  it('tells the user to keep typing when more clients match than are shown', () => {
    h.hasNext = true;
    draw();
    fireEvent.click(clientField());

    expect(screen.getByText(/Showing the first 20 — keep typing/)).toBeInTheDocument();
  });
});
