import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { GuardResponse } from '@stap/shared';
import { IssueItemModal, ReturnItemModal } from '../pages/inventory/InventoryPage';

/**
 * Issuing and returning items both loaded one unfiltered page of guards — the
 * first 200 — so on a database of 437 guards, 237 of them could not be picked
 * at all. Both fields now search the server as the user types.
 *
 * These drive the guard field and check what is asked of the API: no status or
 * uniform filter, and a guard past the first page is still reachable.
 */

const h = vi.hoisted(() => ({
  calls: [] as { search?: string; limit?: number; status?: string; sortBy?: string }[],
  hasNext: false,
}));

const guard = (id: string, firstName: string, lastName: string) =>
  ({ id, firstName, lastName, systemId: `SSLG${id}`, rank: 'Guard' }) as unknown as GuardResponse;

// The first page by name, and a guard only ever reachable by search.
const FIRST_PAGE = [guard('001', 'Aaron', 'Abaho'), guard('002', 'Betty', 'Birungi')];
const DEEP       = guard('437', 'Zachary', 'Zziwa');

vi.mock('../hooks/useGuards', () => ({
  useGuardList: (params: { search?: string; limit?: number }) => {
    h.calls.push(params);
    const data = params.search
      ? [DEEP, ...FIRST_PAGE].filter((g) =>
          `${g.firstName} ${g.lastName} ${g.systemId}`.toLowerCase().includes(params.search!.toLowerCase()),
        )
      : FIRST_PAGE;
    return { data: { data, pagination: { hasNext: h.hasNext } }, isLoading: false };
  },
  // Names whichever guard is currently chosen, including a pre-set one.
  useGuard: (id: string) => ({
    data: [DEEP, ...FIRST_PAGE].find((g) => g.id === id) ?? undefined,
  }),
}));

vi.mock('../hooks/useInventory', () => ({
  useInventoryItems:       () => ({ data: { data: [], pagination: { hasNext: false } } }),
  useLowStockItems:        () => ({ data: [] }),
  useInventoryTransactions:() => ({ data: { data: [], pagination: { hasNext: false } } }),
  useOutstandingHolders:   () => ({ data: [] }),
  useCreateInventoryItem:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInventoryItem:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReturnItem:           () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAdjustStock:          () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAdjustCondition:      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useBatchIssueItems:      () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const drawIssue  = () => render(<IssueItemModal show onHide={() => {}} />);
const drawReturn = (preGuardId?: string) =>
  render(<ReturnItemModal show preGuardId={preGuardId} onHide={() => {}} />);

const guardField = () => screen.getByRole('combobox', { name: 'Guard' });
const search     = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText(/Type a guard name/), { target: { value: text } });

beforeEach(() => {
  h.calls = [];
  h.hasNext = false;
});

describe('issue items — guard picker', () => {
  it('asks for a page of guards by name, with no status or uniform filter', () => {
    drawIssue();
    expect(h.calls[0]).toMatchObject({ search: undefined, limit: 20, sortBy: 'firstName' });
    expect(h.calls[0]).not.toHaveProperty('status');
  });

  it('sends what is typed to the API once typing pauses', async () => {
    drawIssue();
    fireEvent.click(guardField());
    search('zziwa');

    await waitFor(() => expect(h.calls.at(-1)?.search).toBe('zziwa'));
  });

  it('reaches a guard that is not on the first page', async () => {
    drawIssue();
    fireEvent.click(guardField());
    search('zziwa');

    fireEvent.click(await screen.findByRole('option', { name: /Zachary Zziwa/ }));

    expect(guardField()).toHaveTextContent('Zachary Zziwa');
  });

  it('finds a guard by system ID', async () => {
    drawIssue();
    fireEvent.click(guardField());
    search('SSLG437');

    expect(await screen.findByRole('option', { name: /Zachary Zziwa/ })).toBeInTheDocument();
  });

  it('keeps the chosen guard named after the search is reset', async () => {
    drawIssue();
    fireEvent.click(guardField());
    search('zziwa');
    fireEvent.click(await screen.findByRole('option', { name: /Zachary Zziwa/ }));

    await waitFor(() => expect(h.calls.at(-1)?.search).toBeUndefined());
    expect(guardField()).toHaveTextContent('Zachary Zziwa');
  });

  it('clears the selection', async () => {
    drawIssue();
    fireEvent.click(guardField());
    fireEvent.click(screen.getByRole('option', { name: /Aaron Abaho/ }));
    expect(guardField()).toHaveTextContent('Aaron Abaho');

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(guardField()).toHaveTextContent('Search and select guard');
  });

  it('says so when a search finds nothing', async () => {
    drawIssue();
    fireEvent.click(guardField());
    search('nobody');

    expect(await screen.findByText('No guards match "nobody"')).toBeInTheDocument();
  });

  it('tells the user to keep typing when more guards match than are shown', () => {
    h.hasNext = true;
    drawIssue();
    fireEvent.click(guardField());

    expect(screen.getByText(/Showing the first 20 — keep typing/)).toBeInTheDocument();
  });
});

describe('return items — guard picker', () => {
  it('searches the server rather than listing one page', async () => {
    drawReturn();
    expect(h.calls[0]).toMatchObject({ search: undefined, limit: 20 });

    fireEvent.click(guardField());
    search('zziwa');

    expect(await screen.findByRole('option', { name: /Zachary Zziwa/ })).toBeInTheDocument();
  });

  it('names a guard it was opened with, even one outside the first page', () => {
    // Opening from a holder row pre-sets the guard. Before, a guard past the
    // loaded page left the field blank and the return could not be completed.
    drawReturn(DEEP.id);

    expect(guardField()).toHaveTextContent('Zachary Zziwa');
  });
});
