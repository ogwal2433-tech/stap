import { useState } from 'react';
import { Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import {
  useSystemErrors, useSystemErrorStats, useUpdateErrorStatus,
} from '../../hooks/useSystemErrors';
import { useToast } from '../../context/ToastContext';
import {
  SEVERITY_COLORS, CATEGORY_LABELS, ERROR_STATUS_COLORS,
} from '@security360/shared';
import type { SystemErrorResponse } from '@security360/shared';

const NAVY = '#1B3A6B';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function severityBadge(severity: string) {
  const bg = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? 'secondary';
  return <Badge bg={bg} text={severity === 'WARN' ? 'dark' : undefined}>{severity}</Badge>;
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
}

function statusBadge(status: string) {
  const bg = ERROR_STATUS_COLORS[status as keyof typeof ERROR_STATUS_COLORS] ?? 'secondary';
  return <Badge bg={bg}>{status}</Badge>;
}

function severityBorderColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return '#1a1a1a';
    case 'ERROR':    return '#dc3545';
    case 'WARN':     return '#ffc107';
    default:          return '#0dcaf0';
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemErrorsPage() {
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedError, setSelectedError] = useState<SystemErrorResponse | null>(null);
  const [resolveTarget, setResolveTarget] = useState<SystemErrorResponse | null>(null);

  const { showToast } = useToast();

  const { data: stats } = useSystemErrorStats();
  const { data, isLoading } = useSystemErrors({
    search:   search || undefined,
    status:   statusFilter || undefined,
    severity: severityFilter || undefined,
    category: categoryFilter || undefined,
    page,
    limit: 50,
  });
  const updateStatus = useUpdateErrorStatus();

  const errors = data?.data ?? [];
  const pagination = data?.pagination;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSeverityFilter('');
    setCategoryFilter('');
    setPage(1);
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status: status as any } });
      showToast(`Error marked as ${status.toLowerCase()}`, 'success');
      if (selectedError?.id === id) {
        setSelectedError((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to update error status', 'danger');
    }
  };

  return (
    <div className="p-3 p-md-4">
      <h4 className="fw-bold mb-3" style={{ color: NAVY }}>🚨 System Errors</h4>

      {/* Stat cards */}
      {stats && (
        <Row className="g-3 mb-4">
          <Col md={3}>
            <div style={{ background: '#f8d7da', borderRadius: '0.5rem', padding: '16px', borderLeft: '4px solid #dc3545' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#dc3545' }}>{stats.openCritical}</div>
              <div style={{ fontSize: '0.82rem', color: '#842029' }}>🚨 Critical Open</div>
            </div>
          </Col>
          <Col md={3}>
            <div style={{ background: '#fff3cd', borderRadius: '0.5rem', padding: '16px', borderLeft: '4px solid #ffc107' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#856404' }}>{stats.openError}</div>
              <div style={{ fontSize: '0.82rem', color: '#856404' }}>❌ Errors Open</div>
            </div>
          </Col>
          <Col md={3}>
            <div style={{ background: '#D6E0F0', borderRadius: '0.5rem', padding: '16px', borderLeft: `4px solid ${NAVY}` }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: NAVY }}>{stats.todayCount}</div>
              <div style={{ fontSize: '0.82rem', color: NAVY }}>📅 Today</div>
            </div>
          </Col>
          <Col md={3}>
            <div style={{ background: '#d5f5e3', borderRadius: '0.5rem', padding: '16px', borderLeft: '4px solid #1E8449' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1E8449' }}>{stats.total}</div>
              <div style={{ fontSize: '0.82rem', color: '#1E8449' }}>📊 Total Logged</div>
            </div>
          </Col>
        </Row>
      )}

      {/* Filter bar */}
      <Row className="g-2 mb-3">
        <Col md={4}>
          <Form.Control
            type="text"
            placeholder="Search by message, route, error code..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </Col>
        <Col md={2}>
          <Form.Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
            <option value="IGNORED">Ignored</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}>
            <option value="">All Severities</option>
            <option value="CRITICAL">🚨 Critical</option>
            <option value="ERROR">❌ Error</option>
            <option value="WARN">⚠️ Warning</option>
            <option value="INFO">ℹ️ Info</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            <option value="DATABASE">🗄️ Database</option>
            <option value="API">🌐 API</option>
            <option value="PAYMENT">💳 Payment</option>
            <option value="AUTH">🔐 Auth</option>
            <option value="EXTERNAL_API">🔗 External API</option>
            <option value="SYSTEM">⚙️ System</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Button variant="outline-secondary" onClick={clearFilters} className="w-100">
            Clear Filters
          </Button>
        </Col>
      </Row>

      {/* Error list */}
      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : errors.length === 0 ? (
        <div className="text-muted small text-center py-4">No errors match the current filters.</div>
      ) : (
        errors.map((err) => (
          <div
            key={err.id}
            style={{
              border:       '1px solid #e9ecef',
              borderRadius: '0.5rem',
              marginBottom: '8px',
              borderLeft:   `4px solid ${severityBorderColor(err.severity)}`,
              background:   err.status === 'RESOLVED' ? '#f8f9fa' : '#fff',
              opacity:      err.status === 'IGNORED' ? 0.6 : 1,
            }}
          >
            <div className="d-flex align-items-start gap-3 p-3 flex-wrap">
              <div style={{ minWidth: '140px' }}>
                <div className="mb-1">{severityBadge(err.severity)}</div>
                <Badge bg="secondary" className="d-block mb-1" style={{ fontSize: '0.65rem' }}>
                  {categoryLabel(err.category)}
                </Badge>
                {statusBadge(err.status)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>
                  {err.errorCode ?? 'UNKNOWN'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#4A5568', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {err.message}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                  {err.route && (
                    <span className="me-2">🌐 {err.method} {err.route}</span>
                  )}
                  <span className="me-2">📅 {formatDate(err.lastSeenAt)}</span>
                  {err.occurrenceCount > 1 && (
                    <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>
                      🔁 ×{err.occurrenceCount}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="d-flex flex-column gap-1 flex-shrink-0">
                <Button size="sm" variant="outline-secondary" onClick={() => setSelectedError(err)}>
                  View
                </Button>
                {err.status === 'OPEN' && (
                  <Button size="sm" variant="outline-warning" onClick={() => handleUpdateStatus(err.id, 'INVESTIGATING')}>
                    🔍 Investigate
                  </Button>
                )}
                {(err.status === 'OPEN' || err.status === 'INVESTIGATING') && (
                  <Button size="sm" variant="outline-success" onClick={() => setResolveTarget(err)}>
                    ✅ Resolve
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="d-flex justify-content-center align-items-center gap-2 mt-3">
          <Button size="sm" variant="outline-secondary" disabled={!pagination.hasPrev} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <span className="small text-muted">Page {pagination.page} of {pagination.totalPages}</span>
          <Button size="sm" variant="outline-secondary" disabled={!pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      )}

      {/* Detail modal */}
      {selectedError && (
        <ErrorDetailModal
          error={selectedError}
          onClose={() => setSelectedError(null)}
          onUpdateStatus={handleUpdateStatus}
          onResolve={() => setResolveTarget(selectedError)}
        />
      )}

      {/* Resolve modal */}
      {resolveTarget && (
        <ResolveErrorModal
          error={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onResolved={(updated) => {
            setResolveTarget(null);
            if (selectedError?.id === updated.id) setSelectedError(updated);
          }}
        />
      )}
    </div>
  );
}

// ── Error Detail Modal ──────────────────────────────────────────────────────────

function ErrorDetailModal({
  error, onClose, onUpdateStatus, onResolve,
}: {
  error: SystemErrorResponse;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onResolve: () => void;
}) {
  return (
    <Modal size="xl" show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Error Detail — {error.errorCode ?? 'UNKNOWN'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-flex gap-2 mb-3 flex-wrap">
          {severityBadge(error.severity)}
          <Badge bg="secondary">{categoryLabel(error.category)}</Badge>
          {statusBadge(error.status)}
          {error.occurrenceCount > 1 && (
            <Badge bg="warning" text="dark">Occurred {error.occurrenceCount}× times</Badge>
          )}
        </div>

        <div style={{ background: '#1a1a1a', color: '#f8f9fa', padding: '14px 16px', borderRadius: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <div style={{ color: '#dc3545', fontWeight: 600, marginBottom: '8px' }}>{error.errorCode}</div>
          {error.message}
        </div>

        {error.stack && (
          <details className="mb-3">
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>📋 Stack Trace</summary>
            <pre style={{ background: '#f8f9fa', padding: '12px', borderRadius: '0.375rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px', marginTop: '8px' }}>
              {error.stack}
            </pre>
          </details>
        )}

        <Row className="g-3 mb-3">
          <Col md={6}>
            <div className="small text-muted mb-1">Route</div>
            <code style={{ fontSize: '0.82rem' }}>{error.method} {error.route ?? '—'}</code>
          </Col>
          <Col md={3}>
            <div className="small text-muted mb-1">HTTP Status</div>
            <strong>{error.statusCode ?? '—'}</strong>
          </Col>
          <Col md={3}>
            <div className="small text-muted mb-1">User Role</div>
            <div style={{ fontSize: '0.82rem' }}>{error.userRole ?? '—'}</div>
          </Col>
          <Col md={4}>
            <div className="small text-muted mb-1">First Seen</div>
            {formatDate(error.firstSeenAt)}
          </Col>
          <Col md={4}>
            <div className="small text-muted mb-1">Last Seen</div>
            {formatDate(error.lastSeenAt)}
          </Col>
          <Col md={4}>
            <div className="small text-muted mb-1">IP Address</div>
            {error.ipAddress ?? '—'}
          </Col>
        </Row>

        {error.context && (
          <details className="mb-3">
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>🔍 Request Context</summary>
            <pre style={{ background: '#f8f9fa', padding: '12px', borderRadius: '0.375rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px', marginTop: '8px' }}>
              {JSON.stringify(error.context, null, 2)}
            </pre>
          </details>
        )}

        {error.status === 'RESOLVED' && (
          <div style={{ background: '#d5f5e3', borderRadius: '0.5rem', padding: '12px 16px', borderLeft: '4px solid #1E8449' }}>
            <div className="fw-bold text-success mb-1">✅ Resolved</div>
            <div className="small">
              By: {error.resolvedBy?.name ?? '—'} · {formatDate(error.resolvedAt)}
            </div>
            {error.resolutionNotes && (
              <div className="small mt-1 text-muted">{error.resolutionNotes}</div>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <div className="d-flex gap-2 flex-wrap">
          {error.status === 'OPEN' && (
            <Button variant="warning" onClick={() => onUpdateStatus(error.id, 'INVESTIGATING')}>
              🔍 Mark as Investigating
            </Button>
          )}
          {error.status !== 'RESOLVED' && (
            <Button variant="success" onClick={onResolve}>
              ✅ Mark as Resolved
            </Button>
          )}
          {error.status !== 'IGNORED' && (
            <Button variant="outline-secondary" onClick={() => onUpdateStatus(error.id, 'IGNORED')}>
              Ignore
            </Button>
          )}
          <Button variant="outline-secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// ── Resolve Modal ────────────────────────────────────────────────────────────────

function ResolveErrorModal({
  error, onClose, onResolved,
}: {
  error: SystemErrorResponse;
  onClose: () => void;
  onResolved: (updated: SystemErrorResponse) => void;
}) {
  const [notes, setNotes] = useState('');
  const { showToast } = useToast();
  const updateStatus = useUpdateErrorStatus();

  const handleConfirm = async () => {
    try {
      const updated = await updateStatus.mutateAsync({
        id: error.id,
        data: { status: 'RESOLVED', resolutionNotes: notes.trim() || undefined },
      });
      showToast('Error marked as resolved', 'success');
      onResolved(updated);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to resolve error', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Resolve Error</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-3">
          <div className="small text-muted text-uppercase fw-semibold">{error.errorCode ?? 'UNKNOWN'}</div>
          <div className="small" style={{ color: '#4A5568' }}>{error.message}</div>
        </div>
        <Form.Group>
          <Form.Label className="small fw-bold">Resolution Notes (optional)</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was done to fix this?"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={updateStatus.isPending}>Cancel</Button>
        <Button variant="success" onClick={handleConfirm} disabled={updateStatus.isPending}>
          {updateStatus.isPending ? 'Resolving…' : 'Confirm Resolve'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
