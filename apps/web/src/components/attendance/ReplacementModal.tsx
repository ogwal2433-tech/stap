import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useAvailableReplacements, useAssignReplacement } from '../../hooks/useAttendance';
import InitialsAvatar from '../ui/InitialsAvatar';
import { REPLACEMENT_REASONS, type ReplacementReason, type ReplacementResult } from '@security360/shared';

interface AbsentInfo {
  id:         string;
  guardId:    string;
  guardName:  string;
  systemId:   string | null;
  siteId:     string;
  siteName:   string;
  clientName: string;
  shiftType:  string;
  date:       string;
}

interface Props {
  show:             boolean;
  absentDeployment: AbsentInfo | null;
  onClose:          () => void;
  onSuccess:        (result: ReplacementResult) => void;
}

export default function ReplacementModal({ show, absentDeployment, onClose, onSuccess }: Props) {
  const [reason,           setReason]           = useState('');
  const [note,             setNote]             = useState('');
  const [selectedGuardId,  setSelectedGuardId]  = useState('');
  const [guardSearch,      setGuardSearch]      = useState('');
  const [allowDeployed,    setAllowDeployed]    = useState(false);

  const mutation = useAssignReplacement();

  const { data: availableGuards, isLoading: isLoadingGuards } = useAvailableReplacements(
    absentDeployment ? {
      siteId:        absentDeployment.siteId,
      date:          absentDeployment.date,
      absentGuardId: absentDeployment.guardId,
    } : null,
  );

  const filteredGuards = (availableGuards ?? [])
    .filter(g => {
      if (!guardSearch) return true;
      const q = guardSearch.toLowerCase();
      return (
        g.fullName.toLowerCase().includes(q) ||
        (g.systemId ?? '').toLowerCase().includes(q) ||
        (g.phone ?? '').includes(q)
      );
    })
    .filter(g => allowDeployed ? true : (!g.alreadyDeployed || selectedGuardId === g.id));

  const selected = availableGuards?.find(g => g.id === selectedGuardId) ?? null;
  const canSubmit = !!reason && !!selectedGuardId && !mutation.isPending;

  function handleClose() {
    setReason(''); setNote(''); setSelectedGuardId(''); setGuardSearch(''); setAllowDeployed(false);
    onClose();
  }

  async function handleSubmit() {
    if (!absentDeployment || !canSubmit) return;
    try {
      const result = await mutation.mutateAsync({
        absentDeploymentId: absentDeployment.id,
        replacementGuardId: selectedGuardId,
        reason:             reason as any,
        note:               note.trim() || undefined,
      });
      handleClose();
      onSuccess(result);
    } catch {
      // error shown inline
    }
  }

  if (!absentDeployment) return null;

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Assign Replacement Guard</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Absent guard banner */}
        <div style={{ background: '#f8d7da', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: 20, borderLeft: '4px solid #dc3545' }}>
          <div style={{ fontWeight: 700, color: '#842029', fontSize: '0.9rem', marginBottom: 4 }}>
            🚨 Guard Absent — Replacement Needed
          </div>
          <div style={{ fontSize: '0.85rem', color: '#4A5568' }}>
            <strong>{absentDeployment.guardName}</strong>
            {absentDeployment.systemId && ` (${absentDeployment.systemId})`}
            {' is absent at '}
            <strong>{absentDeployment.siteName}</strong>
            {' — '}{absentDeployment.clientName}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#6c757d', marginTop: 4 }}>
            Shift: {absentDeployment.shiftType}
            {' · '}
            {new Date(absentDeployment.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Reason selector */}
        <Form.Group className="mb-4">
          <Form.Label className="fw-bold">
            Reason for Absence <span className="text-danger">*</span>
          </Form.Label>
          <div className="d-flex flex-wrap gap-2">
            {(Object.entries(REPLACEMENT_REASONS) as [ReplacementReason, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setReason(key)}
                style={{
                  padding: '7px 14px', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.83rem',
                  border:      `2px solid ${reason === key ? '#1B3A6B' : '#ced4da'}`,
                  background:  reason === key ? '#D6E0F0' : '#fff',
                  fontWeight:  reason === key ? 600 : 400,
                  color:       reason === key ? '#1B3A6B' : '#4A5568',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Form.Group>

        {/* Note */}
        <Form.Group className="mb-4">
          <Form.Label className="small fw-bold">
            Additional Notes <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            type="text"
            placeholder='e.g. "Called in sick at 05:30", "No contact since yesterday"'
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
          />
        </Form.Group>

        {/* Guard picker */}
        <div className="mb-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="fw-bold">
              Select Replacement Guard
              {selectedGuardId && <span className="text-success ms-2 small">✓ Selected</span>}
            </div>
            {availableGuards && (
              <div style={{ fontSize: '0.78rem', color: '#6c757d' }}>
                {availableGuards.filter(g => !g.alreadyDeployed).length} available ·{' '}
                {availableGuards.filter(g => g.alreadyDeployed).length} already deployed
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #ced4da', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #e9ecef', background: '#f8f9fa' }}>
              <Form.Control
                type="text"
                size="sm"
                placeholder="Search by name, phone, or guard ID…"
                value={guardSearch}
                onChange={e => setGuardSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {isLoadingGuards ? (
                <div className="p-4 text-center text-muted">
                  <Spinner size="sm" className="me-2" />Finding available guards…
                </div>
              ) : filteredGuards.length === 0 ? (
                <div className="p-4 text-center text-muted small">
                  {guardSearch ? 'No guards match your search.' : 'No available guards found.'}
                </div>
              ) : (
                filteredGuards.map(guard => {
                  const isSelected = selectedGuardId === guard.id;
                  const isClickable = !guard.alreadyDeployed || allowDeployed;
                  return (
                    <div
                      key={guard.id}
                      onClick={() => isClickable && setSelectedGuardId(guard.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderBottom: '1px solid #f0f0f0', cursor: isClickable ? 'pointer' : 'default',
                        background: isSelected ? '#D0EDE9' : guard.alreadyDeployed ? '#fafafa' : '#fff',
                        opacity:    guard.alreadyDeployed && !allowDeployed ? 0.6 : 1,
                      }}
                    >
                      <InitialsAvatar name={guard.fullName} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                          {guard.fullName}
                          {guard.systemId && (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6c757d', marginLeft: 6 }}>
                              {guard.systemId}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                          {guard.rank?.replace(/_/g, ' ') ?? 'Guard'} · {guard.phone}
                        </div>
                      </div>
                      <div className="text-end flex-shrink-0">
                        {guard.alreadyDeployed ? (
                          <Badge bg="warning" text="dark" style={{ fontSize: '0.68rem' }}>
                            Deployed at {guard.deployedAt}
                          </Badge>
                        ) : (
                          <Badge bg="success" style={{ fontSize: '0.68rem' }}>✓ Available</Badge>
                        )}
                        {isSelected && (
                          <div style={{ color: '#0F7B6C', fontWeight: 700, fontSize: '0.78rem', marginTop: 2 }}>
                            Selected ✓
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ padding: '6px 12px', borderTop: '1px solid #e9ecef', background: '#f8f9fa', fontSize: '0.72rem' }}>
              <Form.Check
                type="switch"
                id="allow-deployed"
                label="Allow selecting already-deployed guards (double deployment)"
                checked={allowDeployed}
                onChange={e => setAllowDeployed(e.target.checked)}
              />
            </div>
          </div>
        </div>

        {/* Summary preview */}
        {selected && reason && (
          <div style={{ background: '#D0EDE9', borderRadius: '0.5rem', padding: '12px 16px', fontSize: '0.83rem' }}>
            <div className="fw-bold mb-1" style={{ color: '#1B3A6B' }}>📋 Assignment Summary</div>
            <div>Replacing: <strong>{absentDeployment.guardName}</strong></div>
            <div>Replacement: <strong>{selected.fullName}</strong>{selected.systemId && ` (${selected.systemId})`}</div>
            <div>Site: <strong>{absentDeployment.siteName}</strong></div>
            <div>Reason: {REPLACEMENT_REASONS[reason as ReplacementReason]}</div>
            {note && <div className="text-muted mt-1 fst-italic">Note: {note}</div>}
            {selected.alreadyDeployed && (
              <div className="mt-2" style={{ color: '#856404', fontWeight: 500 }}>
                ⚠️ This guard is already deployed at {selected.deployedAt}. This will create a double deployment.
              </div>
            )}
          </div>
        )}

        {mutation.isError && (
          <Alert variant="danger" className="mt-3 small py-2">
            {(mutation.error as any)?.response?.data?.error ?? 'Failed to assign replacement. Please try again.'}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
        <Button variant="danger" disabled={!canSubmit} onClick={handleSubmit}>
          {mutation.isPending
            ? <><Spinner size="sm" animation="border" className="me-1" />Assigning…</>
            : 'Assign Replacement'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
