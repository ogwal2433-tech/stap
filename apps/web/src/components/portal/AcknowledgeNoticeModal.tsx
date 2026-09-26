import { useState } from 'react';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useMutation } from '@tanstack/react-query';
import { portalApi } from '../../lib/portal.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import type { ComplaintResponse } from '@stap/shared';

interface Props {
  notice:     ComplaintResponse;
  show:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Confirms receipt of a notice from STAP, with an optional reply. */
export default function AcknowledgeNoticeModal({ notice, show, onClose, onSuccess }: Props) {
  const { data: companyBranding } = useCompanyBranding();
  const { showToast } = useToast();
  const [response, setResponse] = useState('');

  const acknowledge = useMutation({
    mutationFn: () => portalApi.acknowledgeNotice(notice.id, response.trim() || null),
    onSuccess:  () => {
      showToast('Notice acknowledged.', 'success');
      setResponse('');
      onSuccess?.();
      onClose();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not acknowledge the notice.'), 'danger'),
  });

  const handleClose = () => { if (!acknowledge.isPending) { setResponse(''); onClose(); } };

  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>Acknowledge Notice</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {acknowledge.isError && (
          <Alert variant="danger" className="small py-2">
            {getApiErrorMessage(acknowledge.error, 'Could not acknowledge the notice.')}
          </Alert>
        )}

        <div
          style={{
            background:   '#F2F4F7',
            borderRadius: '0.5rem',
            padding:      '12px 14px',
            marginBottom: '14px',
            borderLeft:   '4px solid #1B3A6B',
          }}
        >
          <div className="fw-bold" style={{ fontSize: '0.92rem' }}>{notice.subject}</div>
          <div className="text-muted small">
            From {companyBranding.company_name} · {fmtDate(notice.sentAt ?? notice.createdAt)}
          </div>
        </div>

        <p className="small text-muted">
          By acknowledging this notice you confirm that you have read and understood it.
        </p>

        <Form.Group>
          <Form.Label className="small fw-semibold">
            Your response <span className="text-muted">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            size="sm"
            maxLength={2000}
            value={response}
            placeholder={`Add any comments or questions for ${companyBranding.company_name}…`}
            onChange={e => setResponse(e.target.value)}
          />
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button size="sm" variant="outline-secondary" onClick={handleClose} disabled={acknowledge.isPending}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
          {acknowledge.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" />Sending…</>
            : '✅ Acknowledge Notice'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
