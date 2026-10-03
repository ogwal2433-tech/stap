import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { PAYMENT_ACCOUNT_TYPES, type CompanyBankAccountResponse, type CompanyBankAccountCreateInput, type PaymentAccountType } from '@security360/shared';
import { useToast } from '../../context/ToastContext';
import {
  useCompanyBankAccounts,
  useCreateCompanyBankAccount,
  useUpdateCompanyBankAccount,
  useSetDefaultCompanyBankAccount,
  useDeleteCompanyBankAccount,
} from '../../hooks/useCompanyBankAccounts';

const TYPE_LABEL: Record<PaymentAccountType, string> = {
  BANK_ACCOUNT:  'Bank account',
  MOBILE_MONEY:  'Mobile money',
  OTHER:         'Other',
};

/** A blank row for the "add" form. label and type are the only ever-required parts. */
const emptyDraft = (): CompanyBankAccountCreateInput => ({
  label: '', type: 'BANK_ACCOUNT', currency: '', bankName: '', branchName: '',
  branchNo: '', accountName: '', accountNumber: '', isDefault: false, isActive: true,
});

/** The editable subset, kept as plain strings so the inputs never see null. */
type Draft = CompanyBankAccountCreateInput;

function toDraft(a: CompanyBankAccountResponse): Draft {
  return {
    label: a.label, type: a.type, currency: a.currency ?? '', bankName: a.bankName ?? '',
    branchName: a.branchName ?? '', branchNo: a.branchNo ?? '', accountName: a.accountName ?? '',
    accountNumber: a.accountNumber ?? '', isDefault: a.isDefault, isActive: a.isActive,
  };
}

