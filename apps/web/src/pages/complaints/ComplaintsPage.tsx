import { useState } from 'react';
import {
  Badge, Button, Col, Container, Form, Nav, Row, Spinner, Table,
} from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '../../lib/complaints.api';
import ComplaintFormModal from '../../components/complaints/ComplaintFormModal';
import SendClientNoticeModal from '../../components/complaints/SendClientNoticeModal';
import ClientComplaintDetailModal from '../../components/complaints/ClientComplaintDetailModal';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import type { ComplaintResponse } from '@stap/shared';

// ── Badge helpers ──────────────────────────────────────────────────────────────

const CAT_BADGE: Record<string, { bg: string; text?: string }> = {
  GUARD_CONDUCT:   { bg: 'danger' },
  LATE_DEPLOYMENT: { bg: 'warning', text: 'dark' },
  BILLING_DISPUTE: { bg: 'info' },
  EQUIPMENT:       { bg: 'secondary' },
  OTHER:           { bg: 'light', text: 'dark' },
};
const SEV_BADGE: Record<string, string> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };
const STA_BADGE: Record<string, string> = {
  OPEN:                'danger',
  UNDER_INVESTIGATION: 'warning',
  RESOLVED:            'success',
  SENT:                'primary',
  ACKNOWLEDGED:        'info',
};

