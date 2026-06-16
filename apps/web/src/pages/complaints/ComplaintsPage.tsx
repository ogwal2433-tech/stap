import { useState } from 'react';
import {
  Badge, Button, Col, Container, Form, Row, Spinner, Table,
} from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { complaintsApi } from '../../lib/complaints.api';
import ComplaintFormModal from '../../components/complaints/ComplaintFormModal';
import ClientComplaintDetailModal from '../../components/complaints/ClientComplaintDetailModal';
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
};

function CatBadge({ c }: { c: string }) {
  const { bg, text } = CAT_BADGE[c] ?? { bg: 'secondary' };
  return <Badge bg={bg} text={text}>{c.replace(/_/g, ' ')}</Badge>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]   = useState<ComplaintResponse | null>(null);
  const [filters, setFilters]       = useState({ status: '', category: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['complaints', filters],
    queryFn:  () => complaintsApi.list({ ...filters, limit: 20 }),
  });

  const complaints = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Client Complaints</h4>
        <Button variant="danger" size="sm" onClick={() => setShowCreate(true)}>+ Log Complaint</Button>
      </div>

      {/* Filters */}
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

      {isLoading ? (
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

      <ComplaintFormModal show={showCreate} onClose={() => setShowCreate(false)} />
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
