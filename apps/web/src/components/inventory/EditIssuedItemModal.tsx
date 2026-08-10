import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import type { InventoryTransactionResponse } from '@stap/shared';
import { useUpdateIssuedTransaction } from '../../hooks/useInventory';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  txn:       InventoryTransactionResponse;
  onClose:   () => void;
  onSuccess: () => void;
}

/**
 * Corrects a recorded issue. Changing the quantity moves stock by the
 * difference on the server, so the shelf and the ledger stay in step.
 */
export default function EditIssuedItemModal({ txn, onClose, onSuccess }: Props) {
  const [quantity, setQuantity] = useState(txn.quantity);
  const [note, setNote]         = useState(txn.conditionNote ?? '');
  const [reference, setReference] = useState(txn.reference ?? '');
  const [error, setError]       = useState('');

  const update = useUpdateIssuedTransaction();
  const delta  = quantity - txn.quantity;

  const submit = () => {
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (note.trim().length < 3) {
      setError('The condition note must be at least 3 characters.');
      return;
    }
    setError('');

    update.mutate(
      {
        id: txn.id,
        data: {
          quantity,
          conditionNote: note.trim(),
          reference:     reference.trim() || null,
        },
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not save the correction.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>Edit issued item</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '10px 14px', marginBottom: '16px' }}>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>{txn.item.itemName}</div>
          <div className="small text-muted">
            {txn.item.itemCode}
            {txn.guard ? ` · issued to ${txn.guard.fullName}` : ''}
            {' · '}{new Date(txn.createdAt).toLocaleDateString('en-GB')}
          </div>
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Quantity issued <span className="text-danger">*</span></Form.Label>
          <Form.Control
            type="number" min={1} value={quantity}
            onChange={e => { setQuantity(Number(e.target.value)); setError(''); }}
          />
          {delta !== 0 && (
            <div
              style={{
                background: delta > 0 ? '#fdecea' : '#d5f5e3',
                color:      delta > 0 ? '#C0392B' : '#1E8449',
                borderRadius: '0.375rem', padding: '6px 10px',
                marginTop: '8px', fontSize: '0.8rem', fontWeight: 600,
              }}
            >
              {delta > 0
                ? `${delta} more will be taken out of stock.`
                : `${Math.abs(delta)} will be put back into stock.`}
            </div>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Condition note <span className="text-danger">*</span></Form.Label>
          <Form.Control
            value={note} maxLength={500} placeholder="e.g. Good condition, minor wear"
            onChange={e => { setNote(e.target.value); setError(''); }}
          />
        </Form.Group>

        <Form.Group className="mb-0">
          <Form.Label className="fw-bold small">
            Reference <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            value={reference} maxLength={200} placeholder="e.g. Issue note number"
            onChange={e => setReference(e.target.value)}
          />
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={update.isPending}>
          {update.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
            : 'Save changes'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