export default function CompanyBankAccountsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: accounts, isLoading } = useCompanyBankAccounts();
  const create = useCreateCompanyBankAccount();
  const update = useUpdateCompanyBankAccount();
  const setDefault = useSetDefaultCompanyBankAccount();
  const remove = useDeleteCompanyBankAccount();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<CompanyBankAccountResponse | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const busy = create.isPending || update.isPending || setDefault.isPending || remove.isPending;

  function openNew() { setDraft(emptyDraft()); setEditing('new'); }
  function openEdit(a: CompanyBankAccountResponse) { setDraft(toDraft(a)); setEditing(a); }
  function close() { setEditing(null); setDraft(emptyDraft()); }

  async function save() {
    const payload: Draft = { ...draft, label: draft.label.trim() };
    if (!payload.label) { showToast('A label is required', 'warning'); return; }
    // Send only the identifier fields that carry a value, so a blank optional
    // column stays empty on the row rather than storing an empty string.
    const clean = {
      ...payload,
      currency: payload.currency?.trim() || null,
      bankName: payload.bankName?.trim() || null,
      branchName: payload.branchName?.trim() || null,
      branchNo: payload.branchNo?.trim() || null,
      accountName: payload.accountName?.trim() || null,
      accountNumber: payload.accountNumber?.trim() || null,
    } as Draft;
    try {
      if (editing === 'new') {
        await create.mutateAsync(clean);
        showToast('Payment account added', 'success');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: clean });
        showToast('Payment account saved', 'success');
      }
      close();
    } catch {
      showToast(editing === 'new' ? 'Could not add the account' : 'Could not save the account', 'danger');
    }
  }

  async function toggleActive(a: CompanyBankAccountResponse) {
    try {
      await update.mutateAsync({ id: a.id, data: { isActive: !a.isActive } });
      showToast(a.isActive ? 'Account deactivated' : 'Account activated', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Could not change the account status', 'danger');
    }
  }

  async function promote(a: CompanyBankAccountResponse) {
    try {
      await setDefault.mutateAsync(a.id);
      showToast(`"${a.label}" is now the default account`, 'success');
    } catch {
      showToast('Could not set the default account', 'danger');
    }
  }

  async function doDelete(a: CompanyBankAccountResponse) {
    try {
      await remove.mutateAsync(a.id);
      showToast('Payment account removed', 'success');
    } catch {
      showToast('Could not remove the account', 'danger');
    } finally {
      setConfirmDelete(null);
    }
  }

  if (isLoading) return <div className="text-center p-4"><Spinner /></div>;
  const list = accounts ?? [];

  return (
    <div className="card border-0 shadow-sm mt-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h6 className="fw-semibold mb-1">Payment accounts — printed on invoices</h6>
            <small className="text-muted">
              Every active account is listed on the invoice PDF so a client can choose where to pay. The default
              one also appears wherever a document names a single account.
            </small>
          </div>
          {canEdit && <Button size="sm" variant="primary" onClick={openNew} disabled={busy}>+ Add account</Button>}
        </div>

        {list.length === 0 && (
          <Alert variant="info" className="small mb-0">
            No payment accounts yet. Add one and it will print on the next invoice.
          </Alert>
        )}

        <div className="d-flex flex-column gap-2">
          {list.map((a) => (
            <div key={a.id} className="border rounded p-3 d-flex justify-content-between align-items-start">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold">{a.label}</span>
                  <Badge bg="light" text="dark" className="border">{TYPE_LABEL[a.type]}</Badge>
                  {a.currency && <Badge bg="secondary">{a.currency}</Badge>}
                  {a.isDefault && <Badge bg="success">Default</Badge>}
                  {!a.isActive && <Badge bg="warning" text="dark">Inactive</Badge>}
                </div>
                <div className="small text-muted mt-1">
                  {a.bankName && <span>{a.bankName}{a.branchName ? ` · ${a.branchName}` : ''}<br /></span>}
                  {a.accountName && <span>Account name: {a.accountName}<br /></span>}
                  {a.accountNumber && <span>Account no: {a.accountNumber}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="d-flex flex-wrap gap-1 justify-content-end">
                  <Button size="sm" variant="outline-secondary" onClick={() => openEdit(a)} disabled={busy}>Edit</Button>
                  {!a.isDefault && <Button size="sm" variant="outline-success" onClick={() => promote(a)} disabled={busy}>Set default</Button>}
                  <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(a)} disabled={busy}>{a.isActive ? 'Deactivate' : 'Activate'}</Button>
                  {confirmDelete === a.id
                    ? <>
                        <Button size="sm" variant="danger" onClick={() => doDelete(a)} disabled={busy}>Confirm</Button>
                        <Button size="sm" variant="link" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Button>
                      </>
                    : <Button size="sm" variant="outline-danger" onClick={() => setConfirmDelete(a.id)} disabled={busy}>Delete</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal show={editing !== null} onHide={close} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editing === 'new' ? 'Add payment account' : 'Edit payment account'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3" controlId="cba-label">
              <Form.Label>Label <span className="text-danger">*</span></Form.Label>
              <Form.Control value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. UGX Current, MTN MoMo" />
            </Form.Group>
            <Form.Group className="mb-3" controlId="cba-type">
              <Form.Label>Type</Form.Label>
              <Form.Select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as PaymentAccountType }))}>
                {PAYMENT_ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3" controlId="cba-currency">
              <Form.Label>Currency <span className="text-muted small">(optional)</span></Form.Label>
              <Form.Control value={draft.currency ?? ''} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))} placeholder="UGX, USD…" />
            </Form.Group>
            {draft.type === 'BANK_ACCOUNT' && (
              <>
                <Form.Group className="mb-3" controlId="cba-bank">
                  <Form.Label>Bank name</Form.Label>
                  <Form.Control value={draft.bankName ?? ''} onChange={(e) => setDraft((d) => ({ ...d, bankName: e.target.value }))} />
                </Form.Group>
                <div className="d-flex gap-2">
                  <Form.Group className="mb-3 flex-fill" controlId="cba-branch">
                    <Form.Label>Branch name</Form.Label>
                    <Form.Control value={draft.branchName ?? ''} onChange={(e) => setDraft((d) => ({ ...d, branchName: e.target.value }))} />
                  </Form.Group>
                  <Form.Group className="mb-3 flex-fill" controlId="cba-branchno">
                    <Form.Label>Branch no. <span className="text-muted small">(not printed)</span></Form.Label>
                    <Form.Control value={draft.branchNo ?? ''} onChange={(e) => setDraft((d) => ({ ...d, branchNo: e.target.value }))} />
                  </Form.Group>
                </div>
              </>
            )}
            <Form.Group className="mb-3" controlId="cba-acctname">
              <Form.Label>Account name</Form.Label>
              <Form.Control value={draft.accountName ?? ''} onChange={(e) => setDraft((d) => ({ ...d, accountName: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="cba-acctno">
              <Form.Label>
                {draft.type === 'MOBILE_MONEY' ? 'Merchant / phone number' : 'Account number'}
                {draft.type !== 'OTHER' && <span className="text-danger"> *</span>}
              </Form.Label>
              <Form.Control value={draft.accountNumber ?? ''} onChange={(e) => setDraft((d) => ({ ...d, accountNumber: e.target.value }))} />
            </Form.Group>
            <div className="d-flex gap-3">
              <Form.Check type="checkbox" id="cba-default" label="Set as default" checked={!!draft.isDefault} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} disabled={editing === 'new' && list.length === 0} />
              <Form.Check type="checkbox" id="cba-active" label="Active" checked={draft.isActive !== false} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} />
            </div>
            <Form.Text className="text-muted d-block mt-2">
              Only filled-in fields print. A branch number is stored for reference but never appears on an invoice.
            </Form.Text>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save account'}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
