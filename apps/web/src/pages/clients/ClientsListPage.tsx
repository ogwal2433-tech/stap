import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Form,
  InputGroup, Row, Spinner, Table,
} from 'react-bootstrap';
import { useClientList, useClientSummary, useArchiveClient } from '../../hooks/useClients';
import RoleGuard from '../../components/RoleGuard';
import { useToast } from '../../context/ToastContext';
import { ROLES, LEAD_STATUSES, type UserRole } from '@stap/shared';

const CONTRACT_BADGE: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  EXPIRED: 'danger',
};

const CLIENT_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING];
const CLIENT_ARCHIVE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

export default function ClientsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [contractStatus, setContractStatus] = useState<'ACTIVE' | 'INACTIVE' | 'EXPIRED' | ''>('');
  const [leadStatus, setLeadStatus] = useState<'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST' | ''>('');
  const [sortBy, setSortBy] = useState<'clientName' | 'createdAt' | 'billingTerms'>('clientName');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useClientList({
    search:         search || undefined,
    contractStatus: contractStatus || undefined,
    leadStatus:     leadStatus || undefined,
    sortBy,
    sortOrder: 'asc',
    page,
    limit: 20,
  });

  const { data: summary } = useClientSummary();
  const archiveClient = useArchiveClient();

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archive ${name}? This will set their status to INACTIVE.`)) return;
    try {
      await archiveClient.mutateAsync(id);
      showToast(`${name} archived`, 'success');
    } catch {
      showToast('Failed to archive client', 'danger');
    }
  };

  return (
    <div>
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Clients</Breadcrumb.Item>
      </Breadcrumb>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Client Management</h4>
        <RoleGuard allowedRoles={CLIENT_WRITE_ROLES}>
          <Button
            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
            onClick={() => navigate('/clients/new')}
          >
            <i className="bi bi-plus-lg me-1" />Add Client
          </Button>
        </RoleGuard>
      </div>

      {/* Summary Cards */}
      {summary && (
        <Row xs={2} lg={4} className="g-3 mb-4">
          {[
            { label: 'Active Clients', value: summary.totalActive, color: '#1B3A6B' },
            { label: 'Inactive', value: summary.totalInactive, color: '#6c757d' },
            { label: 'Expiring Contracts', value: summary.expiringContracts, color: '#E8701A' },
            { label: 'Open Complaints', value: summary.openComplaints, color: '#dc3545' },
          ].map(({ label, value, color }) => (
            <Col key={label}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body className="text-center py-3">
                  <div className="fw-bold" style={{ fontSize: '2rem', color }}>{value}</div>
                  <div className="text-muted small">{label}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={4}>
              <Form.Label className="small text-muted mb-1">Search</Form.Label>
              <InputGroup size="sm">
                <InputGroup.Text><i className="bi bi-search" /></InputGroup.Text>
                <Form.Control
                  placeholder="Company name, contact, or SSLC number…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </InputGroup>
            </Col>
            <Col md={2}>
              <Form.Label className="small text-muted mb-1">Status</Form.Label>
              <Form.Select
                size="sm"
                value={contractStatus}
                onChange={(e) => { setContractStatus(e.target.value as typeof contractStatus); setPage(1); }}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="EXPIRED">Expired</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label className="small text-muted mb-1">Lead Status</Form.Label>
              <Form.Select
                size="sm"
                value={leadStatus}
                onChange={(e) => { setLeadStatus(e.target.value as typeof leadStatus); setPage(1); }}
              >
                <option value="">All leads</option>
                {Object.entries(LEAD_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label className="small text-muted mb-1">Sort by</Form.Label>
              <Form.Select
                size="sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="clientName">Company Name</option>
                <option value="createdAt">Date Added</option>
                <option value="billingTerms">Billing Terms</option>
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {isLoading ? (
            <div className="py-5 text-center">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : isError ? (
            <Alert variant="danger" className="m-3">Failed to load clients.</Alert>
          ) : data?.data.length === 0 ? (
            <Alert variant="light" className="m-3">No clients found.</Alert>
          ) : (
            <Table hover responsive className="align-middle small mb-0">
              <thead className="table-light">
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Sites</th>
                  <th>Complaints</th>
                  <th>Billing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="fw-semibold">{c.clientName}</div>
                      <div className="text-muted small">{c.contactPerson}</div>
                      {c.systemId && (
                        <div style={{ fontSize: '0.72rem', color: '#0F7B6C', fontFamily: 'monospace', fontWeight: 600 }}>
                          {c.systemId}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{c.contactPhone}</div>
                      {c.email && <div className="text-muted">{c.email}</div>}
                    </td>
                    <td>
                      <Badge bg={CONTRACT_BADGE[c.contractStatus]}>{c.contractStatus}</Badge>
                    </td>
                    <td>
                      <span
                        className="text-primary"
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/clients/${c.id}?tab=sites`)}
                      >
                        {c._count?.sites ?? 0} site{c._count?.sites !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: (c._count?.clientComplaints ?? 0) > 0 ? '#E8701A' : '#6c757d' }}>
                        {c._count?.clientComplaints ?? 0}
                      </span>
                    </td>
                    <td>{c.billingTerms} days</td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button size="sm" variant="outline-primary" onClick={() => navigate(`/clients/${c.id}`)}>
                          View
                        </Button>
                        <RoleGuard allowedRoles={CLIENT_WRITE_ROLES}>
                          <Button size="sm" variant="outline-secondary" onClick={() => navigate(`/clients/${c.id}/edit`)}>
                            Edit
                          </Button>
                        </RoleGuard>
                        <RoleGuard allowedRoles={CLIENT_ARCHIVE_ROLES}>
                          {c.contractStatus !== 'INACTIVE' && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => handleArchive(c.id, c.clientName)}
                            >
                              Archive
                            </Button>
                          )}
                        </RoleGuard>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {data && data.pagination.totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center small text-muted">
            <span>
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.pagination.total)} of {data.pagination.total}
            </span>
            <div className="d-flex gap-2">
              <Button size="sm" variant="outline-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button size="sm" variant="outline-secondary" disabled={!data.pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </Card.Footer>
        )}
      </Card>
    </div>
  );
}
