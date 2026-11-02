import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { guardsApi } from '../../lib/guards.api';
import { useGuardList } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import PermissionGuard from '../../components/PermissionGuard';
import type { GuardResponse } from '@security360/shared';

function PurgeModal({ guard, onClose, onPurged }: {
  guard: GuardResponse;
  onClose: () => void;
  onPurged: (name: string) => void;
}) {
  const [systemId, setSystemId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = guard._count as unknown as Record<string, number> | undefined;
  const deployments = counts?.deployments ?? 0;
  const attendance = counts?.attendance ?? 0;

  const confirmed = (guard.systemId ?? '').trim().length > 0
    && systemId.trim().toUpperCase() === (guard.systemId ?? '').trim().toUpperCase();
  const valid = confirmed && reason.trim().length >= 5 && !busy;

  const handleConfirm = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await guardsApi.purge(guard.id, systemId.trim(), reason.trim());
      onPurged(r.name);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not permanently delete this guard.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show onHide={busy ? undefined : onClose} centered>
      <Modal.Header closeButton={!busy} style={{ background: '#343a40', color: 'white' }}>
        <Modal.Title style={{ fontSize: '1rem' }}>
          Permanently delete {guard.firstName} {guard.lastName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="danger" className="small">
          This cannot be undone. The guard row, documents and all history will be
          permanently deleted: {deployments} deployment(s), {attendance} attendance
          record(s), plus postings, discipline, transfers, leave, training, kit and
          incident records. Payslips stay for finance, de-linked from the guard.
        </Alert>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">
            Type <code>{guard.systemId}</code> to confirm <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            value={systemId}
            onChange={(e) => setSystemId(e.target.value)}
            placeholder="Guard system ID"
            disabled={busy}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label className="small fw-bold">
            Reason <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this record being erased?"
            disabled={busy}
          />
          <Form.Text className="text-muted">Kept in the audit log with your name.</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" disabled={!valid} onClick={handleConfirm}>
          {busy ? <><Spinner size="sm" animation="border" className="me-1" />Deleting…</> : 'Delete permanently'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function DesertersArchivePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [purgeTarget, setPurgeTarget] = useState<GuardResponse | null>(null);
  const { data, isLoading, isError } = useGuardList({ status: 'DESERTED', limit: 500, sortBy: 'lastName', sortOrder: 'asc' });
  const guards = data?.data ?? [];

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <span className="fw-semibold">
          Deserters Archive
          {data && (
            <span className="fw-normal small text-muted ms-2">
              {data.pagination.total.toLocaleString()} on record
            </span>
          )}
        </span>
        <Badge bg="dark">Quarantined</Badge>
      </div>

      <Alert variant="info" className="small">
        Deserted guards are quarantined: they appear nowhere else in the system —
        not in lists, search, attendance or operations. This archive is the only
        place they can be found, and the only place they can be permanently deleted.
      </Alert>

      {isLoading ? (
        <div className="text-center py-4 text-muted">
          <Spinner size="sm" className="me-2" />Loading archive…
        </div>
      ) : isError ? (
        <Alert variant="danger" className="small">Could not load the archive.</Alert>
      ) : guards.length === 0 ? (
        <Alert variant="success" className="small">No deserted guards. The archive is empty.</Alert>
      ) : (
        <Table size="sm" bordered hover responsive className="mb-2">
          <thead style={{ background: '#F2F4F7' }}>
            <tr>
              <th>Guard</th>
              <th>Rank</th>
              <th className="text-center">Deployments</th>
              <th className="text-center">Attendance</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {guards.map((g) => {
              const counts = g._count as unknown as Record<string, number> | undefined;
              return (
                <tr key={g.id}>
                  <td>
                    <div className="fw-semibold">{g.firstName} {g.lastName}</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{g.systemId ?? '—'}</div>
                  </td>
                  <td className="align-middle small">{g.rank ?? '—'}</td>
                  <td className="text-center align-middle">{counts?.deployments ?? '—'}</td>
                  <td className="text-center align-middle">{counts?.attendance ?? '—'}</td>
                  <td className="text-end align-middle text-nowrap">
                    <Button as={Link as any} to={`/guards/${g.id}`} size="sm" variant="outline-secondary" className="me-1">
                      View
                    </Button>
                    <PermissionGuard permission="guards.purge">
                      <Button size="sm" variant="outline-danger" onClick={() => setPurgeTarget(g)}>
                        Delete permanently
                      </Button>
                    </PermissionGuard>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {purgeTarget && (
        <PurgeModal
          guard={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onPurged={(name) => {
            showToast(`${name} permanently deleted.`, 'success');
            queryClient.invalidateQueries({ queryKey: ['guards'] });
          }}
        />
      )}
    </>
  );
}
