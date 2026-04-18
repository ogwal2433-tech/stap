import { useState } from 'react';
import {
  Alert, Badge, Button, Col, Container, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '../../lib/complaints.api';
import { useToast } from '../../context/ToastContext';
import { useClientList as useClients } from '../../hooks/useClients';
import type { ComplaintResponse, UpdateComplaintInput } from '@stap/shared';

// ── Badge helpers ──────────────────────────────────────────────────────────────

const CAT_BADGE: Record<string, { bg: string; text?: string }> = {
  GUARD_CONDUCT:   { bg: 'danger' },
  LATE_DEPLOYMENT: { bg: 'warning', text: 'dark' },
  BILLING_DISPUTE: { bg: 'info' },
  EQUIPMENT:       { bg: 'secondary' },
  OTHER:           { bg: 'light', text: 'dark' },
};
const SEV_BADGE: Record<string, string> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };
const STA_BADGE: Record<string, string> = { OPEN: 'danger', IN_PROGRESS: 'warning', RESOLVED: 'success' };

function CatBadge({ c }: { c: string }) {
  const { bg, text } = CAT_BADGE[c] ?? { bg: 'secondary' };
  return <Badge bg={bg} text={text}>{c.replace(/_/g, ' ')}</Badge>;
}

// ── Create form modal ──────────────────────────────────────────────────────────

function ComplaintFormModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const qc            = useQueryClient();
  const { data: clientsRes } = useClients();
  const clients = clientsRes?.data ?? [];

  const [form, setForm] = useState({ clientId: '', category: 'GUARD_CONDUCT', description: '', severity: 'MEDIUM' });

  const create = useMutation({
    mutationFn: () => complaintsApi.create(form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      showToast('Complaint logged', 'success');
      onClose();
    },
    onError: () => showToast('Failed to log complaint', 'danger'),
  });

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton><Modal.Title>Log Complaint</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Client <span className="text-danger">*</span></Form.Label>
          <Form.Select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
            <option value="">Select client…</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
          </Form.Select>
        </Form.Group>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group>
              <Form.Label>Category</Form.Label>
              <Form.Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {['GUARD_CONDUCT','LATE_DEPLOYMENT','BILLING_DISPUTE','EQUIPMENT','OTHER'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Severity</Form.Label>
              <Form.Select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                {['LOW','MEDIUM','HIGH'].map(s => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
        <Form.Group className="mt-3">
          <Form.Label>Description <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea" rows={4}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe the complaint in detail (min 10 chars)…"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          onClick={() => create.mutate()}
          disabled={!form.clientId || form.description.length < 10 || create.isPending}
        >
          {create.isPending ? <Spinner size="sm" animation="border" /> : 'Submit Complaint'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Detail / update modal ──────────────────────────────────────────────────────

function ComplaintDetailModal({ complaint, onClose }: { complaint: ComplaintResponse; onClose: () => void }) {
  const { showToast } = useToast();
  const qc            = useQueryClient();
  const [update, setUpdate] = useState<UpdateComplaintInput>({});

  const save = useMutation({
    mutationFn: (data: UpdateComplaintInput) => complaintsApi.update(complaint.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      showToast('Complaint updated', 'success');
      onClose();
    },
    onError: () => showToast('Failed to update', 'danger'),
  });

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          Complaint — <CatBadge c={complaint.category} />{' '}
          <Badge bg={SEV_BADGE[complaint.severity]} className="ms-1">{complaint.severity}</Badge>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted mb-1">Client: <strong>{complaint.client.clientName}</strong>{complaint.site ? ` · ${complaint.site.siteName}` : ''}</p>
        <p className="small text-muted mb-3">Opened {complaint.daysOpen} day{complaint.daysOpen !== 1 ? 's' : ''} ago</p>
        <p>{complaint.description}</p>

        {complaint.status === 'RESOLVED' && complaint.resolution && (
          <Alert variant="success" className="small">
            <strong>Resolution:</strong> {complaint.resolution}
            {complaint.resolvedAt && <div className="text-muted mt-1">Resolved: {new Date(complaint.resolvedAt).toLocaleDateString('en-UG')}</div>}
          </Alert>
        )}

        {complaint.status !== 'RESOLVED' && (
          <>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Update Status</Form.Label>
              <Form.Select size="sm" value={update.status ?? ''} onChange={e => setUpdate(u => ({ ...u, status: e.target.value as any || undefined }))}>
                <option value="">— no change —</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </Form.Select>
            </Form.Group>

            {update.status === 'RESOLVED' && (
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Resolution Notes <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea" rows={3} size="sm"
                  value={update.resolution ?? ''}
                  onChange={e => setUpdate(u => ({ ...u, resolution: e.target.value }))}
                  placeholder="Describe how the complaint was resolved…"
                />
                <Form.Text className="text-muted">Client will be automatically notified by email.</Form.Text>
              </Form.Group>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {complaint.status !== 'RESOLVED' && Object.keys(update).length > 0 && (
          <Button
            variant="primary"
            disabled={save.isPending || (update.status === 'RESOLVED' && !update.resolution)}
            onClick={() => save.mutate(update)}
          >
            {save.isPending ? <Spinner size="sm" animation="border" /> : 'Save Changes'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
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
            {['OPEN','IN_PROGRESS','RESOLVED'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Select size="sm" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}>
            <option value="">All Categories</option>
            {['GUARD_CONDUCT','LATE_DEPLOYMENT','BILLING_DISPUTE','EQUIPMENT','OTHER'].map(c => (
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
              <th>Date</th><th>Client</th><th>Site</th><th>Category</th>
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
                <td>{c.site?.siteName ?? '—'}</td>
                <td><CatBadge c={c.category} /></td>
                <td><Badge bg={SEV_BADGE[c.severity]}>{c.severity}</Badge></td>
                <td><Badge bg={STA_BADGE[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td>
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

      {showCreate && <ComplaintFormModal onClose={() => setShowCreate(false)} />}
      {selected && <ComplaintDetailModal complaint={selected} onClose={() => setSelected(null)} />}
    </Container>
  );
}