function CatBadge({ c }: { c: string }) {
  const { bg, text } = CAT_BADGE[c] ?? { bg: 'secondary' };
  return <Badge bg={bg} text={text}>{c.replace(/_/g, ' ')}</Badge>;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Left border colour tracks how far along the notice is. */
const NOTICE_ACCENT: Record<string, string> = {
  SENT:         '#1B3A6B',
  ACKNOWLEDGED: '#0F7B6C',
  RESOLVED:     '#1E8449',
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const { showToast } = useToast();
  const qc            = useQueryClient();

  const [tab,        setTab]        = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [showCreate, setShowCreate] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [selected,   setSelected]   = useState<ComplaintResponse | null>(null);
  const [filters,    setFilters]    = useState({ status: '', category: '', page: 1 });

  // ── Inbound: complaints clients raised with STAP ────────────────────────────
  const { data: inboundData, isLoading: inboundLoading } = useQuery({
    queryKey: ['complaints', 'INBOUND', filters],
    queryFn:  () => complaintsApi.list({ ...filters, direction: 'INBOUND', limit: 20 }),
  });

  const complaints = inboundData?.data ?? [];
  const pagination = inboundData?.pagination;
  const openCount  = complaints.filter(c => c.status === 'OPEN').length;

  // ── Outbound: notices STAP sent to clients ──────────────────────────────────
  const { data: outboundData, isLoading: outboundLoading } = useQuery({
    queryKey: ['complaints', 'OUTBOUND'],
    queryFn:  () => complaintsApi.list({ direction: 'OUTBOUND', limit: 100 }),
  });

  const notices        = outboundData?.data ?? [];
  const awaitingAckCnt = notices.filter(c => c.status === 'SENT').length;

  const resolveNotice = useMutation({
    mutationFn: (id: string) => complaintsApi.resolveNotice(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      showToast('Notice marked as resolved.', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not resolve the notice.'), 'danger'),
  });

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Complaints &amp; Notices</h4>
        {tab === 'INBOUND' ? (
          <Button variant="danger" size="sm" onClick={() => setShowCreate(true)}>+ Log Complaint</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setShowNotice(true)}>📤 Send Notice to Client</Button>
        )}
      </div>

      <Nav variant="tabs" className="mb-3">
        <Nav.Item>
          <Nav.Link
            active={tab === 'INBOUND'}
            onClick={() => setTab('INBOUND')}
            style={{ cursor: 'pointer' }}
          >
            📥 From Clients
            {openCount > 0 && (
              <Badge bg="danger" className="ms-2" style={{ fontSize: '0.65rem' }}>{openCount}</Badge>
            )}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            active={tab === 'OUTBOUND'}
            onClick={() => setTab('OUTBOUND')}
            style={{ cursor: 'pointer' }}
          >
            📤 Sent to Clients
            {awaitingAckCnt > 0 && (
              <Badge bg="warning" text="dark" className="ms-2" style={{ fontSize: '0.65rem' }}>
                {awaitingAckCnt}
              </Badge>
            )}
          </Nav.Link>
        </Nav.Item>
      </Nav>

      {/* ── INBOUND ─────────────────────────────────────────────────────────── */}
      {tab === 'INBOUND' && (
        <>
          <Row className="g-2 mb-3">
            <Col md={3}>
              <Form.Select size="sm" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
                <option value="">All Statuses</option>
                {(['OPEN', 'UNDER_INVESTIGATION', 'RESOLVED'] as const).map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select size="sm" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}>
                <option value="">All Categories</option>
                {['GUARD_CONDUCT', 'LATE_DEPLOYMENT', 'BILLING_DISPUTE', 'EQUIPMENT', 'OTHER'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </Form.Select>
            </Col>
          </Row>

          {inboundLoading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : (
            <Table striped hover responsive className="align-middle small">
              <thead className="table-dark">
                <tr>
                  <th>Date</th><th>Client</th><th>Subject</th><th>Category</th>
                  <th>Severity</th><th>Status</th><th>Days Open</th><th>Assigned</th><th></th>
                </tr>
              </thead>
              <tbody>
                {complaints.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted py-4">No complaints found</td></tr>
                )}
                {complaints.map(c => (
                  <tr key={c.id}>
                    <td>{new Date(c.createdAt).toLocaleDateString('en-UG')}</td>
                    <td>{c.client.clientName}</td>
                    <td style={{ maxWidth: 220 }} className="text-truncate">{c.subject}</td>
                    <td><CatBadge c={c.category} /></td>
                    <td><Badge bg={SEV_BADGE[c.severity]}>{c.severity}</Badge></td>
                    <td>
                      <Badge
                        bg={STA_BADGE[c.status] ?? 'secondary'}
                        text={c.status === 'UNDER_INVESTIGATION' ? 'dark' : undefined}
                      >
                        {c.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td style={{ color: c.daysOpen > 7 ? '#dc3545' : undefined }}>{c.daysOpen}d</td>
                    <td>{c.assignedTo?.name ?? <span className="text-muted">Unassigned</span>}</td>
                    <td><Button size="sm" variant="outline-primary" onClick={() => setSelected(c)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="d-flex justify-content-center gap-2 mt-3">
              <Button size="sm" variant="outline-secondary" disabled={!pagination.hasPrev} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>← Prev</Button>
              <span className="small align-self-center text-muted">Page {filters.page} of {pagination.totalPages}</span>
              <Button size="sm" variant="outline-secondary" disabled={!pagination.hasNext} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next →</Button>
            </div>
          )}
        </>
      )}

      {/* ── OUTBOUND ────────────────────────────────────────────────────────── */}
      {tab === 'OUTBOUND' && (
        outboundLoading ? (
          <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
        ) : notices.length === 0 ? (
          <div
            style={{
              border: '2px dashed #ced4da', borderRadius: '0.5rem',
              padding: '48px', textAlign: 'center', color: '#6c757d',
            }}
          >
            <div className="fw-bold mb-1">No notices sent yet</div>
            <div style={{ fontSize: '0.82rem', marginBottom: '16px' }}>
              Send a client a formal notice — an overdue invoice, a site access problem, a contract matter.
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowNotice(true)}>
              📤 Send Notice to Client
            </Button>
          </div>
        ) : (
          <div>
            {notices.map(c => (
              <div
                key={c.id}
                style={{
                  border:       '1px solid #e9ecef',
                  borderRadius: '0.5rem',
                  padding:      '12px 16px',
                  marginBottom: '8px',
                  borderLeft:   `4px solid ${NOTICE_ACCENT[c.status] ?? '#6c757d'}`,
                }}
              >
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div style={{ flex: 1 }}>
                    <div className="fw-bold">{c.subject}</div>
                    <div className="text-muted small">
                      To: {c.client.clientName}
                      {c.sentBy && <> · Sent by {c.sentBy.name}</>}
                      {' · '}{fmtDate(c.sentAt ?? c.createdAt)}
                      {' · '}<Badge bg={SEV_BADGE[c.severity]} style={{ fontSize: '0.62rem' }}>{c.severity}</Badge>
                    </div>

                    {c.acknowledgedAt && (
                      <div style={{ color: '#0F7B6C', fontSize: '0.78rem', marginTop: '6px' }}>
                        👀 Acknowledged {fmtDate(c.acknowledgedAt)}
                        {c.acknowledgedBy && <> by {c.acknowledgedBy.name}</>}
                        {c.clientResponse && (
                          <span className="text-muted fst-italic ms-1">
                            — “{c.clientResponse.slice(0, 90)}{c.clientResponse.length > 90 ? '…' : ''}”
                          </span>
                        )}
                      </div>
                    )}

                    {c.status === 'SENT' && (
                      <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '6px' }}>
                        Awaiting the client’s acknowledgement.
                      </div>
                    )}
                  </div>

                  <div className="d-flex flex-column gap-1 align-items-end" style={{ flexShrink: 0 }}>
                    <Badge bg={STA_BADGE[c.status] ?? 'secondary'}>
                      {c.status === 'SENT' ? 'AWAITING ACK' : c.status}
                    </Badge>
                    {c.status !== 'RESOLVED' && (
                      <Button
                        size="sm"
                        variant="outline-success"
                        style={{ fontSize: '0.72rem' }}
                        disabled={resolveNotice.isPending}
                        onClick={() => resolveNotice.mutate(c.id)}
                      >
                        ✅ Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <ComplaintFormModal show={showCreate} onClose={() => setShowCreate(false)} />
      <SendClientNoticeModal show={showNotice} onClose={() => setShowNotice(false)} />
      {selected && (
        <ClientComplaintDetailModal
          show
          complaint={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Container>
  );
}
