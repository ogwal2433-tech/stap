import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useGenerateLetterRecord } from '../../hooks/useLetters';
import { DISCIPLINARY_LETTER_LABELS } from '@stap/shared';
import type { DisciplinaryResponse } from '@stap/shared';

function buildSuspensionBody(guardName: string, fromDate: string, toDate: string, reason: string): string {
  return `
<p style="font-weight:bold;text-decoration:underline;font-size:12pt;text-align:center;">SUSPENSION LETTER</p>
<p>To: <strong>${guardName}</strong></p>
<p>Position: Security Guard</p>
<p>Dear ${guardName},</p>
<p>Following an internal review, you are hereby suspended from duty with effect from <strong>${fromDate}</strong> to <strong>${toDate}</strong> due to <strong>${reason}</strong>. During this period, you are required to remain available for any inquiries related to your case.</p>
<p>Failure to comply with company policies may result in further disciplinary action.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Approved by:</p>
  <div style="border-top:1px solid #333;width:200px;margin:28px 0 4px;"></div>
  <div style="border-top:1px solid #333;width:200px;margin:14px 0 4px;"></div>
</div>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Clearance:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;line-height:2;">
    <tr><td>HR Department: <span style="display:inline-block;width:220px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Accounts Department: <span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Operations Department: <span style="display:inline-block;width:195px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Stores Department: <span style="display:inline-block;width:212px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
  </table>
</div>`;
}

interface Props {
  guardId:            string;
  guardName:          string;
  disciplinaryRecord: DisciplinaryResponse;
  show:               boolean;
  onClose:            () => void;
  onSuccess?:         () => void;
}

/** Generates a disciplinary letter (warning/suspension/termination) scoped to one
 * specific disciplinary record. Never used for HR letters — see HRLetterModal. */
export default function DisciplinaryLetterModal({
  guardId, guardName, disciplinaryRecord, show, onClose, onSuccess,
}: Props) {
  const mutation = useGenerateLetterRecord();
  const [letterType, setLetterType]           = useState('WARNING');
  const [title, setTitle]                     = useState('');
  const [body, setBody]                       = useState('');
  const [suspensionFrom, setSuspensionFrom]   = useState('');
  const [suspensionTo, setSuspensionTo]       = useState('');
  const [suspensionReason, setSuspensionReason] = useState(disciplinaryRecord.reason ?? '');
  const [error, setError]                     = useState('');
  const [succeeded, setSucceeded]             = useState(false);

  const isSuspension = letterType === 'SUSPENSION';

  function handleClose() {
    setLetterType('WARNING');
    setTitle('');
    setBody('');
    setSuspensionFrom('');
    setSuspensionTo('');
    setSuspensionReason(disciplinaryRecord.reason ?? '');
    setError('');
    setSucceeded(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let finalBody = body;

    if (isSuspension) {
      if (!suspensionFrom.trim())   { setError('Suspension start date is required.'); return; }
      if (!suspensionTo.trim())     { setError('Suspension end date is required.'); return; }
      if (!suspensionReason.trim()) { setError('Reason for suspension is required.'); return; }
      const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      finalBody = buildSuspensionBody(guardName, fmt(suspensionFrom), fmt(suspensionTo), suspensionReason.trim());
      if (!title.trim()) { setError('Letter title is required.'); return; }
    } else {
      if (!title.trim()) { setError('Letter title is required.'); return; }
      if (body.trim().length < 20) { setError('Letter body must be at least 20 characters.'); return; }
    }

    try {
      await mutation.mutateAsync({
        subjectType: 'GUARD',
        subjectId:   guardId,
        subjectName: guardName,
        title:       title.trim(),
        body:        finalBody,
        letterType:  letterType as any,
        disciplinaryRecordId: disciplinaryRecord.id,
      });
      setSucceeded(true);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to generate letter. Please try again.');
    }
  }

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Generate Disciplinary Letter — {guardName}</Modal.Title>
      </Modal.Header>

      {succeeded ? (
        <Modal.Body>
          <div className="text-center py-4">
            <div style={{ fontSize: '3rem' }}>✉️</div>
            <div className="fw-bold mt-2" style={{ color: '#1B3A6B' }}>Letter Draft Created</div>
            <div className="text-muted small mt-1">
              HR has been notified and will review this letter for approval.
            </div>
            <Button className="mt-3" variant="outline-primary" onClick={handleClose}>Close</Button>
          </div>
        </Modal.Body>
      ) : (
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

            {/* Disciplinary context */}
            <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '10px 14px', marginBottom: 16 }}>
              <div className="fw-bold small" style={{ color: '#1B3A6B' }}>
                Linked Incident — {new Date(disciplinaryRecord.incidentDate).toLocaleDateString('en-GB')}
              </div>
              <div className="text-muted small mt-1">{disciplinaryRecord.type.replace(/_/g, ' ')}</div>
              <div className="small mt-1"><strong>Reason:</strong> {disciplinaryRecord.reason}</div>
              <div className="small"><strong>Outcome:</strong> {disciplinaryRecord.outcome}</div>
            </div>

            <Form.Label className="small fw-bold">Letter Type <span className="text-danger">*</span></Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {Object.entries(DISCIPLINARY_LETTER_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLetterType(key)}
                  style={{
                    padding: '6px 14px', borderRadius: '0.5rem', fontSize: '0.82rem', cursor: 'pointer',
                    fontWeight:  letterType === key ? 600 : 400,
                    border:      `2px solid ${letterType === key ? '#1B3A6B' : '#ced4da'}`,
                    background:  letterType === key ? '#D6E0F0' : '#fff',
                    color:       letterType === key ? '#1B3A6B' : '#4A5568',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Title <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                maxLength={200}
                placeholder={`${DISCIPLINARY_LETTER_LABELS[letterType as keyof typeof DISCIPLINARY_LETTER_LABELS]} — ${guardName}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Form.Group>

            {isSuspension ? (
              <>
                <div className="d-flex gap-3 mb-3">
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Suspension From <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control type="date" value={suspensionFrom} onChange={(e) => setSuspensionFrom(e.target.value)} />
                  </Form.Group>
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Suspension To <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control type="date" value={suspensionTo} onChange={(e) => setSuspensionTo(e.target.value)} />
                  </Form.Group>
                </div>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Reason for Suspension <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                  />
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The suspension letter body will be auto-generated from the fields above.
                </Alert>
              </>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Letter Body <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Dear ${guardName},\n\nThis letter is to formally notify you...\n\nSigned,\nManagement`}
                  style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem' }}
                />
                <Form.Text className="text-muted">{body.length} characters</Form.Text>
              </Form.Group>
            )}

            <Alert variant="info" className="mb-0 small py-2">
              📋 This letter will be saved as <strong>Pending HR Approval</strong> and linked to this disciplinary record.
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
            <Button
              type="submit"
              style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? <><Spinner size="sm" animation="border" className="me-1" />Generating…</>
                : 'Generate Letter'}
            </Button>
          </Modal.Footer>
        </Form>
      )}
    </Modal>
  );
}
