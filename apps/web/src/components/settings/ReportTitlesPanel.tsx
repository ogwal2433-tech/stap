import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { REPORT_KEYS, REPORT_TITLE_DEFAULTS, type ReportKey, type ReportTitleConfig } from '@stap/shared';
import { useToast } from '../../context/ToastContext';
import { useHasPermission } from '../../context/AuthContext';
import { useReportEmailPrefix, useReportTitles, useResetReportTitle, useSaveReportEmailPrefix, useSaveReportTitle } from '../../hooks/useReportTitles';

const fields = ['title', 'shortTitle', 'subtitle', 'footerText', 'logoUrl'] as const;
export default function ReportTitlesPanel() {
  const { showToast } = useToast();
  const canEdit = useHasPermission('settings.edit');
  const { data: titles = REPORT_TITLE_DEFAULTS, isLoading } = useReportTitles();
  const { data: prefix = 'STAP Report' } = useReportEmailPrefix();
  const save = useSaveReportTitle(); const reset = useResetReportTitle(); const savePrefix = useSaveReportEmailPrefix();
  const [drafts, setDrafts] = useState<Record<string, ReportTitleConfig>>({});
  const [prefixDraft, setPrefixDraft] = useState(prefix);
  const [confirmKey, setConfirmKey] = useState<ReportKey | 'all' | null>(null);
  useEffect(() => setPrefixDraft(prefix), [prefix]);
  useEffect(() => setDrafts(Object.fromEntries(REPORT_KEYS.map(k => [k, { ...titles[k] }]))), [titles]);
  const change = (key: ReportKey, field: keyof ReportTitleConfig, value: string | boolean) => setDrafts(d => ({ ...d, [key]: { ...d[key], [field]: value } }));
  const submit = (key: ReportKey) => save.mutate({ key, config: drafts[key] }, { onSuccess: () => showToast('Report title saved', 'success'), onError: () => showToast('Could not save report title', 'danger') });
  const doReset = () => {
    reset.mutate(confirmKey === 'all' ? undefined : confirmKey!, { onSuccess: () => { showToast('Report title reset to default', 'success'); setConfirmKey(null); }, onError: () => showToast('Could not reset report title', 'danger') });
  };
  return <div className="card border-0 shadow-sm"><div className="card-body">
    <div className="d-flex justify-content-between align-items-center mb-3"><div><h6 className="fw-semibold mb-1">Report Titles</h6><small className="text-muted">Configure document and report headings for this deployment.</small></div>
      {canEdit && <Button size="sm" variant="outline-danger" onClick={() => setConfirmKey('all')}>Reset all</Button>}
    </div>
    {isLoading ? <div className="text-center p-4"><Spinner /></div> : <div className="table-responsive"><Table bordered size="sm" className="align-middle"><thead><tr><th>Key</th><th>Title</th><th>Short Title</th><th>Subtitle</th><th>Footer Text</th><th>Logo URL</th><th>Enabled</th>{canEdit && <th>Actions</th>}</tr></thead>
      <tbody>{REPORT_KEYS.map(key => <tr key={key}><th className="text-nowrap">{key}</th>{fields.map(field => <td key={field} style={{ minWidth: 150 }}><Form.Control size="sm" value={drafts[key]?.[field] ?? ''} disabled={!canEdit} onChange={e => change(key, field, e.target.value)} /></td>)}<td><Form.Check type="switch" checked={drafts[key]?.enabled ?? true} disabled={!canEdit} onChange={e => change(key, 'enabled', e.target.checked)} /></td>
        {canEdit && <td className="text-nowrap"><Button size="sm" className="me-1" disabled={save.isPending} onClick={() => submit(key)}>Save</Button><Button size="sm" variant="outline-secondary" onClick={() => setDrafts(d => ({ ...d, [key]: { ...titles[key] } }))}>Cancel</Button><Button size="sm" variant="link" onClick={() => setConfirmKey(key)}>Reset</Button></td>}</tr>)}</tbody></Table></div>}
    <hr /><Form onSubmit={e => { e.preventDefault(); savePrefix.mutate(prefixDraft, { onSuccess: () => showToast('Email prefix saved', 'success'), onError: () => showToast('Could not save email prefix', 'danger') }); }}>
      <Form.Group className="mb-2" style={{ maxWidth: 520 }}><Form.Label>Scheduled report email prefix</Form.Label><div className="d-flex gap-2"><Form.Control value={prefixDraft} disabled={!canEdit} onChange={e => setPrefixDraft(e.target.value)} />{canEdit && <Button type="submit" disabled={savePrefix.isPending}>Save</Button>}</div></Form.Group>
    </Form>
    {!canEdit && <Alert variant="info" className="small mb-0">Read-only access. Contact an administrator with settings.edit to change report titles.</Alert>}
    <Modal show={confirmKey !== null} onHide={() => setConfirmKey(null)}><Modal.Header closeButton><Modal.Title>Reset report title</Modal.Title></Modal.Header><Modal.Body>{confirmKey === 'all' ? 'Reset every report title to its default?' : `Reset ${confirmKey} to its default title?`}</Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setConfirmKey(null)}>Cancel</Button><Button variant="danger" disabled={reset.isPending} onClick={doReset}>{reset.isPending ? 'Resetting…' : 'Reset'}</Button></Modal.Footer></Modal>
  </div></div>;
}
