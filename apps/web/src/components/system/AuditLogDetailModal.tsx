import { Badge, Button, Col, Modal, Row } from 'react-bootstrap';
import type { AuditLogEntry } from '@security360/shared';

interface Props {
  log:     AuditLogEntry;
  show:    boolean;
  onClose: () => void;
}

const PRE: React.CSSProperties = {
  borderRadius: '0.5rem',
  padding:      '12px',
  fontSize:     '0.78rem',
  whiteSpace:   'pre-wrap',
  wordBreak:    'break-word',
  maxHeight:    '280px',
  overflowY:    'auto',
  color:        '#1A1A1A',
  marginBottom: 0,
};

const render = (v: unknown) =>
  typeof v === 'string' ? v : JSON.stringify(v, null, 2);

/** The full record behind one audit row, including what changed. */
export default function AuditLogDetailModal({ log, show, onClose }: Props) {
  const hasChanges = log.newValue != null || log.oldValue != null;

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton style={{ background: '#1B3A6B' }}>
        <Modal.Title style={{ fontSize: '0.95rem', color: 'white' }}>
          🔍 Audit entry — {log.action.replace(/_/g, ' ')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '14px 16px', marginBottom: 16 }}>
          <Row className="g-3">
            <Col md={6}>
              <div className="text-muted small">Action</div>
              <div className="fw-bold">{log.action.replace(/_/g, ' ')}</div>
            </Col>
            <Col md={6}>
              <div className="text-muted small">When</div>
              <div className="fw-bold small">
                {new Date(log.createdAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </div>
            </Col>

            <Col md={4}>
              <div className="text-muted small">Entity</div>
              <div className="fw-bold">{log.entity?.replace(/_/g, ' ') ?? '—'}</div>
            </Col>
            <Col md={8}>
              <div className="text-muted small">Entity ID</div>
              <code style={{ fontSize: '0.8rem', color: '#1B3A6B' }}>{log.entityId || '—'}</code>
            </Col>

            <Col md={6}>
              <div className="text-muted small">Performed by</div>
              {log.performedBy ? (
                <>
                  <div className="fw-bold">{log.performedBy.name}</div>
                  <div className="text-muted small">{log.performedBy.role.replace(/_/g, ' ')}</div>
                </>
              ) : (
                <div>
                  <Badge bg="secondary">System</Badge>
                  <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                    This entry was recorded without an actor.
                  </div>
                </div>
              )}
            </Col>
            {(log.ipAddress || log.userAgent) && (
              <Col md={6}>
                <div className="text-muted small">Origin</div>
                {log.ipAddress && (
                  <code style={{ fontSize: '0.76rem', color: '#4A5568' }}>{log.ipAddress}</code>
                )}
                {log.userAgent && (
                  <div className="text-muted" style={{ fontSize: '0.7rem', wordBreak: 'break-word' }}>
                    {log.userAgent}
                  </div>
                )}
              </Col>
            )}
          </Row>
        </div>

        {log.newValue != null && (
          <div className="mb-3">
            <div className="fw-bold small mb-2" style={{ color: '#1E8449' }}>Changes / new values</div>
            <pre style={{ ...PRE, background: '#F0FFF4', border: '1px solid #d5f5e3' }}>
              {render(log.newValue)}
            </pre>
          </div>
        )}

        {log.oldValue != null && (
          <div className="mb-3">
            <div className="fw-bold small mb-2" style={{ color: '#C0392B' }}>Previous values</div>
            <pre style={{ ...PRE, background: '#FDECEA', border: '1px solid #f5c6cb' }}>
              {render(log.oldValue)}
            </pre>
          </div>
        )}

        {!hasChanges && (
          <div className="text-muted small text-center py-3">
            No before/after detail was recorded for this action.
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button size="sm" variant="outline-secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
