import { Badge, Button, Col, Modal, Row } from 'react-bootstrap';
import type { ComplaintResponse } from '@stap/shared';
import { COMPLAINT_SEVERITY_COLORS, COMPLAINT_STATUS_COLORS } from '@stap/shared';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-UG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface Props {
  show:      boolean;
  complaint: ComplaintResponse;
  onClose:   () => void;
}

export default function ClientComplaintDetailModal({ show, complaint, onClose }: Props) {
  const isResolved = complaint.status === 'RESOLVED';

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Complaint Details</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Priority + Status badges */}
        <div className="d-flex align-items-center gap-2 mb-4">
          <Badge
            bg={COMPLAINT_SEVERITY_COLORS[complaint.severity]}
            text={complaint.severity === 'MEDIUM' ? 'dark' : undefined}
            style={{ fontSize: '0.82rem' }}
          >
            {complaint.severity} Severity
          </Badge>
          <Badge
            bg={COMPLAINT_STATUS_COLORS[complaint.status]}
            text={complaint.status === 'IN_PROGRESS' ? 'dark' : undefined}
            style={{ fontSize: '0.82rem' }}
          >
            {complaint.status.replace('_', ' ')}
          </Badge>
          <span className="text-muted small ms-auto">
            Logged {formatDate(complaint.createdAt)}
          </span>
        </div>

        {/* Subject */}
        <div
          style={{
            fontWeight:   700,
            fontSize:     '1.05rem',
            color:        '#1B3A6B',
            marginBottom: '16px',
          }}
        >
          {complaint.subject}
        </div>

        {/* Description */}
        <div
          style={{
            background:   '#F2F4F7',
            borderRadius: '0.5rem',
            padding:      '14px 16px',
            fontSize:     '0.9rem',
            color:        '#1A1A1A',
            lineHeight:   1.7,
            marginBottom: '20px',
            whiteSpace:   'pre-wrap',
          }}
        >
          {complaint.description}
        </div>

        {/* Metadata grid */}
        <Row className="g-3 mb-3">
          <Col md={6}>
            <div className="text-muted small">Client</div>
            <div className="fw-bold">
              {complaint.client.clientName}
              {complaint.client.systemId && (
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6c757d', marginLeft: '6px' }}>
                  {complaint.client.systemId}
                </span>
              )}
            </div>
          </Col>
          <Col md={6}>
            <div className="text-muted small">Category</div>
            <div className="fw-bold">{complaint.category.replace(/_/g, ' ')}</div>
          </Col>
          {complaint.site && (
            <Col md={6}>
              <div className="text-muted small">Site</div>
              <div className="fw-bold">{complaint.site.siteName}</div>
            </Col>
          )}
          <Col md={6}>
            <div className="text-muted small">Date Logged</div>
            <div className="fw-bold">{formatDate(complaint.createdAt)}</div>
          </Col>
          <Col md={6}>
            <div className="text-muted small">Days Open</div>
            <div className="fw-bold" style={{ color: complaint.daysOpen > 7 ? '#dc3545' : undefined }}>
              {complaint.daysOpen} day{complaint.daysOpen !== 1 ? 's' : ''}
            </div>
          </Col>
          {complaint.assignedTo && (
            <Col md={6}>
              <div className="text-muted small">Assigned To</div>
              <div className="fw-bold">{complaint.assignedTo.name}</div>
            </Col>
          )}
        </Row>

        {/* Resolution section */}
        {isResolved && (
          <div
            style={{
              background:   '#d5f5e3',
              borderRadius: '0.5rem',
              padding:      '14px 16px',
              borderLeft:   '4px solid #1E8449',
              marginTop:    '16px',
            }}
          >
            <div
              style={{
                fontWeight:   700,
                color:        '#1E8449',
                marginBottom: '8px',
                fontSize:     '0.88rem',
              }}
            >
              ✅ Resolution
            </div>
            {complaint.resolution && (
              <div
                style={{
                  fontSize:   '0.88rem',
                  color:      '#1A1A1A',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {complaint.resolution}
              </div>
            )}
            {complaint.resolvedAt && (
              <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '8px' }}>
                Resolved on {formatDate(complaint.resolvedAt)}
              </div>
            )}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
