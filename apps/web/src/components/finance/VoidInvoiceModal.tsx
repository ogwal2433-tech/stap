import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { formatUgx } from '@security360/shared';
import { getApiErrorMessage } from '../../lib/api';

/**
 * Voids an invoice — the finance counterpart of delete. The invoice stays on
 * file marked VOID and owes nothing; the reason is kept on it and in the audit
 * log. The server refuses once any payment has been recorded.
 */
export default function VoidInvoiceModal({
  show, onHide, onConfirm, invoiceNumber, totalAmount,
}: {
  show:          boolean;
  onHide:        () => void;
  onConfirm:     (reason: string) => Promise<unknown>;
  invoiceNumber: string;
  totalAmount:   number;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (show) { setReason(''); setError(null); setBusy(false); }
  }, [show]);

  const valid = reason.trim().length >= 5;

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onHide();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not void this invoice.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered>
      <Modal.Header closeButton={!busy} style={{ background: '#343a40', color: 'white' }}>
        <Modal.Title style={{ fontSize: '1rem' }}>Void invoice {invoiceNumber}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted mb-3">
          The invoice stays on file marked <strong>VOID</strong> and drops out of balances,
          AR and revenue. It is not deleted, and voiding cannot be undone.
          Total as issued: <strong>{formatUgx(totalAmount)}</strong>.
        </p>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        <Form.Group>
          <Form.Label htmlFor="void-reason" className="small fw-bold">
            Reason <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            id="void-reason"
            as="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Raised against the wrong contract — reissued as a new invoice"
            maxLength={500}
          />
          <Form.Text className="text-muted">Kept on the invoice and the audit log.</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <Button variant="dark" disabled={!valid || busy} onClick={handleConfirm}>
          {busy ? <><Spinner size="sm" animation="border" className="me-1" />Voiding…</> : 'Void invoice'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
