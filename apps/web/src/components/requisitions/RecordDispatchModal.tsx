import { useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import {
  DISPATCH_CHANNELS, REFERENCED_CHANNELS,
  type DispatchChannel, type RequisitionResponse,
} from '@stap/shared';
import { useRecordDispatch } from '../../hooks/useRequisitions';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';

const REFERENCE_PLACEHOLDER: Record<string, string> = {
  E_TRANSACT:    'E-Transact transaction ID…',
  CHEQUE:        'Cheque number…',
  BANK_TRANSFER: 'Bank transaction reference…',
  MOBILE_MONEY:  'Mobile money transaction ID…',
};

interface Props {
  requisition: RequisitionResponse;
  /** Summed from the dispatch rows, so it stays right even if the counter lags. */
  alreadyDispatched: number;
  onClose:   () => void;
  onSuccess: () => void;
}

/** Records one payment against an approved requisition. */
export default function RecordDispatchModal({
  requisition, alreadyDispatched, onClose, onSuccess,
}: Props) {
  const [channel, setChannel]       = useState<DispatchChannel | ''>('');
  const [amount, setAmount]         = useState<number | ''>('');
  const [reference, setReference]   = useState('');
  const [recipientName, setRecipientName]       = useState('');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes]           = useState('');
  const [error, setError]           = useState('');

  const record = useRecordDispatch(requisition.id);

  const approved  = requisition.amount;
  const remaining = Math.max(0, approved - alreadyDispatched);
  const needsReference = !!channel && REFERENCED_CHANNELS.includes(channel);
  const overRemaining  = amount !== '' && Number(amount) > remaining;

  const submit = () => {
    if (!channel) { setError('Select a dispatch channel.'); return; }
    if (!amount || Number(amount) < 1) { setError('Enter a valid amount.'); return; }
    if (overRemaining) {
      setError(`Amount cannot exceed the remaining UGX ${remaining.toLocaleString()}.`);
      return;
    }
    if (needsReference && !reference.trim()) {
      setError('A reference number is required for this channel.');
      return;
    }
    setError('');

    record.mutate(
      {
        channel,
        amount:           Number(amount),
        reference:        reference.trim() || null,
        recipientName:    recipientName.trim() || null,
        recipientAccount: recipientAccount.trim() || null,
        dispatchDate:     new Date(`${dispatchDate}T00:00:00.000Z`).toISOString(),
        notes:            notes.trim() || null,
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not record the dispatch.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>💵 Record Fund Dispatch</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <div style={{ background: '#D6E0F0', borderRadius: '0.5rem', padding: '10px 14px', marginBottom: '16px' }}>
          <Row className="g-0">
            <Col xs={6}>
              <div className="text-muted small">Total Approved</div>
              <div className="fw-bold" style={{ color: NAVY }}>UGX {approved.toLocaleString()}</div>
            </Col>
            <Col xs={6}>
              <div className="text-muted small">Remaining to Dispatch</div>
              <div className="fw-bold" style={{ color: '#E8701A' }}>UGX {remaining.toLocaleString()}</div>
            </Col>
          </Row>
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">
            Dispatch Channel <span className="text-danger">*</span>
          </Form.Label>
          <div className="d-flex flex-wrap gap-2">
            {DISPATCH_CHANNELS.map((ch) => (
              <button
                key={ch.value}
                type="button"
                aria-pressed={channel === ch.value}
                onClick={() => { setChannel(ch.value); setError(''); }}
                style={{
                  padding:      '8px 14px',
                  border:       `2px solid ${channel === ch.value ? NAVY : '#ced4da'}`,
                  borderRadius: '0.5rem',
                  background:   channel === ch.value ? '#D6E0F0' : '#fff',
                  cursor:       'pointer',
                  fontSize:     '0.82rem',
                  fontWeight:   channel === ch.value ? 600 : 400,
                }}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">
            Amount (UGX) <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="number" min={1} max={remaining}
            value={amount}
            placeholder={`Max: UGX ${remaining.toLocaleString()}`}
            isInvalid={overRemaining}
            onChange={(e) => { setAmount(e.target.value === '' ? '' : Number(e.target.value)); setError(''); }}
          />
          <Form.Control.Feedback type="invalid">
            Amount cannot exceed remaining UGX {remaining.toLocaleString()}
          </Form.Control.Feedback>
          {remaining > 0 && (
            <Button
              size="sm" variant="outline-secondary" className="mt-1"
              style={{ fontSize: '0.75rem' }}
              onClick={() => { setAmount(remaining); setError(''); }}
            >
              Fill remaining: UGX {remaining.toLocaleString()}
            </Button>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">
            Reference Number {needsReference && <span className="text-danger">*</span>}
          </Form.Label>
          <Form.Control
            value={reference}
            maxLength={200}
            placeholder={(channel && REFERENCE_PLACEHOLDER[channel]) ?? 'Reference (optional)…'}
            onChange={(e) => { setReference(e.target.value); setError(''); }}
          />
        </Form.Group>

        <Row className="g-2 mb-3">
          <Col md={6}>
            <Form.Label className="fw-bold small">Recipient Name</Form.Label>
            <Form.Control
              size="sm" maxLength={200} value={recipientName}
              placeholder="Who received the funds?"
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </Col>
          <Col md={6}>
            <Form.Label className="fw-bold small">Account / Phone</Form.Label>
            <Form.Control
              size="sm" maxLength={200} value={recipientAccount}
              placeholder="Account / phone no."
              onChange={(e) => setRecipientAccount(e.target.value)}
            />
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Dispatch Date</Form.Label>
          <Form.Control
            type="date"
            value={dispatchDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setDispatchDate(e.target.value)}
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label className="fw-bold small">
            Notes <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea" rows={2} maxLength={1000} value={notes}
            placeholder="Any additional context…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={record.isPending}>Cancel</Button>
        <Button
          style={{ background: NAVY, borderColor: NAVY }}
          onClick={submit}
          disabled={record.isPending || !channel || !amount || Number(amount) < 1 || overRemaining}
        >
          {record.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Recording…</>
            : '💵 Record Dispatch'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
