import { useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useMutation } from '@tanstack/react-query';
import { AMENDMENT_TYPES, type ContractResponse } from '@stap/shared';
import { contractsApi } from '../../lib/contracts.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  contract:  ContractResponse;
  show:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

interface RateLine { guardType: string; guardsCount: number; ratePerGuard: number }

const ugx = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;
const asDate = (iso: string | null | undefined) => (iso ? iso.split('T')[0] : '');

/**
 * Amending a contract, as distinct from editing one.
 *
 * The current terms are shown read-only above the fields being changed, because
 * the question an amendment answers is "what is it becoming, from what" — and a
 * form that only shows the new value makes that impossible to check.
 */
export default function AmendContractModal({ contract, show, onClose, onSuccess }: Props) {
  const { showToast } = useToast();

  const [amendmentType, setAmendmentType] = useState<string>('GUARD_COUNT_CHANGE');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason]               = useState('');
  const [rates, setRates] = useState<RateLine[]>(
    contract.guardRates.map(r => ({
      guardType: r.guardType, guardsCount: r.guardsCount, ratePerGuard: r.ratePerGuard,
    })),
  );
  const [contractEnd, setContractEnd] = useState(asDate(contract.contractEnd));
  const [billingNote, setBillingNote] = useState(contract.billingNote ?? '');

  const terminating = amendmentType === 'TERMINATION';

  const newGuards = rates.reduce((s, r) => s + (r.guardsCount || 0), 0);
  const newValue  = rates.reduce((s, r) => s + (r.guardsCount || 0) * (r.ratePerGuard || 0), 0);

  const ratesChanged = newGuards !== contract.guardsRequired || newValue !== contract.totalMonthlyValue;
  const endChanged   = contractEnd !== asDate(contract.contractEnd);
  const noteChanged  = billingNote !== (contract.billingNote ?? '');
  const somethingChanged = terminating || ratesChanged || endChanged || noteChanged;

  const setRate = (i: number, patch: Partial<RateLine>) =>
    setRates(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const amend = useMutation({
    mutationFn: () => contractsApi.amend(contract.id, {
      amendmentType: amendmentType as never,
      effectiveDate,
      reason: reason.trim(),
      // Only what actually moved is sent, so the amendment records a change
      // rather than a restatement of every field.
      ...(ratesChanged && !terminating ? { guardRates: rates } : {}),
      ...(endChanged   && !terminating ? { contractEnd: new Date(contractEnd).toISOString() } : {}),
      ...(noteChanged  && !terminating ? { billingNote: billingNote || null } : {}),
    }),
    onSuccess: (a) => {
      showToast(`${a.systemId ?? 'Amendment'} recorded — ${a.changeSummary}`, 'success');
      onSuccess();
      onClose();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not record the amendment.'), 'danger'),
  });

  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;
  const canSubmit = reason.trim().length >= 10 && !!effectiveDate && somethingChanged && !amend.isPending;

  return (
    <Modal show={show} onHide={amend.isPending ? undefined : onClose} size="lg" centered>
      <Modal.Header closeButton={!amend.isPending}>
        <Modal.Title className="h6 mb-0">
          Amend contract — {contract.client.clientName}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div style={{
          background: '#F2F4F7', borderLeft: '3px solid #1B3A6B',
          borderRadius: '0.5rem', padding: '10px 14px', marginBottom: 16,
        }}>
          <div className="fw-bold small mb-2" style={{ color: '#1B3A6B' }}>Currently signed</div>
          <Row className="g-2 small">
            <Col xs={4}><div className="text-muted">Guards</div><div className="fw-bold">{contract.guardsRequired}</div></Col>
            <Col xs={4}><div className="text-muted">Monthly value</div><div className="fw-bold">{ugx(contract.totalMonthlyValue)}</div></Col>
            <Col xs={4}><div className="text-muted">Ends</div><div className="fw-bold">{new Date(contract.contractEnd).toLocaleDateString('en-GB')}</div></Col>
          </Row>
          {contract.amendmentCount > 0 && (
            <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>
              Amended {contract.amendmentCount} time{contract.amendmentCount === 1 ? '' : 's'} already.
            </div>
          )}
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small mb-1">What kind of change is this?</Form.Label>
          <div className="d-flex flex-wrap gap-2">
            {AMENDMENT_TYPES.map(t => {
              const active = amendmentType === t.value;
              return (
                <button
                  key={t.value} type="button" onClick={() => setAmendmentType(t.value)}
                  style={{
                    padding: '6px 11px',
                    border: `2px solid ${active ? t.colour : '#e9ecef'}`,
                    borderRadius: '0.5rem',
                    background: active ? `${t.colour}14` : 'white',
                    color: active ? t.colour : '#6c757d',
                    fontWeight: active ? 700 : 400, fontSize: '0.78rem', cursor: 'pointer',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              );
            })}
          </div>
        </Form.Group>

        <Row className="g-3 mb-3">
          <Col md={5}>
            <Form.Label className="fw-bold small mb-1">Takes effect</Form.Label>
            <Form.Control type="date" value={effectiveDate} disabled={amend.isPending}
              onChange={e => setEffectiveDate(e.target.value)} />
            <Form.Text className="text-muted">Not always today — a change agreed now may start later.</Form.Text>
          </Col>
          <Col md={7}>
            <Form.Label className="fw-bold small mb-1">Reason</Form.Label>
            <Form.Control
              as="textarea" rows={2} value={reason} isInvalid={reasonTooShort}
              disabled={amend.isPending}
              placeholder="e.g. Client requested 3 additional guards for night shift coverage."
              onChange={e => setReason(e.target.value)}
            />
            <Form.Control.Feedback type="invalid">
              A sentence at least — this is what someone reads back in a year.
            </Form.Control.Feedback>
          </Col>
        </Row>

        {terminating ? (
          <Alert variant="danger" className="small mb-0">
            <div className="fw-bold mb-1">This closes the contract</div>
            It will be marked expired, ending{' '}
            {effectiveDate ? new Date(effectiveDate).toLocaleDateString('en-GB') : 'on the date above'}.
            The terms stay on record and the history is kept, but the contract cannot be amended again.
          </Alert>
        ) : (
          <>
            <div className="fw-bold small mb-2" style={{ color: '#1B3A6B' }}>What is changing</div>
            {rates.map((r, i) => (
              <Row className="g-2 mb-2 align-items-end" key={i}>
                <Col md={5}>
                  <Form.Label className="small mb-1">Guard type</Form.Label>
                  <Form.Control size="sm" value={r.guardType} disabled={amend.isPending}
                    onChange={e => setRate(i, { guardType: e.target.value })} />
                </Col>
                <Col md={3}>
                  <Form.Label className="small mb-1">Guards</Form.Label>
                  <Form.Control size="sm" type="number" min={1} value={r.guardsCount} disabled={amend.isPending}
                    onChange={e => setRate(i, { guardsCount: parseInt(e.target.value, 10) || 0 })} />
                </Col>
                <Col md={4}>
                  <Form.Label className="small mb-1">Rate per guard</Form.Label>
                  <Form.Control size="sm" type="number" min={0} value={r.ratePerGuard} disabled={amend.isPending}
                    onChange={e => setRate(i, { ratePerGuard: parseInt(e.target.value, 10) || 0 })} />
                </Col>
              </Row>
            ))}

            <Row className="g-3 mt-1">
              <Col md={5}>
                <Form.Label className="small fw-bold mb-1">End date</Form.Label>
                <Form.Control type="date" value={contractEnd} disabled={amend.isPending}
                  onChange={e => setContractEnd(e.target.value)} />
              </Col>
              <Col md={7}>
                <Form.Label className="small fw-bold mb-1">Billing note</Form.Label>
                <Form.Control size="sm" value={billingNote} disabled={amend.isPending}
                  onChange={e => setBillingNote(e.target.value)} />
              </Col>
            </Row>
          </>
        )}

        {somethingChanged && !terminating && (
          <div style={{
            background: '#d5f5e3', borderLeft: '3px solid #1E8449',
            borderRadius: '0.5rem', padding: '10px 14px', marginTop: 14, fontSize: '0.8rem',
          }}>
            <div className="fw-bold mb-1" style={{ color: '#1E8449' }}>This amendment will record</div>
            {newGuards !== contract.guardsRequired && (
              <div>Guards: <strong>{contract.guardsRequired} → {newGuards}</strong></div>
            )}
            {newValue !== contract.totalMonthlyValue && (
              <div>Monthly value: <strong>{ugx(contract.totalMonthlyValue)} → {ugx(newValue)}</strong></div>
            )}
            {endChanged && (
              <div>End date: <strong>
                {new Date(contract.contractEnd).toLocaleDateString('en-GB')} →{' '}
                {contractEnd ? new Date(contractEnd).toLocaleDateString('en-GB') : '—'}
              </strong></div>
            )}
            {noteChanged && <div>Billing note updated</div>}
          </div>
        )}

        {!somethingChanged && !terminating && (
          <div className="text-muted small mt-3">
            Nothing has changed yet. Adjust a value above, or pick Early Termination.
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={amend.isPending}>Cancel</Button>
        <Button
          variant={terminating ? 'danger' : 'primary'}
          disabled={!canSubmit}
          onClick={() => amend.mutate()}
        >
          {amend.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Recording…</>
            : terminating ? 'Terminate contract' : 'Record amendment'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
