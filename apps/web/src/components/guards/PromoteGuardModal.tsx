import { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { usePromoteGuard } from '../../hooks/useGuards';
import { useGuardRanks } from '../../hooks/useSettings';
import { getApiErrorMessage } from '../../lib/api';

interface PromoteGuardModalProps {
  guardId:       string;
  guardName:     string;
  currentRank:   string | null | undefined;
  currentSalary: number;
  onClose:   () => void;
  onSuccess: () => void;
}

const ugx = (n: number) => `UGX ${n.toLocaleString()}`;

/** Guard.rank holds a rank name, but legacy rows use "SENIOR_GUARD" for "Senior Guard". */
const normalise = (rank: string) => rank.replace(/[\s_]+/g, '').toLowerCase();

export default function PromoteGuardModal({
  guardId,
  guardName,
  currentRank,
  currentSalary,
  onClose,
  onSuccess,
}: PromoteGuardModalProps) {
  const [toRank, setToRank]       = useState('');
  const [newSalary, setNewSalary] = useState<number | ''>('');
  const [reason, setReason]       = useState('');
  const [error, setError]         = useState('');

  const { data: ranks = [], isLoading: ranksLoading } = useGuardRanks(true);
  const promote = usePromoteGuard(guardId);

  // The guard's own rank is not a promotion target.
  const targetRanks = useMemo(
    () => ranks.filter(r => !currentRank || normalise(r.name) !== normalise(currentRank)),
    [ranks, currentRank],
  );

  const selectedRank = ranks.find(r => r.name === toRank);
  const salaryNum    = typeof newSalary === 'number' ? newSalary : 0;
  const increment    = salaryNum - currentSalary;

  const handleRankChange = (name: string) => {
    setToRank(name);
    setError('');
    // Ranks may have no default salary configured — leave the field for the
    // manager to fill rather than pre-filling a misleading zero.
    const next = ranks.find(r => r.name === name);
    setNewSalary(next?.defaultSalary != null ? next.defaultSalary : '');
  };

  const handleSubmit = () => {
    if (!toRank) {
      setError('Please select the rank to promote to.');
      return;
    }
    if (salaryNum <= 0) {
      setError('Enter the new salary for this rank.');
      return;
    }
    setError('');
    promote.mutate(
      {
        toRank,
        newSalary: salaryNum,
        reason:    reason.trim() || undefined,
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Promotion failed. Please try again.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem' }}>Promote {guardName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {/* Current standing */}
        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: '16px' }}>
          <div className="text-muted small mb-1">Current rank &amp; salary</div>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>{currentRank || 'No rank assigned'}</div>
          <div className="small text-muted">{ugx(currentSalary)} / month</div>
        </div>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">
            Promote to <span className="text-danger">*</span>
          </Form.Label>
          <Form.Select
            value={toRank}
            disabled={ranksLoading}
            onChange={e => handleRankChange(e.target.value)}
          >
            <option value="">{ranksLoading ? 'Loading ranks…' : '— Select new rank —'}</option>
            {targetRanks.map(r => (
              <option key={r.id} value={r.name}>
                {r.name}{r.defaultSalary != null ? ` — ${ugx(r.defaultSalary)}/mo` : ''}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        {toRank && (
          <div
            style={{
              background: '#EBF5FB', borderRadius: '0.5rem', padding: '14px 16px',
              marginBottom: '16px', borderLeft: '4px solid #1B3A6B',
            }}
          >
            <div className="fw-bold small mb-2" style={{ color: '#1B3A6B' }}>Salary adjustment</div>

            <div className="d-flex gap-3 mb-3 align-items-center">
              <div style={{ flex: 1 }}>
                <div className="text-muted small">Current</div>
                <div className="fw-bold" style={{ color: '#6c757d' }}>{ugx(currentSalary)}</div>
              </div>
              <div style={{ color: '#1B3A6B', fontSize: '1.2rem' }}>→</div>
              <div style={{ flex: 1 }}>
                <div className="text-muted small">New</div>
                <div className="fw-bold" style={{ color: increment >= 0 ? '#1E8449' : '#c0392b' }}>
                  {salaryNum > 0 ? ugx(salaryNum) : '—'}
                </div>
              </div>
            </div>

            {selectedRank?.defaultSalary == null && (
              <Alert variant="warning" className="py-2 small mb-2">
                {selectedRank?.name} has no default salary set in Settings → Ranks, so nothing was
                auto-filled. Enter the new salary below.
              </Alert>
            )}

            {salaryNum > 0 && (
              increment > 0 ? (
                <div style={{ background: '#d5f5e3', borderRadius: '0.375rem', padding: '6px 10px', fontSize: '0.82rem', color: '#1E8449', fontWeight: 600, marginBottom: '12px' }}>
                  ↑ Salary increment: {ugx(increment)} / month
                </div>
              ) : increment < 0 ? (
                <div style={{ background: '#fdecea', borderRadius: '0.375rem', padding: '6px 10px', fontSize: '0.82rem', color: '#c0392b', fontWeight: 600, marginBottom: '12px' }}>
                  ⚠️ This is {ugx(Math.abs(increment))} / month <strong>lower</strong> than the current
                  salary. Confirm this is intended.
                </div>
              ) : (
                <div style={{ background: '#fff3cd', borderRadius: '0.375rem', padding: '6px 10px', fontSize: '0.82rem', color: '#856404', fontWeight: 600, marginBottom: '12px' }}>
                  No salary change — the guard keeps {ugx(currentSalary)} / month.
                </div>
              )
            )}

            <Form.Group>
              <Form.Label className="fw-bold small">
                Confirm new salary (UGX) <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={newSalary}
                placeholder="e.g. 500000"
                onChange={e => {
                  const v = e.target.value;
                  setNewSalary(v === '' ? '' : Math.trunc(Number(v)));
                  setError('');
                }}
              />
              <Form.Text className="text-muted">
                Pre-filled from the rank&apos;s default salary. Edit it if this guard&apos;s
                increment differs.
              </Form.Text>
            </Form.Group>
          </div>
        )}

        <Form.Group className="mb-0">
          <Form.Label className="fw-bold small">
            Reason for promotion <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            maxLength={500}
            placeholder="e.g. Outstanding performance in Q2 review, completed advanced training…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={promote.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!toRank || salaryNum <= 0 || promote.isPending}
          onClick={handleSubmit}
        >
          {promote.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Promoting…</>
            : 'Confirm promotion'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
