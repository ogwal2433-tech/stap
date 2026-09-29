import { useState } from 'react';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SR_STATUSES, SR_TERMINAL_STATUSES, SERVICE_REQUEST_TYPES, SERVICE_REQUEST_PRIORITY_COLORS,
  type ServiceRequestResponse, type ServiceRequestStatus,
} from '@security360/shared';
import { serviceRequestsApi } from '../../lib/serviceRequests.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  sr:         ServiceRequestResponse;
  show:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const statusMeta = (value: string) => SR_STATUSES.find((s) => s.value === value);

/** Reads one client request and lets staff answer it. */
export default function ServiceRequestDetailModal({ sr, show, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const qc            = useQueryClient();

  const isClosed = SR_TERMINAL_STATUSES.includes(sr.status as ServiceRequestStatus);

  const [status,        setStatus]        = useState<ServiceRequestStatus>(sr.status as ServiceRequestStatus);
  const [staffResponse, setStaffResponse] = useState(sr.staffResponse ?? '');
  const [staffNotes,    setStaffNotes]    = useState(sr.staffNotes ?? '');
  const [attempted,     setAttempted]     = useState(false);

  const responseRequired = SR_TERMINAL_STATUSES.includes(status);
  const responseMissing  = responseRequired && !staffResponse.trim();

  const update = useMutation({
    mutationFn: () =>
      serviceRequestsApi.updateStatus(sr.id, {
        status,
        staffResponse: staffResponse.trim() || null,
        staffNotes:    staffNotes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      qc.invalidateQueries({ queryKey: ['sr-summary'] });
      showToast('Service request updated.', 'success');
      onSuccess?.();
      onClose();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not update the request.'), 'danger'),
  });

  const handleSubmit = () => {
    setAttempted(true);
    if (responseMissing) return;
    update.mutate();
  };

  const cur = statusMeta(sr.status);

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton style={{ background: '#1B3A6B' }}>
        <Modal.Title style={{ fontSize: '1rem', color: 'white' }}>
          📋 Service Request — {sr.clientName}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Request as submitted */}
        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '14px 16px', marginBottom: 16 }}>
          <Row className="g-3">
            <Col md={6}>
              <div className="text-muted small">Client</div>
              <div className="fw-bold">{sr.clientName}</div>
              {sr.clientSystemId && (
                <div className="text-muted" style={{ fontSize: '0.72rem' }}>{sr.clientSystemId}</div>
              )}
            </Col>
            <Col md={3}>
              <div className="text-muted small">Submitted</div>
              <div className="fw-bold small">{fmtDate(sr.createdAt)}</div>
            </Col>
            <Col md={3}>
              <div className="text-muted small">Submitted by</div>
              <div className="fw-bold small">{sr.requestedBy?.name ?? '—'}</div>
            </Col>

            <Col md={6}>
              <div className="text-muted small">Request type</div>
              <div className="fw-bold">
                {SERVICE_REQUEST_TYPES[sr.type as keyof typeof SERVICE_REQUEST_TYPES] ?? sr.type}
                {sr.quantity ? ` · qty ${sr.quantity}` : ''}
              </div>
            </Col>
            <Col md={3}>
              <div className="text-muted small">Priority</div>
              <Badge
                bg={SERVICE_REQUEST_PRIORITY_COLORS[sr.priority] ?? 'secondary'}
                text={sr.priority === 'HIGH' ? 'dark' : undefined}
              >
                {sr.priority}
              </Badge>
            </Col>
            <Col md={3}>
              <div className="text-muted small">Current status</div>
              <Badge bg={cur?.colour ?? 'secondary'} text={sr.status === 'PENDING' ? 'dark' : undefined}>
                {cur?.label ?? sr.status}
              </Badge>
            </Col>

            {sr.siteName && (
              <Col md={12}>
                <div className="text-muted small">Site</div>
                <div className="fw-bold small">{sr.siteName}</div>
              </Col>
            )}
          </Row>

          <div className="mt-3">
            <div className="text-muted small mb-1">Subject</div>
            <div className="fw-bold" style={{ fontSize: '0.9rem' }}>{sr.subject}</div>
          </div>

          <div className="mt-2">
            <div className="text-muted small mb-1">Description</div>
            <div style={{ fontSize: '0.85rem', color: '#2C3E50', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {sr.description}
            </div>
          </div>
        </div>

        {/* What was already said */}
        {sr.staffResponse && (
          <div style={{
            background: '#d5f5e3', borderLeft: '3px solid #1E8449',
            borderRadius: '0.5rem', padding: '12px 16px', marginBottom: 16,
          }}>
            <div className="fw-bold small text-success mb-1">Response sent to client</div>
            <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{sr.staffResponse}</div>
            {sr.respondedAt && (
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>
                {sr.respondedBy?.name ?? 'Staff'} · {fmtDate(sr.respondedAt)}
              </div>
            )}
          </div>
        )}

        {sr.staffNotes && (
          <div style={{
            background: '#FEF9E7', borderLeft: '3px solid #E8701A',
            borderRadius: '0.5rem', padding: '10px 14px', marginBottom: 16,
          }}>
            <div className="fw-bold small mb-1" style={{ color: '#856404' }}>
              Internal notes — not visible to the client
            </div>
            <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>{sr.staffNotes}</div>
          </div>
        )}

        {isClosed ? (
          <Alert variant={sr.status === 'COMPLETED' ? 'success' : 'danger'} className="mb-0 py-2 small">
            This request was <strong>{sr.status.toLowerCase()}</strong> on {fmtDate(sr.respondedAt)} and can no
            longer be changed.
          </Alert>
        ) : (
          <>
            <hr />
            <div className="fw-bold small mb-3">Update this request</div>

            <Form.Group className="mb-3">
              <Form.Label className="fw-bold small">Status</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {SR_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value as ServiceRequestStatus)}
                    style={{
                      padding: '7px 14px', borderRadius: '0.5rem', cursor: 'pointer',
                      border: `2px solid ${status === s.value ? '#1B3A6B' : '#ced4da'}`,
                      background: status === s.value ? '#D6E0F0' : '#fff',
                      fontSize: '0.82rem', fontWeight: status === s.value ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {responseRequired && (
                <Form.Text className="text-muted">
                  {status === 'COMPLETED' ? 'Completing' : 'Rejecting'} a request closes it for good.
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-bold small">
                Response to client{responseRequired && <span className="text-danger"> *</span>}
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                maxLength={2000}
                value={staffResponse}
                onChange={(e) => setStaffResponse(e.target.value)}
                placeholder="Write what the client should be told…"
                isInvalid={attempted && responseMissing}
              />
              <Form.Control.Feedback type="invalid">
                A response is required when completing or rejecting a request.
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                The client sees this in their portal and is notified.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label className="fw-bold small">
                Internal notes
                <span className="text-muted fw-normal ms-1">— staff only, the client never sees this</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={2000}
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Follow-up actions, who is handling it…"
              />
            </Form.Group>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button size="sm" variant="outline-secondary" onClick={onClose} disabled={update.isPending}>
          Close
        </Button>
        {!isClosed && (
          <Button size="sm" variant="primary" onClick={handleSubmit} disabled={update.isPending}>
            {update.isPending
              ? <><Spinner as="span" size="sm" animation="border" className="me-1" />Saving…</>
              : 'Save update'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
