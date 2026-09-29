import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, ButtonGroup, Card, Col,
  Form, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useClient, useClientSites, useArchiveClient, useDeleteSite, useSiteIncidents } from '../../hooks/useClients';
import { useClientContracts, useDeleteContract } from '../../hooks/useContracts';
import { useClientComplaints } from '../../hooks/useComplaints';
import RoleGuard from '../../components/RoleGuard';
import SiteFormModal from '../../components/clients/SiteFormModal';
import IncidentFormModal from '../../components/clients/IncidentFormModal';
import ContractFormModal from '../../components/clients/ContractFormModal';
import AmendContractModal from '../../components/clients/AmendContractModal';
import ContractHistory from '../../components/clients/ContractHistory';
import ClientContacts from '../../components/clients/ClientContacts';
import ClientPortalAccess from '../../components/clients/ClientPortalAccess';
import ClientDeployments from '../../components/clients/ClientDeployments';
import BillingSummaryCard from '../../components/clients/BillingSummaryCard';
import PermissionGuard from '../../components/PermissionGuard';
import DeleteConfirmModal from '../../components/shared/DeleteConfirmModal';
import { useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '../../lib/clients.api';
import ComplaintCard from '../../components/complaints/ComplaintCard';
import ClientComplaintDetailModal from '../../components/complaints/ClientComplaintDetailModal';
import ComplaintFormModal from '../../components/complaints/ComplaintFormModal';
import { useToast } from '../../context/ToastContext';
import { ROLES, LEAD_SOURCES, LEAD_STATUSES, MARKETER_LEAD_SOURCE, SHIFT_PATTERNS, DEFAULT_SITE_TYPE, type UserRole, type SiteResponse, type ContractResponse, type ComplaintResponse } from '@security360/shared';
import { computeDisplayDuration } from '../../lib/dateUtils';
import { useHasPermission } from '../../context/AuthContext';

const CLIENT_CONTRACT_BADGE: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  EXPIRED: 'danger',
};

const LEAD_STATUS_BADGE: Record<string, { bg: string; text?: string }> = {
  NEW:       { bg: 'info',     text: 'dark' },
  CONTACTED: { bg: 'warning',  text: 'dark' },
  CONVERTED: { bg: 'success' },
  LOST:      { bg: 'secondary' },
};

const SITE_TYPE_BADGE: Record<string, { bg: string; text?: string; label: string }> = {
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

const CLIENT_ARCHIVE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];
const SITE_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR];
const CONTRACT_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

/** Said before the user confirms, so a refusal is not the first they hear of the rule. */
const DELETE_WARNINGS: Record<'client' | 'site' | 'contract', string> = {
  client:   'Only possible once the client has no sites, open contracts, unpaid invoices or portal logins. Its paid invoices stay on file under its name.',
  site:     'Refused while guards are deployed there. Past attendance and deployments keep the site\u2019s name.',
  contract: 'Refused while it has unpaid invoices. Its invoices stay linked to it.',
};

