import { useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import type { InvoiceResponse } from '@security360/shared';
import { formatUgx, isTwoDpOrWhole, roundMoney } from '@security360/shared';
import { useAddFeeIncrement } from '../../hooks/useFinance';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  invoice:   InvoiceResponse;
  onClose:   () => void;
  onSuccess: () => void;
}

/**
 * Adds a charge to an invoice that has not been settled — typically a client
 * asking for more guards partway through the billing period.
 */
export default function FeeIncrementModal({ invoice, onClose, onSuccess }: Props) {
  const [description, setDescription] = useState('');
  const [guardType, setGuardType]     = useState('');
  const [guardCount, setGuardCount]   = useState<number | ''>(1);
  /**
   * Rate stays the raw text: it may carry cents (a monthly contract rate ÷ 30
   * rarely is whole), and re-rendering a parsed number eats the decimal separator
   * mid-typing — "16666." comes back as "16666", so the next digits land as
   * "1666667". Counts and days are whole numbers and keep parsing to a number.
   */
  const [rate, setRate]               = useState('');
  const [days]                        = useState<number | ''>(30);
  const [reason, setReason]           = useState('');
  const [error, setError]             = useState('');

  const increment = useAddFeeIncrement();

  const lineTotal = roundMoney((Number(guardCount) || 0) * (Number(rate) || 0));
  const newTotal  = roundMoney(invoice.totalAmount + lineTotal);
  const newDue    = roundMoney(invoice.outstandingBalance + lineTotal);

  const submit = () => {
    if (description.trim().length < 3) { setError('Describe what the extra charge is for.'); return; }
    if (!guardCount || Number(guardCount) < 1) { setError('Enter how many extra guards.'); return; }
    if (rate === '' || Number(rate) < 0) { setError('Enter the rate per guard.'); return; }
    if (!isTwoDpOrWhole(Number(rate))) { setError('The rate per guard can carry at most two decimal places — e.g. 16666.67.'); return; }
    void days;
    setError('');

    increment.mutate(
      {
        invoiceId:    invoice.id,
        description:  description.trim(),
        guardType:    guardType.trim() || null,
        guardCount:   Number(guardCount),
        ratePerGuard: Number(rate),
        days:         30,
        reason:       reason.trim() || null,
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not add the charge.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>Add fee increment</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '10px 14px', marginBottom: '16px' }}>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>{invoice.invoiceNumber}</div>
          <div className="small text-muted">
            {invoice.clientName} · currently {formatUgx(invoice.totalAmount)}
          </div>
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Description <span className="text-danger">*</span></Form.Label>
          <Form.Control
            value={description}
            maxLength={300}
            placeholder="e.g. Additional armed guards — new warehouse wing"
            onChange={e => { setDescription(e.target.value); setError(''); }}
          />
        </Form.Group>

        <Row className="g-2 mb-3">
          <Col sm={6}>
            <Form.Label className="fw-bold small">Guard type</Form.Label>
            <Form.Control
              value={guardType}
              maxLength={100}
              placeholder="e.g. Armed Guard"
              onChange={e => setGuardType(e.target.value)}
            />
          </Col>
          <Col sm={6}>
            <Form.Label className="fw-bold small">Extra guards <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number" min={1} value={guardCount}
              onChange={e => { setGuardCount(e.target.value === '' ? '' : Number(e.target.value)); setError(''); }}
            />
          </Col>
        </Row>

        <Row className="g-2 mb-3">
          <Col sm={6}>
            <Form.Label className="fw-bold small">Rate per guard / month (UGX) <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number" min={0} step="0.01" value={rate} placeholder="e.g. 500000"
              onChange={e => { setRate(e.target.value); setError(''); }}
            />
          </Col>
          <Col sm={6} className="d-flex align-items-end">
            <div className="text-muted small pb-2">Full-month rate: total = guards x rate (30-day cycle).</div>
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">
            Reason <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea" rows={2} maxLength={500} value={reason}
            placeholder="e.g. Client requested extra coverage from 15th"
            onChange={e => setReason(e.target.value)}
          />
        </Form.Group>

        <div className="p-3" style={{ background: '#EBF5FB', borderRadius: '0.5rem', borderLeft: '4px solid #1B3A6B' }}>
          <div className="d-flex justify-content-between small">
            <span className="text-muted">This charge</span>
            <strong>{formatUgx(lineTotal)}</strong>
          </div>
          <div className="d-flex justify-content-between small mt-1">
            <span className="text-muted">New invoice total</span>
            <strong>{formatUgx(newTotal)}</strong>
          </div>
          <div className="d-flex justify-content-between mt-2 pt-2" style={{ borderTop: '1px solid #cfe2f3', fontWeight: 700, color: '#C0392B' }}>
            <span>New balance due</span>
            <span>{formatUgx(newDue)}</span>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={increment.isPending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={increment.isPending || lineTotal <= 0}>
          {increment.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Adding…</>
            : 'Add charge'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
