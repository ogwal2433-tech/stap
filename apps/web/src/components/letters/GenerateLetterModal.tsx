import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useGenerateLetterRecord } from '../../hooks/useLetters';

const LETTER_TYPE_COLORS: Record<string, string> = {
  WARNING:              '#dc3545',
  SUSPENSION:           '#E8701A',
  TERMINATION:          '#842029',
  COMMENDATION:         '#1E8449',
  REINSTATEMENT:        '#0F7B6C',
  GENERAL:              '#1B3A6B',
  COMMITMENT_AGREEMENT: '#5A3E9B',
};
const LETTER_TYPE_BG: Record<string, string> = {
  WARNING:              '#f8d7da',
  SUSPENSION:           '#fff3cd',
  TERMINATION:          '#f8d7da',
  COMMENDATION:         '#d5f5e3',
  REINSTATEMENT:        '#D0EDE9',
  GENERAL:              '#D6E0F0',
  COMMITMENT_AGREEMENT: '#EDE8F8',
};
const LETTER_TYPE_LABELS: Record<string, string> = {
  WARNING:              'Warning Letter',
  SUSPENSION:           'Suspension Letter',
  COMMENDATION:         'Commendation Letter',
  TERMINATION:          'Termination Letter',
  REINSTATEMENT:        'Reinstatement Letter',
  GENERAL:              'General Letter',
  COMMITMENT_AGREEMENT: 'Commitment Agreement',
};

// Letter types that have structured fields instead of a free-form body textarea
const STRUCTURED_TYPES = new Set(['COMMITMENT_AGREEMENT']);

function buildCommitmentAgreementBody(guardName: string, startDate: string, minimumPeriod: string): string {
  return `<p>Dear <strong>${guardName}</strong>,</p>

<p style="font-weight:bold; text-decoration:underline; font-size:12pt;">RE: EMPLOYMENT COMMITMENT AGREEMENT</p>

<p>This Employment Commitment Agreement is entered into between <strong>STAP Security Ltd</strong> (hereinafter "the Company") and <strong>${guardName}</strong> (hereinafter "the Employee"), effective from <strong>${startDate}</strong>.</p>

<p style="font-weight:bold;">1. Employment Duration</p>
<p>The Employee commits to remaining in the employment of STAP Security Ltd for a minimum period of <strong>${minimumPeriod}</strong> from the effective start date of <strong>${startDate}</strong>.</p>

<p style="font-weight:bold;">2. Training &amp; Development</p>
<p>STAP Security Ltd commits to providing the Employee with the necessary training, uniform, personal protective equipment, and resources required to perform their assigned security duties effectively.</p>

<p style="font-weight:bold;">3. Employee Obligations</p>
<p>The Employee agrees to adhere to all Company policies, rules, and regulations as detailed in the STAP Security Ltd Staff Handbook, including the Code of Conduct, uniform standards, attendance requirements, and site assignment directives.</p>

<p style="font-weight:bold;">4. Early Departure Consequences</p>
<p>Should the Employee resign, abandon their post, or otherwise terminate their employment before the minimum commitment period of <strong>${minimumPeriod}</strong> has elapsed, STAP Security Ltd reserves the right to recover reasonable costs associated with training, uniform, and equipment issued to the Employee.</p>

<p style="font-weight:bold;">5. Governing Law &amp; Dispute Resolution</p>
<p>This Agreement shall be governed by the laws of the Republic of Uganda. Any dispute arising from this Agreement shall be resolved through the Company's internal grievance procedure in the first instance.</p>

<p>By signing below, the Employee confirms that they have read, understood, and voluntarily agree to the terms of this Employment Commitment Agreement.</p>`;
}

interface Props {
  subjectType: 'GUARD' | 'STAFF' | 'APPLICANT';
  subjectId:   string;
  subjectName: string;
  show:        boolean;
  onClose:     () => void;
  onSuccess?:  () => void;
}

