import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClientImportPreview, ClientImportResult, ClientImportRow } from '@stap/shared';
import ClientImportModal from '../components/clients/ClientImportModal';

/**
 * The modal is the only place a user sees what the import will do before it
 * happens, so these tests are about what it shows and what it sends — the
 * parsing itself is the server's job and is tested there.
 */

const h = vi.hoisted(() => ({
  preview:   undefined as ClientImportPreview | undefined,
  result:    undefined as ClientImportResult | undefined,
  sentRows:  [] as ClientImportRow[],
  templateCalls: 0,
  toasts:    [] as string[],
}));

vi.mock('../hooks/useClients', () => ({
  useClientImportTemplate: () => ({
    isPending: false,
    mutate: () => { h.templateCalls += 1; },
  }),
  useClientImportPreview: () => ({
    isPending: false,
    mutateAsync: async () => h.preview!,
  }),
  useClientImportConfirm: () => ({
    isPending: false,
    mutateAsync: async (rows: ClientImportRow[]) => { h.sentRows = rows; return h.result!; },
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: (msg: string) => { h.toasts.push(msg); } }),
}));

const row = (o: Partial<ClientImportRow> = {}): ClientImportRow => ({
  rowNumber: 3,
  clientName: 'Kampala Heights Ltd',
  gunsDeployed: 2,
  location: 'Kira Road',
  contractStatus: 'Active',
  guardsDeployed: 6,
  startDate: '2026-02-01T00:00:00.000Z',
  amount: 4_800_000,
  isValid: true,
  errors: [],
  warnings: [],
  willCreateContract: true,
  ...o,
});

const preview = (rows: ClientImportRow[]): ClientImportPreview => ({
  totalRows:    rows.length,
  validCount:   rows.filter((r) => r.isValid).length,
  invalidCount: rows.filter((r) => !r.isValid).length,
  rows,
});

/** Gets the modal to step 2 by selecting a file and clicking through. */
async function toPreview(rows: ClientImportRow[]) {
  h.preview = preview(rows);
  render(<ClientImportModal show onClose={() => {}} />);

  const input = screen.getByLabelText('Excel file');
  const file  = new File(['x'], 'clients.xlsx', { type: 'application/vnd.ms-excel' });
  fireEvent.change(input, { target: { files: [file] } });

  fireEvent.click(screen.getByRole('button', { name: /Preview import/i }));
  await waitFor(() => expect(screen.getByText(/Ready to import/i)).toBeInTheDocument());
}

beforeEach(() => {
  h.preview = undefined;
  h.result  = undefined;
  h.sentRows = [];
  h.templateCalls = 0;
  h.toasts = [];
});

describe('step 1 — choosing a file', () => {
  it('lists the seven columns and says what the import fills in', () => {
    render(<ClientImportModal show onClose={() => {}} />);

    expect(screen.getByText('Client Name')).toBeInTheDocument();
    expect(screen.getByText('Amount — Monthly (UGX)')).toBeInTheDocument();
    // The assumptions are stated before anyone uploads, not discovered afterwards.
    expect(screen.getByText(/To be confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
    expect(screen.getByText(/12 months/)).toBeInTheDocument();
  });

  it('cannot preview until a file is chosen', () => {
    render(<ClientImportModal show onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /Preview import/i })).toBeDisabled();
  });

  it('refuses a file that is not a spreadsheet', () => {
    render(<ClientImportModal show onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Excel file'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(h.toasts.join(' ')).toMatch(/Only \.xlsx or \.xls/i);
    expect(screen.getByRole('button', { name: /Preview import/i })).toBeDisabled();
  });

  it('downloads the template on request', () => {
    render(<ClientImportModal show onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Download the Excel template/i }));
    expect(h.templateCalls).toBe(1);
  });
});