export default function ClientDetailPage() {
  const canSeeContracts = useHasPermission('contracts.view');
  // The permission the Edit button, the edit page and the contact endpoints all
  // check — contacts are part of the client, not a separate thing to hold a
  // separate opinion about.
  const canEditClient = useHasPermission('clients.edit');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: client, isLoading, isError, refetch } = useClient(id ?? '');
  const { data: sites, refetch: refetchSites } = useClientSites(id ?? '');
  const { data: contracts, refetch: refetchContracts } = useClientContracts(id ?? '', canSeeContracts);
  const { data: complaintsData, isLoading: complaintsLoading, refetch: refetchComplaints } = useClientComplaints(id ?? '');
  const archiveClient = useArchiveClient();
  const deleteSite = useDeleteSite();
  const deleteContract = useDeleteContract(id ?? '');

  const [siteModal, setSiteModal] = useState<{ site?: SiteResponse } | null>(null);
  const [incidentModal, setIncidentModal] = useState<{ siteId: string; siteName: string } | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [contractModal, setContractModal] = useState<{ contract?: ContractResponse } | null>(null);
  const [amendContract, setAmendContract] = useState<ContractResponse | null>(null);
  const [historyFor, setHistoryFor]       = useState<string | null>(null);
  const [incidentPage, setIncidentPage] = useState(1);
  const [showLogComplaintModal, setShowLogComplaintModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintResponse | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [complaintFilter, setComplaintFilter] = useState<string>('ALL');

  // What the delete dialog is about to remove. Deletes are soft and can be
  // restored; a refusal from the server is shown inside the dialog.
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'client' }
    | { kind: 'site' | 'contract'; id: string; name: string }
    | null
  >(null);

  const complaints = complaintsData?.data ?? [];
  const filteredComplaints = complaints.filter(c => complaintFilter === 'ALL' || c.status === complaintFilter);

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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'client') {
      const r = await clientsApi.remove(id!);
      showToast(`${r.name} deleted. It can be restored from Deleted records.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-summary'] });
      navigate('/clients');
    } else if (deleteTarget.kind === 'site') {
      await deleteSite.mutateAsync({ siteId: deleteTarget.id, clientId: id! });
      showToast(`${deleteTarget.name} deleted.`, 'success');
      refetchSites();
    } else {
      await deleteContract.mutateAsync(deleteTarget.id);
      showToast(`${deleteTarget.name} deleted.`, 'success');
      refetchContracts();
    }
  };

  return (
    <div>
      <DeleteConfirmModal
        show={!!deleteTarget}
        onHide={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        entityType={deleteTarget?.kind ?? 'record'}
        entityName={deleteTarget?.kind === 'client' ? (client?.clientName ?? '') : (deleteTarget?.name ?? '')}
        warning={DELETE_WARNINGS[deleteTarget?.kind ?? 'client']}
      />
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/clients')} style={{ cursor: 'pointer' }}>Clients</Breadcrumb.Item>
        <Breadcrumb.Item active>{client.clientName}</Breadcrumb.Item>
      </Breadcrumb>

      {/* Action bar */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>{client.clientName}</h4>
          {client.systemId && (
            <span style={{
              background: '#0F7B6C', color: '#fff', padding: '2px 10px',
              borderRadius: 12, fontSize: '0.78rem', fontWeight: 700,
              letterSpacing: '0.5px', fontFamily: 'monospace',
            }}>
              {client.systemId}
            </span>
          )}
        </div>
        <ButtonGroup size="sm">
          <PermissionGuard permission="clients.edit">
            <Button variant="outline-primary" onClick={() => navigate(`/clients/${id}/edit`)}>
              <i className="bi bi-pencil me-1" />Edit
            </Button>
          </PermissionGuard>
          <RoleGuard allowedRoles={CLIENT_ARCHIVE_ROLES}>
            {client.contractStatus !== 'INACTIVE' && (
              <Button variant="outline-danger" onClick={handleArchive}>Archive</Button>
            )}
          </RoleGuard>
          <PermissionGuard permission="clients.delete">
            <Button variant="outline-danger" onClick={() => setDeleteTarget({ kind: 'client' })}>Delete</Button>
          </PermissionGuard>
          <Button variant="outline-secondary" onClick={() => navigate('/clients')}>
            ← Back
          </Button>
        </ButtonGroup>
      </div>

      {/* Above the record itself: what this client is worth is the question most
          often being asked when someone opens their page. */}
      <BillingSummaryCard clientId={id ?? ''} canView={canSeeContracts} />

      {/* Profile header */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Row className="align-items-center g-3">
            <Col>
              <div className="d-flex align-items-center gap-2 mb-1">
                <h5 className="fw-bold mb-0">{client.clientName}</h5>
                {client.systemId && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#0F7B6C', fontWeight: 700 }}>
                    {client.systemId}
                  </span>
                )}
              </div>
              <div className="text-muted small">
                {client.contactPerson}
                <span style={{ fontSize: '0.68rem', color: '#adb5bd', marginLeft: 6 }}>
                  primary contact
                </span>
              </div>
              <div className="text-muted small">{client.contactPhone}</div>
              {client.email && <div className="text-muted small">{client.email}</div>}
            </Col>
            <Col xs="auto" className="text-end">
              <Badge bg={CLIENT_CONTRACT_BADGE[client.contractStatus]} className="fs-6 px-3 py-2 mb-1 d-block">
                {client.contractStatus}
              </Badge>
              {(client as any).leadStatus && (
                <Badge
                  bg={LEAD_STATUS_BADGE[(client as any).leadStatus]?.bg ?? 'secondary'}
                  text={LEAD_STATUS_BADGE[(client as any).leadStatus]?.text}
                  className="mb-1 d-block"
                  style={{ fontSize: '0.75rem' }}
                >
                  {LEAD_STATUSES[(client as any).leadStatus as keyof typeof LEAD_STATUSES] ?? (client as any).leadStatus}
                </Badge>
              )}
              {canSeeContracts && (
                <div className="text-muted small">Billing: {client.billingTerms} days</div>
              )}
              {(client as any).vatRegistered && (
                <div className="text-muted small">
                  VAT: {(client as any).vatRate ?? 18}%
                </div>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Tabs */}
      <Tabs defaultActiveKey="details" className="mb-3">

        {/* Tab 1 — Details */}
        <Tab eventKey="details" title="Details">
          <Card className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-white small fw-semibold text-muted">Contact &amp; Billing</Card.Header>
            <Card.Body>
              <Row className="g-3">
                {[
                  { label: 'Physical Address', value: client.physicalAddress },
                  // Payment terms belong with the contract, so they follow the
                  // same permission rather than sitting on the profile in clear.
                  ...(canSeeContracts
                    ? [{ label: 'Billing Address', value: client.billingAddress ?? '—' },
                       { label: 'Contract Status', value: client.contractStatus },
                       { label: 'Billing Terms',   value: `${client.billingTerms} days` }]
                    : [{ label: 'Contract Status', value: client.contractStatus }]),
                  { label: 'Date Added',       value: new Date(client.createdAt).toLocaleDateString() },
                  { label: 'Last Updated',     value: new Date(client.updatedAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <Col md={6} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className="fw-medium">{value}</div>
                  </Col>
                ))}
              </Row>
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-white small fw-semibold text-muted">Tax &amp; Compliance</Card.Header>
            <Card.Body>
              <Row className="g-3">
                <Col md={6}>
                  <div className="text-muted small">TIN</div>
                  <div className="fw-medium">{(client as any).tin ?? '—'}</div>
                </Col>
                <Col md={6}>
                  <div className="text-muted small">VAT Status</div>
                  <div className="fw-medium">
                    {(client as any).vatRegistered
                      ? <><Badge bg="success" className="me-2">VAT Registered</Badge>{(client as any).vatRate ?? 18}%</>
                      : <span className="text-muted">Not VAT Registered</span>}
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <ClientContacts clientId={id ?? ''} canEdit={canEditClient} />

          {/* Beside the contacts, deliberately: a portal login belongs to one of
              these people, and this is where you are already looking for them. */}
          <ClientPortalAccess clientId={id ?? ''} clientName={client.clientName} />

          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white small fw-semibold text-muted">Lead Information</Card.Header>
            <Card.Body>
              <Row className="g-3">
                <Col md={4}>
                  <div className="text-muted small">Lead Status</div>
                  <div className="fw-medium mt-1">
                    {(client as any).leadStatus ? (
                      <Badge
                        bg={LEAD_STATUS_BADGE[(client as any).leadStatus]?.bg ?? 'secondary'}
                        text={LEAD_STATUS_BADGE[(client as any).leadStatus]?.text}
                      >
                        {LEAD_STATUSES[(client as any).leadStatus as keyof typeof LEAD_STATUSES] ?? (client as any).leadStatus}
                      </Badge>
                    ) : '—'}
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Lead Source</div>
                  <div className="fw-medium">
                    {client.leadSource
                      ? LEAD_SOURCES[client.leadSource as keyof typeof LEAD_SOURCES] ?? client.leadSource
                      : '—'}
                    {/* The marketer reads as part of the source, not a field of
                        its own: "Marketer" alone leaves the obvious question. */}
                    {client.leadSource === MARKETER_LEAD_SOURCE && client.marketerName && (
                      <span
                        className="text-muted"
                        style={{ fontWeight: 400, fontSize: '0.78rem', marginLeft: '6px' }}
                      >
                        via {client.marketerName}
                      </span>
                    )}
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Referred By</div>
                  <div className="fw-medium">{(client as any).referredBy ?? '—'}</div>
                </Col>
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
                  <th>Zone</th>
                  <th>Shifts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const typeDef = SITE_TYPE_BADGE[s.siteType] ?? SITE_TYPE_BADGE[DEFAULT_SITE_TYPE];
                  const isExpanded = expandedSiteId === s.id;
                  return (
                    <React.Fragment key={s.id}>
                    <tr>
                      <td className="fw-semibold">
                        <span
                          role="button"
                          onClick={() => setExpandedSiteId(isExpanded ? null : s.id)}
                          style={{ cursor: (s.specialInstructions || (s as any).sitePeriodStart) ? 'pointer' : undefined }}
                        >
                          {s.siteName}
                        </span>
                        {s.specialInstructions && (
                          <span
                            role="button"
                            title="Special instructions — click to expand"
                            onClick={() => setExpandedSiteId(isExpanded ? null : s.id)}
                            style={{ marginLeft: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            📋
                          </span>
                        )}
                        {(s as any).hasPeriod && (s as any).sitePeriodStart && (s as any).sitePeriodEnd && (
                          <div className="mt-1">
                            <Badge
                              bg={s.siteType === 'TEMPORARY' ? 'warning' : 'danger'}
                              text={s.siteType === 'TEMPORARY' ? 'dark' : undefined}
                              style={{ fontSize: '0.72rem' }}
                            >
                              📅{' '}
                              {new Date((s as any).sitePeriodStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              {' → '}
                              {new Date((s as any).sitePeriodEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {(s as any).periodDays ? ` · ${(s as any).periodDays}d` : ''}
                            </Badge>
                            {(s as any).sitePeriodNotes && (
                              <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '2px' }}>
                                {(s as any).sitePeriodNotes}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge bg={typeDef.bg} text={typeDef.text}>{typeDef.label}</Badge>
                      </td>
                      <td className="text-muted">{s.location}</td>
                      <td>{s.guardsRequired}</td>
                      <td>
                        {(s as any).firearmsRequired > 0 && <Badge bg="danger" className="me-1" style={{ fontSize: '0.65rem' }}>🔥 {(s as any).firearmsRequired}</Badge>}
                        {(s as any).armedGuardsRequired > 0 && <Badge bg="warning" text="dark" className="me-1" style={{ fontSize: '0.65rem' }}>🔫 {(s as any).armedGuardsRequired}</Badge>}
                        {(s as any).batonRequired > 0 && <Badge bg="secondary" className="me-1" style={{ fontSize: '0.65rem' }}>🛡️ {(s as any).batonRequired}</Badge>}
                        {!(s as any).isArmed && <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {(s as any).zone ? (
                          <Badge bg="teal" style={{ backgroundColor: '#0d9488', fontSize: '0.7rem' }}>
                            {(s as any).zone.name}
                          </Badge>
                        ) : (
                          <span className="text-muted small fst-italic">Unzoned</span>
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
                          <PermissionGuard permission="sites.delete">
                            <Button size="sm" variant="outline-danger" onClick={() => setDeleteTarget({ kind: 'site', id: s.id, name: s.siteName })}>
                              Delete
                            </Button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (s.specialInstructions || (s as any).hasPeriod) && (
                      <tr>
                        <td colSpan={8} style={{ background: '#FFFBEB', padding: '10px 16px' }}>
                          {s.specialInstructions && (
                            <div className="d-flex align-items-start gap-2 mb-2">
                              <span style={{ flexShrink: 0 }}>📋</span>
                              <div>
                                <div className="fw-bold small mb-1" style={{ color: '#1B3A6B' }}>Special Instructions</div>
                                <p className="mb-0 small" style={{ whiteSpace: 'pre-wrap', color: '#4A5568', lineHeight: 1.6 }}>
                                  {s.specialInstructions}
                                </p>
                              </div>
                            </div>
                          )}
                          {(s as any).hasPeriod && (
                            <Card className="mb-0 border-0" style={{ background: s.siteType === 'TEMPORARY' ? '#fff3cd' : '#FEF9E7' }}>
                              <Card.Body className="py-2 px-3">
                                <div className="fw-bold small mb-1" style={{ color: s.siteType === 'TEMPORARY' ? '#664d03' : '#842029' }}>
                                  {s.siteType === 'TEMPORARY' ? '⏳ Temporary Assignment Period' : '🎯 Special Duty Period'}
                                </div>
                                {(s as any).sitePeriodStart && (s as any).sitePeriodEnd ? (
                                  <>
                                    <div className="small"><strong>From:</strong>{' '}{new Date((s as any).sitePeriodStart).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                                    <div className="small mt-1"><strong>To:</strong>{' '}{new Date((s as any).sitePeriodEnd).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                                    <div className="small mt-1"><strong>Duration:</strong> {(s as any).periodDays} day(s)</div>
                                    {(s as any).sitePeriodNotes && (
                                      <div className="small mt-1 text-muted fst-italic">"{(s as any).sitePeriodNotes}"</div>
                                    )}
                                    {(() => {
                                      const now   = new Date();
                                      const start = new Date((s as any).sitePeriodStart);
                                      const end   = new Date((s as any).sitePeriodEnd);
                                      if (now > end) return <Badge bg="secondary" className="mt-2">✓ Completed</Badge>;
                                      if (now >= start && now <= end) return <Badge bg="success" className="mt-2">🔴 Active now</Badge>;
                                      const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                      return <Badge bg="info" className="mt-2">Starts in {daysUntil} day(s)</Badge>;
                                    })()}
                                  </>
                                ) : (
                                  <p className="mb-0 small text-muted">No period dates recorded.</p>
                                )}
                              </Card.Body>
                            </Card>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* Tab 3 — Deployments. Guards posted at this client's sites, current
            first. Reads deployment history rather than today's roster, so a
            stint shows the day it started even if the guard has moved since. */}
        <Tab eventKey="deployments" title="Deployments">
          <ClientDeployments clientId={id!} />
        </Tab>

        {/* Tab 4 — Contracts. Hidden without contracts.view: this tab carries the
            per-guard rates and the monthly value, which the Control Room must
            not see even though it works the same client's sites daily. */}
        {canSeeContracts && (
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
                  <th>Guards</th>
                  <th>Rate Breakdown</th>
                  <th>Monthly Value</th>
                  <th>Shift Pattern</th>
                  <th>Weapons</th>
                  <th>Days Left</th>
                  <th>Expiry</th>
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
                        <div className="fw-semibold">
                          {new Date(c.contractStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-muted small">
                          → {new Date(c.contractEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#0F7B6C', fontWeight: 600, marginTop: '2px' }}>
                          {computeDisplayDuration(c.contractStart, c.contractEnd)}
                        </div>
                      </td>
                      <td>
                        <div className="fw-bold">{c.guardsRequired} total</div>
                        <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                          {c.guardRates.map((r) => `${r.guardsCount} ${r.guardType}`).join(', ')}
                        </div>
                      </td>
                      <td>
                        {c.guardRates.map((r) => (
                          <div key={r.id} style={{ fontSize: '0.72rem', color: '#4A5568' }}>
                            {r.guardType}: {r.guardsCount} × UGX {r.ratePerGuard.toLocaleString()}
                          </div>
                        ))}
                      </td>
                      <td className="fw-semibold">UGX {c.totalMonthlyValue.toLocaleString()}</td>
                      <td className="text-muted">
                        {c.shiftPattern
                          ? SHIFT_PATTERNS[c.shiftPattern as keyof typeof SHIFT_PATTERNS] ?? c.shiftPattern
                          : '—'}
                      </td>
                      <td className="text-muted">
                        {c.weaponsAllocation != null ? c.weaponsAllocation : '—'}
                      </td>
                      <td className={daysColor}>
                        {c.daysRemaining > 0 ? (
                          <>
                            {c.daysRemaining} days
                            {c.daysRemaining <= 30 && c.status !== 'EXPIRED' && (
                              <span className="ms-1">⚠️</span>
                            )}
                          </>
                        ) : (
                          <span>Expired</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const days = c.daysRemaining;
                          if (days < 0) return <Badge bg="danger">❌ Expired</Badge>;
                          if (days <= 30) return <Badge bg="warning" text="dark">⚠️ Expiring in {days}d</Badge>;
                          if (days <= 90) return <Badge bg="info">ℹ️ {days}d left</Badge>;
                          return <Badge bg="success">✅ Active</Badge>;
                        })()}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <PermissionGuard permission="contracts.edit">
                            {/* Amend, not Edit: a signed contract changes with a
                                reason and a record of what it was. Edit remains
                                for a DRAFT that was never agreed with anyone. */}
                            {c.status === 'DRAFT' ? (
                              <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={() => setContractModal({ contract: c })}
                              >
                                Edit
                              </Button>
                            ) : c.status !== 'EXPIRED' && (
                              <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={() => setAmendContract(c)}
                              >
                                Amend
                              </Button>
                            )}
                          </PermissionGuard>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}
                          >
                            History{c.amendmentCount > 0 ? ` (${c.amendmentCount})` : ''}
                          </Button>
                          <PermissionGuard permission="contracts.delete">
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => setDeleteTarget({ kind: 'contract', id: c.id, name: `Contract ${c.id.slice(-8).toUpperCase()}` })}
                            >
                              Delete
                            </Button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* The history opens under the contracts it belongs to rather
                    than on a separate screen, so the current terms and what they
                    used to be are read together. */}
                {historyFor && (
                  <tr>
                    <td colSpan={9} style={{ background: '#F8F9FA' }}>
                      <ContractHistory contractId={historyFor} />
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Tab>
        )}

        {/* Tab 5 — Complaints */}
        <Tab eventKey="complaints" title={`Complaints (${complaintsLoading ? '…' : complaints.length})`}>
          {/* Header row */}
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <div className="fw-bold text-navy">Complaints</div>
              {complaints.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                  {complaints.filter(c => c.status === 'OPEN').length} open · {complaints.length} total
                </div>
              )}
            </div>
            <Button variant="outline-danger" size="sm" onClick={() => setShowLogComplaintModal(true)}>
              + Log Complaint
            </Button>
          </div>

          {/* Status filter */}
          {complaints.length > 0 && (
            <div className="d-flex gap-2 mb-3 flex-wrap">
              {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={complaintFilter === s ? 'primary' : 'outline-secondary'}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setComplaintFilter(s)}
                >
                  {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                  {s === 'OPEN' && (
                    <Badge bg="danger" className="ms-1" style={{ fontSize: '0.65rem' }}>
                      {complaints.filter(c => c.status === 'OPEN').length}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          )}

          {/* Complaints list */}
          {complaintsLoading ? (
            <div className="text-center py-4">
              <Spinner size="sm" className="me-2" />
              Loading complaints…
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="text-center py-5" style={{ color: '#6c757d' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
              <div className="fw-bold mb-1">
                {complaints.length === 0 ? 'No complaints logged yet' : 'No complaints match this filter'}
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                {complaints.length === 0
                  ? 'Use the button above to log a complaint for this client.'
                  : 'Try a different status filter.'}
              </div>
            </div>
          ) : (
            <div>
              {filteredComplaints.map(complaint => (
                <ComplaintCard
                  key={complaint.id}
                  complaint={complaint}
                  onViewMore={() => {
                    setSelectedComplaint(complaint);
                    setShowComplaintDetail(true);
                  }}
                />
              ))}
            </div>
          )}

          {/* Complaint detail modal */}
          {selectedComplaint && (
            <ClientComplaintDetailModal
              show={showComplaintDetail}
              complaint={selectedComplaint}
              onClose={() => {
                setShowComplaintDetail(false);
                setSelectedComplaint(null);
              }}
            />
          )}
        </Tab>

        {/* Tab 6 — Incidents */}
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

      {amendContract && (
        <AmendContractModal
          show
          contract={amendContract}
          onClose={() => setAmendContract(null)}
          onSuccess={() => { refetchContracts(); refetch(); }}
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

      {showLogComplaintModal && (
        <ComplaintFormModal
          show={showLogComplaintModal}
          onClose={() => setShowLogComplaintModal(false)}
          onSuccess={() => {
            refetchComplaints();
            refetch();
          }}
          preselectedClient={{ id: client.id, clientName: client.clientName }}
        />
      )}
    </div>
  );
}
