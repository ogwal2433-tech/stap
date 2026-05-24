import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, ButtonGroup, Card, Col,
  Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useClient, useClientSites, useArchiveClient, useDeleteSite, useSiteIncidents } from '../../hooks/useClients';
import { useClientContracts, useDeleteContract } from '../../hooks/useContracts';
import RoleGuard from '../../components/RoleGuard';
import SiteFormModal from '../../components/clients/SiteFormModal';
import IncidentFormModal from '../../components/clients/IncidentFormModal';
import ContractFormModal from '../../components/clients/ContractFormModal';
import { useToast } from '../../context/ToastContext';
import { ROLES, type UserRole, type SiteResponse, type ContractResponse } from '@stap/shared';

const CLIENT_CONTRACT_BADGE: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  EXPIRED: 'danger',
};

const SITE_TYPE_BADGE: Record<string, { bg: string; text?: string; label: string }> = {
  REGULAR:       { bg: 'secondary',              label: 'Regular' },
  TEMPORARY:     { bg: 'warning',  text: 'dark', label: 'Temporary' },
  SPECIAL_DUTIES:{ bg: 'info',     text: 'dark', label: 'Special Duties' },
  PERMANENT:     { bg: 'success',                label: 'Permanent' },
};

const CONTRACT_STATUS_BADGE: Record<string, { bg: string; text?: string }> = {
  DRAFT:    { bg: 'secondary' },
  ACTIVE:   { bg: 'success' },
  EXPIRING: { bg: 'warning', text: 'dark' },
  EXPIRED:  { bg: 'danger' },
};

const SEVERITY_STYLE: Record<string, { bg?: string; text?: string; style?: React.CSSProperties }> = {
  LOW: { bg: 'success' },
  MEDIUM: { bg: 'warning', text: 'dark' },
  HIGH: { bg: 'warning', text: 'dark', style: { backgroundColor: '#E8701A', borderColor: '#E8701A', color: '#fff' } },
  CRITICAL: { bg: 'danger' },
};

