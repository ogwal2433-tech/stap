import { Fragment, useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import type { CompanyBranding } from '@security360/shared';
import { useHasPermission } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { COMPANY_BRANDING_DEFAULTS } from '../../lib/branding';
import { useCompanyBranding, useCompanyBrandingDefaults, useResetCompanyBranding, useSaveCompanyBranding } from '../../hooks/useCompanyBranding';

const fields: Array<{ key: keyof CompanyBranding; label: string; type?: string; group?: string; note?: string }> = [
  { key: 'company_name', label: 'Company name' },
  { key: 'company_short_name', label: 'Company short name' },
  { key: 'company_address', label: 'Company address' },
  { key: 'company_email', label: 'Company email', type: 'email' },
  { key: 'company_phone', label: 'Company phone' },
  // Not type="url": that demands a scheme, and the website is printed as a bare
  // host (www.example.com). The browser would refuse to submit the whole form.
  { key: 'company_website', label: 'Company website' },
  { key: 'company_logo_url', label: 'Company logo URL', type: 'url' },
  { key: 'company_registration_number', label: 'Registration number' },
  { key: 'company_tax_id', label: 'Tax ID' },
  // Kept apart from the letterhead identity: these reach the client as payment
  // instructions on the invoice, so a typo here moves money.
  { key: 'company_bank_name', label: 'Bank name', group: 'Bank details — printed on invoices', note: 'Printed on the invoice PDF and the invoice email. Each one is optional — a blank field prints nothing.' },
  { key: 'company_bank_branch_name', label: 'Bank branch name' },
  { key: 'company_bank_branch_no', label: 'Bank branch no.' },
  { key: 'company_bank_account_name', label: 'Account name' },
  { key: 'company_bank_account', label: 'Bank account number' },
];

export default function CompanyBrandingPanel() {
  const { data, isLoading } = useCompanyBranding();
  const { data: defaults = COMPANY_BRANDING_DEFAULTS } = useCompanyBrandingDefaults();
  const { showToast } = useToast();
  const canEdit = useHasPermission('settings.edit');
  const save = useSaveCompanyBranding();
  const reset = useResetCompanyBranding();
  const [draft, setDraft] = useState<CompanyBranding>(data);
  useEffect(() => setDraft(data), [data]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate(draft, {
      onSuccess: () => showToast('Company branding saved', 'success'),
      onError: () => showToast('Could not save company branding', 'danger'),
    });
  };
  const doReset = () => reset.mutate(undefined, {
    onSuccess: () => showToast('Company branding reset to defaults', 'success'),
    onError: () => showToast('Could not reset company branding', 'danger'),
  });

  if (isLoading) return <div className="text-center p-4"><Spinner /></div>;
  return <div className="card border-0 shadow-sm"><div className="card-body">
    <div className="d-flex justify-content-between align-items-center mb-3">
      <div><h6 className="fw-semibold mb-1">Company Branding</h6><small className="text-muted">Used on company documents, exports, and company-facing screens.</small></div>
      {canEdit && <Button size="sm" variant="outline-danger" disabled={reset.isPending} onClick={doReset}>Reset to defaults</Button>}
    </div>
    <Form onSubmit={submit}>
      {fields.map(({ key, label, type, group, note }, i) => <Fragment key={key}>
        {group && group !== fields[i - 1]?.group && <div className="fw-semibold small text-uppercase text-muted mt-4 mb-3">{group}</div>}
        <Form.Group className="mb-3" controlId={`company-branding-${key}`}>
          <Form.Label>{label}</Form.Label>
          <Form.Control type={type ?? 'text'} value={draft[key]} disabled={!canEdit} onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }))} />
          <Form.Text className="text-muted">{note ?? `Default: ${defaults[key] || 'blank'}`}</Form.Text>
        </Form.Group>
      </Fragment>)}
      {canEdit && <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>}
    </Form>
    {!canEdit && <Alert variant="info" className="small mt-3 mb-0">Read-only access. Contact an administrator with settings.edit to change company branding.</Alert>}
  </div></div>;
}
