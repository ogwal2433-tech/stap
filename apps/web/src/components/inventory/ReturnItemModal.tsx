import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { guardStatusLabel, EXITED_STATUSES, type GuardEmploymentStatus } from '@stap/shared';
import { useReturnItem } from '../../hooks/useInventory';
import { getApiErrorMessage } from '../../lib/api';

type Action = 'RETURNED' | 'DAMAGED' | 'LOST';

interface Props {
  itemId:      string;
  itemName:    string;
  guardId:     string;
  guardName:   string;
  /** Used only to warn that the holder has left — it never blocks the return. */
  guardStatus?: string;
  outstanding: number;
  onClose:   () => void;
  onSuccess: () => void;
}

const ACTIONS: { value: Action; label: string; hint: string }[] = [
  { value: 'RETURNED', label: 'Returned',  hint: 'Item handed back and goes into stock.' },
  { value: 'DAMAGED',  label: 'Damaged',   hint: 'Item handed back damaged.' },
  { value: 'LOST',     label: 'Lost',      hint: 'Item not handed back.' },
];

export default function ReturnItemModal({
  itemId, itemName, guardId, guardName, guardStatus, outstanding, onClose, onSuccess,
}: Props) {
  const [quantity, setQuantity]   = useState(1);
  const [action, setAction]       = useState<Action>('RETURNED');
  const [condition, setCondition] = useState<'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED'>('GOOD');
  const [charge, setCharge]       = useState<number | ''>('');
  const [note, setNote]           = useState('');
  const [error, setError]         = useState('');

  const ret = useReturnItem();
  const needsCharge = action !== 'RETURNED';
  const hasLeft = !!guardStatus && EXITED_STATUSES.includes(guardStatus as GuardEmploymentStatus);

  const submit = () => {
    if (quantity < 1 || quantity > outstanding) {
      setError(`Enter a quantity between 1 and ${outstanding}.`);
      return;
    }
    if (needsCharge && charge === '') {
      setError('Enter the amount to charge. Enter 0 to waive it.');
      return;
    }
    setError('');

    ret.mutate(
      {
        itemId,
        guardId,
        quantity,
        action,
        conditionNote: note.trim() || undefined,
        ...(action === 'RETURNED' ? { returnedCondition: condition } : {}),
        ...(needsCharge ? { chargedAmount: Number(charge) } : {}),
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not record this return.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>Record return — {itemName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {hasLeft && (
          <Alert variant="warning" className="py-2 small">
            <strong>{guardName}</strong> has left the company ({guardStatusLabel(guardStatus!)}).
            The return is still recorded against their record — equipment can be collected
            whatever their employment status.
          </Alert>
        )}

        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '10px 14px', marginBottom: '16px' }}>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>{guardName}</div>
          <div className="small text-muted">{outstanding} outstanding</div>
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Quantity <span className="text-danger">*</span></Form.Label>
          <Form.Control
            type="number" min={1} max={outstanding} value={quantity}
            onChange={e => { setQuantity(Number(e.target.value)); setError(''); }}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Outcome <span className="text-danger">*</span></Form.Label>
          <Form.Select
            value={action}
            onChange={e => { setAction(e.target.value as Action); setError(''); }}
          >
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Form.Select>
          <Form.Text className="text-muted">{ACTIONS.find(a => a.value === action)?.hint}</Form.Text>
        </Form.Group>

        {action === 'RETURNED' && (
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Condition it came back in</Form.Label>
            <Form.Select value={condition} onChange={e => setCondition(e.target.value as typeof condition)}>
              <option value="NEW">New</option>
              <option value="GOOD">Good</option>
              <option value="FAIR">Fair</option>
              <option value="DAMAGED">Damaged</option>
            </Form.Select>
            <Form.Text className="text-muted">Determines which stock bucket it returns to.</Form.Text>
          </Form.Group>
        )}

        {needsCharge && (
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">
              Charge amount (UGX) <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number" min={0} value={charge} placeholder="e.g. 50000"
              onChange={e => { setCharge(e.target.value === '' ? '' : Math.max(0, Number(e.target.value))); setError(''); }}
            />
            <Form.Text className="text-muted">
              Enter what this guard should actually be charged — it is not calculated from the
              item&apos;s cost. Enter <strong>0</strong> to waive the charge.
            </Form.Text>

            {charge !== '' && Number(charge) > 0 && (
              <div style={{ background: '#fdecea', borderRadius: '0.375rem', padding: '6px 10px', marginTop: '8px', fontSize: '0.8rem', color: '#C0392B', fontWeight: 600 }}>
                A deduction of UGX {Number(charge).toLocaleString()} will be raised against {guardName}.
              </div>
            )}
            {charge !== '' && Number(charge) === 0 && (
              <div style={{ background: '#d5f5e3', borderRadius: '0.375rem', padding: '6px 10px', marginTop: '8px', fontSize: '0.8rem', color: '#1E8449', fontWeight: 600 }}>
                No charge — the loss is recorded without a deduction.
              </div>
            )}
          </Form.Group>
        )}

        <Form.Group className="mb-0">
          <Form.Label className="fw-bold small">
            Note <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea" rows={2} maxLength={500} value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Scratches on the surface, collected at exit interview"
          />
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={ret.isPending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={ret.isPending}>
          {ret.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
            : 'Record return'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