export default function GenerateLetterModal({
  subjectType, subjectId, subjectName, show, onClose, onSuccess,
}: Props) {
  const mutation = useGenerateLetterRecord();
  const [letterType, setLetterType]       = useState('GENERAL');
  const [title, setTitle]                 = useState('');
  const [body, setBody]                   = useState('');
  const [minimumPeriod, setMinimumPeriod] = useState('');
  const [startDate, setStartDate]         = useState('');
  const [error, setError]                 = useState('');
  const [succeeded, setSucceeded]         = useState(false);

  const isStructured = STRUCTURED_TYPES.has(letterType);

  function handleClose() {
    setLetterType('GENERAL');
    setTitle('');
    setBody('');
    setMinimumPeriod('');
    setStartDate('');
    setError('');
    setSucceeded(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let finalBody = body;

    if (isStructured) {
      if (letterType === 'COMMITMENT_AGREEMENT') {
        if (!minimumPeriod.trim()) { setError('Minimum commitment period is required.'); return; }
        if (!startDate.trim())     { setError('Start date is required.'); return; }
        const formattedDate = new Date(startDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildCommitmentAgreementBody(subjectName, formattedDate, minimumPeriod.trim());
      }
      if (!title.trim()) { setError('Letter title is required.'); return; }
    } else {
      if (!title.trim()) { setError('Letter title is required.'); return; }
      if (body.trim().length < 20) { setError('Letter body must be at least 20 characters.'); return; }
    }

    try {
      await mutation.mutateAsync({
        subjectType,
        subjectId,
        subjectName,
        title:      title.trim(),
        body:       finalBody,
        letterType: letterType as any,
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
        <Modal.Title>Generate Letter — {subjectName}</Modal.Title>
      </Modal.Header>

      {succeeded ? (
        <Modal.Body>
          <div className="text-center py-4">
            <div style={{ fontSize: '3rem' }}>✉️</div>
            <div className="fw-bold mt-2" style={{ color: '#1B3A6B' }}>Letter Draft Created</div>
            <div className="text-muted small mt-1">
              HR has been notified and will review this letter for approval.
              {isStructured && ' A PDF will be emailed to HR upon approval.'}
            </div>
            <Button className="mt-3" variant="outline-primary" onClick={handleClose}>Close</Button>
          </div>
        </Modal.Body>
      ) : (
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

            {/* Letter type selector */}
            <Form.Label className="small fw-bold">Letter Type <span className="text-danger">*</span></Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {Object.entries(LETTER_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLetterType(key)}
                  style={{
                    padding: '6px 14px', borderRadius: '0.5rem', fontSize: '0.82rem', cursor: 'pointer',
                    fontWeight:  letterType === key ? 600 : 400,
                    border:      `2px solid ${letterType === key ? LETTER_TYPE_COLORS[key] : '#ced4da'}`,
                    background:  letterType === key ? LETTER_TYPE_BG[key]     : '#fff',
                    color:       letterType === key ? LETTER_TYPE_COLORS[key] : '#4A5568',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Title */}
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Title <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                maxLength={200}
                placeholder={
                  letterType === 'COMMITMENT_AGREEMENT'
                    ? `Employment Commitment Agreement — ${subjectName}`
                    : 'e.g. First Written Warning — Lateness'
                }
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </Form.Group>

            {/* Structured fields for COMMITMENT_AGREEMENT */}
            {letterType === 'COMMITMENT_AGREEMENT' && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Minimum Commitment Period <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. 6 months, 1 year"
                    value={minimumPeriod}
                    onChange={e => setMinimumPeriod(e.target.value)}
                  />
                  <Form.Text className="text-muted">
                    The minimum employment period the guard commits to.
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Effective Start Date <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The agreement body will be auto-generated from the fields above. A formatted PDF will
                  be emailed to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Free-form body — only for non-structured types */}
            {!isStructured && (
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Letter Body <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={10}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={`Dear ${subjectName},\n\nThis letter is to formally notify you...\n\nSigned,\nManagement`}
                  style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem' }}
                />
                <Form.Text className="text-muted">{body.length} characters</Form.Text>
              </Form.Group>
            )}

            <Alert variant="info" className="mb-0 small py-2">
              📋 This letter will be saved as a <strong>draft pending HR approval</strong>. The HR Manager will be notified
              and must approve before the letter is considered official. You will be notified when a decision is made.
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
                : 'Generate Letter Draft'}
            </Button>
          </Modal.Footer>
        </Form>
      )}
    </Modal>
  );
}
