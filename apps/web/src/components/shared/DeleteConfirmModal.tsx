import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { getApiErrorMessage } from '../../lib/api';

const RED = '#C0392B';

/**
 * Confirms a soft delete by having the user type DELETE.
 *
 * A refusal from the server — "still has 2 sites", "has signed in, deactivate
 * instead" — is shown here and the dialog stays open, because that message is
 * the one thing the user needs next. Closing on failure would leave them with a
 * toast that has already gone.
 */
export default function DeleteConfirmModal({
  show, onHide, onConfirm, entityName, entityType, warning,
}: {
  show:       boolean;
  onHide:     () => void;
  /** Resolves once deleted; a rejection is shown in the dialog. */
  onConfirm:  () => Promise<unknown>;
  entityName: string;
  /** "client", "guard", "staff member" … */
  entityType: string;
  warning?:   string;
}) {
  const [typed, setTyped]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // A dialog reopened for another record must not carry the last one's state.
  useEffect(() => {
    if (show) { setTyped(''); setError(null); setBusy(false); }
  }, [show]);

  const confirmed = typed.trim() === 'DELETE';

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onHide();
    } catch (err) {
      setError(getApiErrorMessage(err, `Could not delete this ${entityType}.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered>
      <Modal.Header closeButton={!busy} style={{ background: RED, color: 'white' }}>
        <Modal.Title style={{ fontSize: '1rem' }}>Delete {entityType}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: '2.6rem', marginBottom: 8 }}>🗑️</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>
            Delete &ldquo;{entityName}&rdquo;?
          </div>
          <div style={{ color: '#6c757d', fontSize: '0.82rem' }}>
            It will be hidden everywhere in the system but kept on file, and can be
            restored from <strong>Deleted records</strong>.
          </div>
        </div>

        {warning && (
          <div style={{
            background: '#FEF9E7', borderLeft: '3px solid #F2AA20', borderRadius: 4,
            padding: '10px 14px', fontSize: '0.78rem', color: '#856404', marginBottom: 14,
          }}>
            ⚠️ {warning}
          </div>
        )}

        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

        <div style={{ background: '#FDEDEC', borderRadius: '0.5rem', padding: '14px 16px' }}>
          <Form.Label htmlFor="delete-confirm" style={{ fontSize: '0.78rem', color: RED, fontWeight: 600 }}>
            Type DELETE to confirm
          </Form.Label>
          <Form.Control
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && confirmed && !busy) void handleConfirm(); }}
            placeholder="DELETE"
            autoComplete="off"
            style={{ fontFamily: 'monospace', fontWeight: 700 }}
            autoFocus
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <Button variant="danger" disabled={!confirmed || busy} onClick={handleConfirm}>
          {busy ? <><Spinner size="sm" animation="border" className="me-1" />Deleting…</> : 'Delete'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
