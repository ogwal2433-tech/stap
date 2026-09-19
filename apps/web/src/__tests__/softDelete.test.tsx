import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeleteConfirmModal from '../components/shared/DeleteConfirmModal';
import VoidInvoiceModal from '../components/finance/VoidInvoiceModal';

/**
 * Soft delete in the browser: the confirmation dialogs, and that every delete
 * and void control asks for its permission rather than a role list.
 */

const refusal = (message: string) => ({ response: { status: 409, data: { error: message } } });

describe('DeleteConfirmModal', () => {
  const draw = (onConfirm = vi.fn(() => Promise.resolve()), onHide = vi.fn()) => {
    render(
      <DeleteConfirmModal show onHide={onHide} onConfirm={onConfirm}
        entityType="client" entityName="Kampala Heights Ltd" warning="Only once nothing is live." />,
    );
    return { onConfirm, onHide };
  };
  const button = () => screen.getByRole('button', { name: 'Delete' });

  it('names the record, says it can be restored, and shows the rule up front', () => {
    draw();
    expect(screen.getByText(/Kampala Heights Ltd/)).toBeInTheDocument();
    expect(screen.getByText(/Deleted records/)).toBeInTheDocument();
    expect(screen.getByText(/Only once nothing is live/)).toBeInTheDocument();
  });

  it('stays disabled until DELETE is typed exactly', () => {
    draw();
    const input = screen.getByLabelText('Type DELETE to confirm');
    expect(button()).toBeDisabled();
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(button()).toBeDisabled();
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(button()).not.toBeDisabled();
  });

  it('deletes and closes', async () => {
    const { onConfirm, onHide } = draw();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(button());
    await waitFor(() => expect(onHide).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a refusal in the dialog and stays open', async () => {
    const { onHide } = draw(vi.fn(() => Promise.reject(refusal('Kampala Heights Ltd still has 2 sites.'))));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(button());

    expect(await screen.findByText('Kampala Heights Ltd still has 2 sites.')).toBeInTheDocument();
    expect(onHide).not.toHaveBeenCalled();
  });
});

describe('VoidInvoiceModal', () => {
  const draw = (onConfirm = vi.fn(() => Promise.resolve())) => {
    render(<VoidInvoiceModal show onHide={() => {}} onConfirm={onConfirm} invoiceNumber="STAP/2026/0042" totalAmount={4_800_000} />);
    return onConfirm;
  };
  const button = () => screen.getByRole('button', { name: 'Void invoice' });

  it('says the invoice is kept, not deleted', () => {
    draw();
    expect(screen.getByText(/stays on file/)).toBeInTheDocument();
    expect(screen.getByText(/UGX 4,800,000/)).toBeInTheDocument();
  });

  it('needs a reason of at least five characters, and sends it trimmed', async () => {
    const onConfirm = draw();
    const reason = screen.getByLabelText(/Reason/);
    fireEvent.change(reason, { target: { value: 'dup' } });
    expect(button()).toBeDisabled();
    fireEvent.change(reason, { target: { value: '  Raised twice for March  ' } });
    fireEvent.click(button());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Raised twice for March'));
  });

  it('shows the server\'s refusal', async () => {
    draw(vi.fn(() => Promise.reject(refusal('STAP/2026/0042 has payments recorded against it and cannot be voided.'))));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong contract' } });
    fireEvent.click(button());
    expect(await screen.findByText(/has payments recorded against it/)).toBeInTheDocument();
  });
});

describe('delete and void controls ask for their permission', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  /** The permission on the nearest PermissionGuard opened before `needle`. */
  function gateBefore(source: string, needle: string): string | null {
    const at = source.indexOf(needle);
    if (at === -1) throw new Error(`"${needle}" not found`);
    const before = source.slice(0, at);
    const open   = before.lastIndexOf('<PermissionGuard permission="');
    const close  = before.lastIndexOf('</PermissionGuard>');
    if (open === -1 || close > open) return null;
    return before.slice(open).match(/permission="([^"]+)"/)![1];
  }

  it('client detail: client, site and contract deletes', () => {
    const page = read('pages/clients/ClientDetailPage.tsx');
    expect(gateBefore(page, "setDeleteTarget({ kind: 'client' })")).toBe('clients.delete');
    expect(gateBefore(page, "setDeleteTarget({ kind: 'site'")).toBe('sites.delete');
    expect(gateBefore(page, "setDeleteTarget({ kind: 'contract'")).toBe('contracts.delete');
    // The old paths: a Director-only role check and a browser confirm().
    expect(page).not.toContain('handleDeleteSite');
    expect(page).not.toMatch(/confirm\('Delete this contract/);
  });

  it('guard detail and staff profile', () => {
    expect(gateBefore(read('pages/guards/GuardDetailPage.tsx'), 'setShowDelete(true)')).toBe('guards.delete');
    const staff = read('components/staff/StaffProfileModal.tsx');
    expect(staff).toContain("useHasPermission('staff.delete')");
    expect(staff).toMatch(/canDelete && !isSelf/);
  });

  it('finance: invoices are voided, under invoices.void', () => {
    expect(gateBefore(read('pages/finance/FinancePage.tsx'), 'setVoidTarget(inv)')).toBe('invoices.void');
  });

  it('the Deleted records page is linked for anyone holding a delete permission, and routed', () => {
    const sidebar = read('components/layout/Sidebar.tsx');
    expect(sidebar).toMatch(/to: '\/admin\/deleted', anyPermission: DELETE_PERMISSIONS/);
    expect(read('App.tsx')).toContain('<Route path="/admin/deleted"');
  });
});