const CLIENT_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING];
const CLIENT_ARCHIVE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];
const SITE_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR];
const CONTRACT_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: client, isLoading, isError, refetch } = useClient(id ?? '');
  const { data: sites, refetch: refetchSites } = useClientSites(id ?? '');
  const { data: contracts, refetch: refetchContracts } = useClientContracts(id ?? '');
  const archiveClient = useArchiveClient();
  const deleteSite = useDeleteSite();
  const deleteContract = useDeleteContract(id ?? '');

  const [siteModal, setSiteModal] = useState<{ site?: SiteResponse } | null>(null);
  const [incidentModal, setIncidentModal] = useState<{ siteId: string; siteName: string } | null>(null);
  const [contractModal, setContractModal] = useState<{ contract?: ContractResponse } | null>(null);
  const [incidentPage, setIncidentPage] = useState(1);

  // Incidents across client's sites — aggregate via first site for now (full impl in CLT-006)
  const firstSiteId = sites?.[0]?.id;
  const { data: incidents } = useSiteIncidents(firstSiteId ?? '', incidentPage);

  if (isLoading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (isError || !client) {
    return <Alert variant="danger">Client not found or could not be loaded.</Alert>;
  }

  const handleArchive = async () => {
    if (!confirm(`Archive ${client.clientName}? This sets status to INACTIVE.`)) return;
    try {
      await archiveClient.mutateAsync(id!);
      showToast('Client archived', 'success');
      refetch();
    } catch {
      showToast('Failed to archive', 'danger');
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!confirm('Delete this contract? This cannot be undone.')) return;
    try {
      await deleteContract.mutateAsync(contractId);
      showToast('Contract deleted', 'success');
      refetchContracts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete contract';
      showToast(msg, 'danger');
    }
  };

  const handleDeleteSite = async (siteId: string, siteName: string) => {
    if (!confirm(`Delete site "${siteName}"? This cannot be undone.`)) return;
    try {
      await deleteSite.mutateAsync({ siteId, clientId: id! });
      showToast('Site deleted', 'success');
      refetchSites();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete site';
      showToast(msg, 'danger');
    }
  };

  return (
    <div>
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/clients')} style={{ cursor: 'pointer' }}>Clients</Breadcrumb.Item>
        <Breadcrumb.Item active>{client.clientName}</Breadcrumb.Item>
      </Breadcrumb>

      {/* Action bar */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>{client.clientName}</h4>
        <ButtonGroup size="sm">
          <RoleGuard allowedRoles={CLIENT_WRITE_ROLES}>
            <Button variant="outline-primary" onClick={() => navigate(`/clients/${id}/edit`)}>
              <i className="bi bi-pencil me-1" />Edit
            </Button>
          </RoleGuard>
          <RoleGuard allowedRoles={CLIENT_ARCHIVE_ROLES}>
            {client.contractStatus !== 'INACTIVE' && (
              <Button variant="outline-danger" onClick={handleArchive}>Archive</Button>
            )}
          </RoleGuard>
          <Button variant="outline-secondary" onClick={() => navigate('/clients')}>
            ← Back
          </Button>
        </ButtonGroup>
      </div>

      {/* Profile header */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Row className="align-items-center g-3">
            <Col>
              <h5 className="fw-bold mb-1">{client.clientName}</h5>
              <div className="text-muted small">{client.contactPerson}</div>
              <div className="text-muted small">{client.contactPhone}</div>
              {client.email && <div className="text-muted small">{client.email}</div>}
            </Col>
            <Col xs="auto" className="text-end">
              <Badge bg={CLIENT_CONTRACT_BADGE[client.contractStatus]} className="fs-6 px-3 py-2 mb-2 d-block">
                {client.contractStatus}
              </Badge>
              <div className="text-muted small">Billing: {client.billingTerms} days</div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Tabs */}
      <Tabs defaultActiveKey="details" className="mb-3">

        {/* Tab 1 — Details */}
        <Tab eventKey="details" title="Details">
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <Row className="g-3">
                {[
                  { label: 'Physical Address', value: client.physicalAddress },
                  { label: 'Billing Address', value: client.billingAddress ?? '—' },
                  { label: 'Contract Status', value: client.contractStatus },
                  { label: 'Billing Terms', value: `${client.billingTerms} days` },
                  { label: 'Date Added', value: new Date(client.createdAt).toLocaleDateString() },
                  { label: 'Last Updated', value: new Date(client.updatedAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <Col md={6} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className="fw-medium">{value}</div>
                  </Col>
                ))}
              </Row>
            </Card.Body>
          </Card>
        </Tab>

        {/* Tab 2 — Sites */}
        <Tab eventKey="sites" title={`Sites (${client._count?.sites ?? 0})`}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{client._count?.sites ?? 0} site(s)</span>
            <RoleGuard allowedRoles={SITE_WRITE_ROLES}>
              <Button
                size="sm"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                onClick={() => setSiteModal({})}
              >
                <i className="bi bi-plus-lg me-1" />Add Site
              </Button>
            </RoleGuard>
          </div>

          {!sites || sites.length === 0 ? (
            <Alert variant="light">No sites added yet.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Site Name</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Guards</th>
                  <th>Armed</th>
                  <th>Shifts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const typeDef = SITE_TYPE_BADGE[s.siteType] ?? SITE_TYPE_BADGE.REGULAR;
                  return (
                    <tr key={s.id}>
                      <td className="fw-semibold">{s.siteName}</td>
                      <td>
                        <Badge bg={typeDef.bg} text={typeDef.text}>{typeDef.label}</Badge>
                      </td>
                      <td className="text-muted">{s.location}</td>
                      <td>{s.guardsRequired}</td>
                      <td>
                        {s.requiresFirearms    && <span title="Firearms required" className="me-1">🔥</span>}
                        {s.requiresArmedGuards && <span title="Armed guards required" className="me-1">🔫</span>}
                        {s.requiresWeapons     && <span title="Weapons required" className="me-1">🛡️</span>}
                        {!s.requiresFirearms && !s.requiresArmedGuards && !s.requiresWeapons && (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {s.allowedShiftTypes.length === 0 ? (
                          <span className="text-muted small">Any</span>
                        ) : (
                          s.allowedShiftTypes.map((code) => (
                            <Badge key={code} bg="light" text="dark" className="me-1 border" style={{ fontSize: '0.7rem' }}>
                              {code}
                            </Badge>
                          ))
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline-secondary" onClick={() => setIncidentModal({ siteId: s.id, siteName: s.siteName })}>
                            <i className="bi bi-flag me-1" />Incident
                          </Button>
                          <RoleGuard allowedRoles={SITE_WRITE_ROLES}>
                            <Button size="sm" variant="outline-primary" onClick={() => setSiteModal({ site: s })}>
                              Edit
                            </Button>
                          </RoleGuard>
                          <RoleGuard allowedRoles={[ROLES.DIRECTOR]}>
                            <Button size="sm" variant="outline-danger" onClick={() => handleDeleteSite(s.id, s.siteName)}>
                              Delete
                            </Button>
                          </RoleGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* Tab 3 — Contracts */}
        <Tab eventKey="contracts" title={`Contracts (${contracts?.length ?? 0})`}>
          {/* Expiring warning */}
          {contracts && contracts.filter((c) => c.daysRemaining <= 30 && c.status !== 'EXPIRED' && c.status !== 'DRAFT').length > 0 && (
            <Alert variant="warning" className="small">
              <i className="bi bi-exclamation-triangle me-2" />
              {contracts.filter((c) => c.daysRemaining <= 30 && c.status !== 'EXPIRED' && c.status !== 'DRAFT').length} contract(s) expiring within 30 days. Review and renew as needed.
            </Alert>
          )}

          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{contracts?.length ?? 0} contract(s)</span>
            <RoleGuard allowedRoles={CONTRACT_WRITE_ROLES}>
              <Button
                size="sm"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                onClick={() => setContractModal({})}
              >
                <i className="bi bi-plus-lg me-1" />Add Contract
              </Button>
            </RoleGuard>
          </div>

          {!contracts || contracts.length === 0 ? (
            <Alert variant="light">
              No contracts added yet. Click 'Add Contract' to create the first contract for this client.
            </Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Period</th>
                  <th>Guards Req.</th>
                  <th>Rate/Guard</th>
                  <th>Monthly Value</th>
                  <th>Days Remaining</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const statusStyle = CONTRACT_STATUS_BADGE[c.status] ?? { bg: 'secondary' };
                  const daysColor = c.daysRemaining > 30
                    ? 'text-success'
                    : c.daysRemaining > 0
                    ? 'text-warning fw-semibold'
                    : 'text-danger fw-semibold';

                  return (
                    <tr key={c.id}>
                      <td>
                        <div>{new Date(c.contractStart).toLocaleDateString()}</div>
                        <div className="text-muted">to {new Date(c.contractEnd).toLocaleDateString()}</div>
                      </td>
                      <td>{c.guardsRequired}</td>
                      <td>UGX {c.billingPerGuard.toLocaleString()}</td>
                      <td className="fw-semibold">UGX {c.monthlyValue.toLocaleString()}</td>
                      <td className={daysColor}>
                        {c.daysRemaining > 0 ? (
                          <>
                            {c.daysRemaining} days
                            {c.daysRemaining <= 30 && c.status !== 'EXPIRED' && (
                              <span className="ms-1">⚠️ Expiring</span>
                            )}
                          </>
                        ) : (
                          <span>Expired</span>
                        )}
                      </td>
                      <td>
                        <Badge bg={statusStyle.bg} text={statusStyle.text}>
                          {c.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <RoleGuard allowedRoles={CONTRACT_WRITE_ROLES}>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => setContractModal({ contract: c })}
                            >
                              Edit
                            </Button>
                          </RoleGuard>
                          <RoleGuard allowedRoles={[ROLES.DIRECTOR]}>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => handleDeleteContract(c.id)}
                            >
                              Delete
                            </Button>
                          </RoleGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* Tab 4 — Complaints */}
        <Tab eventKey="complaints" title={`Complaints (${client._count?.clientComplaints ?? 0})`}>
          <Alert variant="info">
            <i className="bi bi-info-circle me-2" />
            Complaint management coming in Sprint 3.
          </Alert>
        </Tab>

        {/* Tab 5 — Incidents */}
        <Tab eventKey="incidents" title="Incidents">
          {!incidents || incidents.data.length === 0 ? (
            <Alert variant="light">No incidents recorded.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Reported By</th>
                </tr>
              </thead>
              <tbody>
                {incidents.data.map((inc) => {
                  const sev = SEVERITY_STYLE[inc.severity] ?? { bg: 'secondary' };
                  return (
                    <tr key={inc.id}>
                      <td>{new Date(inc.occurredAt).toLocaleDateString()}</td>
                      <td>{inc.site.siteName}</td>
                      <td>{inc.incidentType.replace(/_/g, ' ')}</td>
                      <td>
                        <Badge bg={sev.bg} text={sev.text} style={sev.style}>
                          {inc.severity}
                        </Badge>
                      </td>
                      <td>{inc.reportedBy.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>
      </Tabs>

      {/* Modals */}
      {siteModal !== null && (
        <SiteFormModal
          clientId={id!}
          site={siteModal.site}
          onClose={() => setSiteModal(null)}
          onSuccess={() => { refetchSites(); refetch(); }}
        />
      )}

      {incidentModal && (
        <IncidentFormModal
          siteId={incidentModal.siteId}
          siteName={incidentModal.siteName}
          onClose={() => setIncidentModal(null)}
          onSuccess={() => setIncidentModal(null)}
        />
      )}

      {contractModal !== null && (
        <ContractFormModal
          clientId={id!}
          contract={contractModal.contract}
          onClose={() => setContractModal(null)}
          onSuccess={() => { refetchContracts(); refetch(); }}
        />
      )}
    </div>
  );
}