describe('step 2 — review and select', () => {
  it('summarises the rows and ticks the valid ones', async () => {
    await toPreview([row(), row({ rowNumber: 4, clientName: null, isValid: false, errors: ['Client name is required'] })]);

    expect(screen.getByText('Client name is required')).toBeInTheDocument();
    expect(screen.getByText('1 row selected')).toBeInTheDocument();
    // An invalid row gets no checkbox at all, so it cannot be sent.
    expect(screen.queryByLabelText('Select row 4')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select row 3')).toBeChecked();
  });

  it('leaves a client already on file unticked', async () => {
    await toPreview([row({ warnings: ['A client with this name is already on file — this row will be skipped'] })]);
    expect(screen.getByLabelText('Select row 3')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Import 0 clients/i })).toBeDisabled();
  });

  it('shows which rows will get a contract and which are client-only', async () => {
    await toPreview([
      row(),
      row({ rowNumber: 4, clientName: 'No Billing Ltd', guardsDeployed: null, amount: null, willCreateContract: false }),
    ]);
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Client only')).toBeInTheDocument();
  });

  it('shows warnings on a row that still imports', async () => {
    await toPreview([row({ warnings: ['4,800,000 does not divide evenly by 7 guards'] })]);
    expect(screen.getByText(/does not divide evenly/)).toBeInTheDocument();
    expect(screen.getByLabelText('Select row 3')).toBeChecked();
  });

  it('deselects and reselects rows', async () => {
    await toPreview([row(), row({ rowNumber: 4, clientName: 'Second Ltd' })]);

    fireEvent.click(screen.getByRole('button', { name: /Deselect all/i }));
    expect(screen.getByText('0 rows selected')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select row 4'));
    expect(screen.getByText('1 row selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Select all valid/i }));
    expect(screen.getByText('2 rows selected')).toBeInTheDocument();
  });

  it('sends only the ticked valid rows', async () => {
    h.result = { imported: 1, skipped: 0, failed: 0, contractsCreated: 1, rows: [
      { rowNumber: 3, name: 'Kampala Heights Ltd', status: 'IMPORTED', note: 'Client and contract created', contractCreated: true },
    ] };
    await toPreview([row(), row({ rowNumber: 4, clientName: 'Second Ltd' })]);

    fireEvent.click(screen.getByLabelText('Select row 4'));
    fireEvent.click(screen.getByRole('button', { name: /Import 1 client/i }));

    await waitFor(() => expect(screen.getByText(/Import complete/i)).toBeInTheDocument());
    expect(h.sentRows.map((r) => r.rowNumber)).toEqual([3]);
  });
});

describe('step 3 — results', () => {
  it('reports each row and reminds that contacts still need filling in', async () => {
    h.result = {
      imported: 1, skipped: 1, failed: 0, contractsCreated: 1,
      rows: [
        { rowNumber: 3, name: 'Kampala Heights Ltd', status: 'IMPORTED', note: 'Client and contract created', contractCreated: true },
        { rowNumber: 4, name: 'Second Ltd',          status: 'SKIPPED',  note: 'Already on file',             contractCreated: false },
      ],
    };
    await toPreview([row(), row({ rowNumber: 4, clientName: 'Second Ltd' })]);
    fireEvent.click(screen.getByRole('button', { name: /Import 2 clients/i }));

    await waitFor(() => expect(screen.getByText(/Import complete/i)).toBeInTheDocument());
    expect(screen.getByText('IMPORTED')).toBeInTheDocument();
    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(screen.getByText(/still needs a real contact person/i)).toBeInTheDocument();
  });

  it('tells the caller to refresh its list', async () => {
    let refreshed = 0;
    h.result = { imported: 1, skipped: 0, failed: 0, contractsCreated: 0, rows: [] };
    h.preview = preview([row()]);

    render(<ClientImportModal show onClose={() => {}} onImported={() => { refreshed += 1; }} />);
    fireEvent.change(screen.getByLabelText('Excel file'), {
      target: { files: [new File(['x'], 'clients.xlsx', { type: 'application/vnd.ms-excel' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Preview import/i }));
    await waitFor(() => expect(screen.getByText(/Ready to import/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Import 1 client/i }));
    await waitFor(() => expect(refreshed).toBe(1));
  });
});
