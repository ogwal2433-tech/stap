import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Nav, Spinner, Table } from 'react-bootstrap';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import { PermissionDenied } from '../../components/PermissionGuard';
import {
  deletedRecordsApi, DELETE_PERMISSION, DELETE_PERMISSIONS, type DeletableType,
} from '../../lib/deletedRecords.api';

const NAVY = '#1B3A6B';

const TABS: { type: DeletableType; label: string; restoreNote?: string }[] = [
  { type: 'client',   label: 'Clients' },
  { type: 'guard',    label: 'Guards' },
  { type: 'staff',    label: 'Staff' },
  { type: 'contract', label: 'Contracts', restoreNote: 'A contract whose client is deleted is restored after the client.' },
  { type: 'site',     label: 'Sites',     restoreNote: 'A site whose client is deleted is restored after the client.' },
];

/** The queries a restore can change, so the record reappears wherever it belongs. */
const INVALIDATE: Record<DeletableType, string[]> = {
  client:   ['clients', 'client-summary', 'client'],
  guard:    ['guards', 'guard'],
  staff:    ['staff'],
  contract: ['contracts', 'contracts-expiring', 'contract-expiry-alerts'],
  site:     ['client-sites', 'all-sites', 'client'],
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Everything soft-deleted, one tab per kind, each shown only to a role holding
 * that kind's delete permission — the same one that restores it.
 */
export default function DeletedRecordsPage() {
  const { permissions, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const tabs = useMemo(
    () => TABS.filter((t) => permissions.includes(DELETE_PERMISSION[t.type])),
    [permissions],
  );
  const [chosen, setChosen] = useState<DeletableType | null>(null);
  const active = chosen && tabs.some((t) => t.type === chosen) ? chosen : tabs[0]?.type ?? null;

  const { data = [], isLoading: loading, isError, error } = useQuery({
    queryKey: ['deleted-records', active],
    queryFn:  () => deletedRecordsApi.list(active as DeletableType),
    enabled:  !!active,
  });

  const restore = useMutation({
    mutationFn: ({ type, id }: { type: DeletableType; id: string }) => deletedRecordsApi.restore(type, id),
    onSuccess: (r, { type }) => {
      showToast(`${r.name} restored.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['deleted-records', type] });
      for (const key of INVALIDATE[type]) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not restore this record.'), 'danger'),
  });

  if (isLoading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;
  if (!permissions.some((p) => DELETE_PERMISSIONS.includes(p))) {
    return <PermissionDenied permission={DELETE_PERMISSIONS.join(' or ')} />;
  }

  const note = TABS.find((t) => t.type === active)?.restoreNote;

  return (
    <div className="p-3 p-md-4">
      <h4 className="fw-bold mb-1" style={{ color: NAVY }}>Deleted records</h4>
      <div className="text-muted small mb-3">
        Deleted records are hidden everywhere else but kept on file. Restoring one brings it back exactly as it was.
        Invoices are never deleted — they are voided and stay on the Finance page.
      </div>

      <Nav variant="tabs" className="mb-3" activeKey={active ?? undefined} onSelect={(k) => setChosen(k as DeletableType)}>
        {tabs.map((t) => (
          <Nav.Item key={t.type}>
            <Nav.Link eventKey={t.type}>{t.label}</Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {note && <div className="small text-muted mb-2">{note}</div>}

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : isError ? (
        <Alert variant="warning">{getApiErrorMessage(error, 'Could not load deleted records.')}</Alert>
      ) : data.length === 0 ? (
        <div className="text-center text-muted py-5 small" style={{ border: '2px dashed #ced4da', borderRadius: '0.5rem' }}>
          Nothing deleted here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table hover size="sm" className="align-middle small">
            <thead className="table-light">
              <tr><th>Record</th><th>Deleted</th><th>By</th><th /></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="fw-semibold">{r.name} <Badge bg="danger" style={{ fontSize: '0.62rem' }}>Deleted</Badge></div>
                    {r.detail && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.detail}</div>}
                  </td>
                  <td>{fmt(r.deletedAt)}</td>
                  <td>{r.deletedByName ?? '—'}</td>
                  <td className="text-end">
                    <Button
                      size="sm"
                      variant="outline-success"
                      disabled={restore.isPending}
                      onClick={() => active && restore.mutate({ type: active, id: r.id })}
                    >
                      ↺ Restore
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
