import { useState } from 'react';
import { Badge, Button, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import {
  SR_STATUSES, SERVICE_REQUEST_TYPES, SERVICE_REQUEST_PRIORITY_COLORS,
  type ServiceRequestResponse,
} from '@security360/shared';
import { serviceRequestsApi } from '../../lib/serviceRequests.api';
import { useClientList as useClients } from '../../hooks/useClients';
import ServiceRequestDetailModal from '../../components/serviceRequests/ServiceRequestDetailModal';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const TH: React.CSSProperties = {
  padding: '10px 12px', color: 'white', fontWeight: 700,
  fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap',
};

const SUMMARY_CARDS = [
  { key: 'pending'    as const, label: 'Pending',     filter: 'PENDING',     colour: '#E8701A', icon: '⏳' },
  { key: 'inProgress' as const, label: 'In Progress', filter: 'IN_PROGRESS', colour: '#1B3A6B', icon: '🔄' },
  { key: 'completed'  as const, label: 'Completed',   filter: 'COMPLETED',   colour: '#1E8449', icon: '✅' },
  { key: 'rejected'   as const, label: 'Rejected',    filter: 'REJECTED',    colour: '#C0392B', icon: '❌' },
];

/**
 * Every client's service requests in one queue.
 *
 * The counterpart to the client portal's submit form — this is where Security360
 * actually reads and answers what clients ask for.
 */
export default function StaffServiceRequestsPage() {
  const [status,   setStatus]   = useState('');
  const [clientId, setClientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [page,     setPage]     = useState(1);
  const [selected, setSelected] = useState<ServiceRequestResponse | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['sr-summary'],
    queryFn:  serviceRequestsApi.getSummary,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['service-requests', { status, clientId, dateFrom, dateTo, page }],
    queryFn:  () => serviceRequestsApi.list({
      ...(status   ? { status }   : {}),
      ...(clientId ? { clientId } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo   ? { dateTo }   : {}),
      page,
      limit: 20,
    }),
  });

  const { data: clientsRes } = useClients({ limit: 200 });
  const clients = clientsRes?.data ?? [];

  const requests   = data?.data ?? [];
  const pagination = data?.pagination;
  const filtered   = !!(status || clientId || dateFrom || dateTo);

  const clearFilters = () => {
    setStatus(''); setClientId(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>📋 Service Requests</h5>
          <div className="text-muted small">What clients have asked us to do</div>
        </div>
        {!!summary?.pending && (
          <Badge bg="danger" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            {summary.pending} awaiting a reply
          </Badge>
        )}
      </div>

      {/* Summary cards double as status filters */}
      {summary && (
        <Row className="g-2 mb-3">
          {SUMMARY_CARDS.map((c) => (
            <Col key={c.key} xs={6} md={3}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setStatus(status === c.filter ? '' : c.filter); setPage(1); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setStatus(status === c.filter ? '' : c.filter);
                    setPage(1);
                  }
                }}
                style={{
                  background: 'white', borderRadius: '0.75rem', padding: '14px 16px',
                  border: `2px solid ${status === c.filter ? c.colour : '#e9ecef'}`,
                  cursor: 'pointer', transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.colour, lineHeight: 1 }}>
                  {c.icon} {summary[c.key]}
                </div>
                <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>{c.label}</div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* Filters */}
      <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: 16 }}>
        <Row className="g-2 align-items-end">
          <Col md={3} sm={6}>
            <Form.Label className="small fw-bold mb-1">Status</Form.Label>
            <Form.Select size="sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {SR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Form.Select>
          </Col>
          <Col md={3} sm={6}>
            <Form.Label className="small fw-bold mb-1">Client</Form.Label>
            <Form.Select size="sm" value={clientId} onChange={(e) => { setClientId(e.target.value); setPage(1); }}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
            </Form.Select>
          </Col>
          <Col md={2} sm={4}>
            <Form.Label className="small fw-bold mb-1">From</Form.Label>
            <Form.Control type="date" size="sm" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </Col>
          <Col md={2} sm={4}>
            <Form.Label className="small fw-bold mb-1">To</Form.Label>
            <Form.Control type="date" size="sm" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </Col>
          <Col md={2} sm={4}>
            <Button size="sm" variant="outline-secondary" disabled={!filtered} onClick={clearFilters}>
              Clear
            </Button>
          </Col>
        </Row>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : requests.length === 0 ? (
        <div style={{
          border: '2px dashed #ced4da', borderRadius: '0.5rem',
          padding: '40px', textAlign: 'center', color: '#6c757d',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
          <div className="fw-bold mb-1">No service requests found</div>
          <div style={{ fontSize: '0.82rem' }}>
            {filtered
              ? 'Nothing matches these filters — try clearing them.'
              : 'No client has submitted a service request yet.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid #e9ecef', borderRadius: '0.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#1B3A6B' }}>
                  <th style={TH}>Date</th>
                  <th style={TH}>Client</th>
                  <th style={TH}>Request</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Priority</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Submitted by</th>
                  <th style={{ ...TH, width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((sr, i) => {
                  const meta = SR_STATUSES.find((s) => s.value === sr.status);
                  return (
                    <tr key={sr.id} style={{
                      background: i % 2 === 0 ? '#fff' : '#F8F9FA',
                      borderBottom: '1px solid #e9ecef',
                    }}>
                      <td style={{ padding: '10px 12px', color: '#6c757d', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {fmtDate(sr.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        <div>{sr.clientName}</div>
                        {sr.clientSystemId && (
                          <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 400 }}>
                            {sr.clientSystemId}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 260 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sr.subject}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          {SERVICE_REQUEST_TYPES[sr.type as keyof typeof SERVICE_REQUEST_TYPES] ?? sr.type}
                          {sr.siteName ? ` · ${sr.siteName}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Badge
                          bg={SERVICE_REQUEST_PRIORITY_COLORS[sr.priority] ?? 'secondary'}
                          text={sr.priority === 'HIGH' ? 'dark' : undefined}
                          style={{ fontSize: '0.68rem' }}
                        >
                          {sr.priority}
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge
                          bg={meta?.colour ?? 'secondary'}
                          text={sr.status === 'PENDING' ? 'dark' : undefined}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {meta?.label ?? sr.status}
                        </Badge>
                        {sr.respondedAt && (
                          <div style={{ fontSize: '0.68rem', color: '#adb5bd', marginTop: 2 }}>
                            {fmtDate(sr.respondedAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.78rem' }}>
                        {sr.requestedBy?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button
                          size="sm"
                          variant={sr.status === 'PENDING' ? 'primary' : 'outline-secondary'}
                          style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                          onClick={() => setSelected(sr)}
                        >
                          {sr.status === 'PENDING' ? 'Respond' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <div className="text-muted small">
                Showing {requests.length} of {pagination.total} request{pagination.total === 1 ? '' : 's'}
              </div>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-secondary" disabled={!pagination.hasPrev}
                  onClick={() => setPage((p) => p - 1)}>← Previous</Button>
                <span className="small text-muted align-self-center">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button size="sm" variant="outline-secondary" disabled={!pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <ServiceRequestDetailModal
          show
          sr={selected}
          onClose={() => setSelected(null)}
          onSuccess={() => setSelected(null)}
        />
      )}
    </Container>
  );
}
