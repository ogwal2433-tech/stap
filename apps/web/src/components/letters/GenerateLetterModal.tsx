import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useGenerateLetterRecord } from '../../hooks/useLetters';

const LETTER_TYPE_COLORS: Record<string, string> = {
  WARNING:       '#dc3545',
  SUSPENSION:    '#E8701A',
  TERMINATION:   '#842029',
  COMMENDATION:  '#1E8449',
  REINSTATEMENT: '#0F7B6C',
  GENERAL:       '#1B3A6B',
};
const LETTER_TYPE_BG: Record<string, string> = {
  WARNING:       '#f8d7da',
  SUSPENSION:    '#fff3cd',
  TERMINATION:   '#f8d7da',
  COMMENDATION:  '#d5f5e3',
  REINSTATEMENT: '#D0EDE9',
  GENERAL:       '#D6E0F0',
};
const LETTER_TYPE_LABELS: Record<string, string> = {
  WARNING:       'Warning Letter',
  SUSPENSION:    'Suspension Letter',
  COMMENDATION:  'Commendation Letter',
  TERMINATION:   'Termination Letter',
  REINSTATEMENT: 'Reinstatement Letter',
  GENERAL:       'General Letter',
};

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
  const [letterType, setLetterType]     = useState('GENERAL');
  const [title, setTitle]               = useState('');
  const [body, setBody]                 = useState('');
  const [error, setError]               = useState('');
  const [succeeded, setSucceeded]       = useState(false);

  function handleClose() {
    setLetterType('GENERAL');
    setTitle('');
    setBody('');
    setError('');
    setSucceeded(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Letter title is required.'); return; }
    if (body.trim().length < 20) { setError('Letter body must be at least 20 characters.'); return; }
    try {
      await mutation.mutateAsync({
        subjectType,
        subjectId,
        subjectName,
        title: title.trim(),
        body:  body.trim(),
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
                    background:  letterType === key ? LETTER_TYPE_BG[key]    : '#fff',
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
                placeholder="e.g. First Written Warning — Lateness"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </Form.Group>

            {/* Body */}
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
