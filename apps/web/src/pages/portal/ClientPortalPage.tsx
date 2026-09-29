import { useState } from 'react';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner, Tab, Table, Tabs } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SERVICE_REQUEST_TYPES, SERVICE_REQUEST_STATUS_COLORS, SERVICE_REQUEST_PRIORITY_COLORS } from '@stap/shared';
import { portalApi } from '../../lib/portal.api';
import { useToast } from '../../context/ToastContext';
import { dashboardApi } from '../../lib/dashboard.api';
import RoleDashboard from '../dashboard/RoleDashboard';
import AcknowledgeNoticeModal from '../../components/portal/AcknowledgeNoticeModal';
import PayInvoiceModal from '../../components/portal/PayInvoiceModal';
import type { ComplaintResponse, InvoiceResponse } from '@stap/shared';

const STA_BADGE: Record<string, string> = {
  PENDING: 'warning', OVERDUE: 'danger', PAID: 'success', PARTIALLY_PAID: 'info',
  // Voided by STAP: kept on the client's statement, owes nothing.
  VOID: 'secondary',
};

/** The statuses the server will accept a payment against. */
const PAYABLE = ['PENDING', 'OVERDUE', 'PARTIALLY_PAID'];
const COMP_BADGE: Record<string, string> = { OPEN: 'danger', IN_PROGRESS: 'warning', RESOLVED: 'success' };

function is403(err: unknown): boolean {
  return (err as any)?.response?.status === 403;
}

function TabSpinner() {
  return (
    <div className="text-center py-5">
      <Spinner animation="border" variant="primary" />
    </div>
  );
}

function TabError({ err, companyName }: { err: unknown; companyName: string }) {
  return (
    <Alert variant="warning" className="mt-3">
      {is403(err) ? `Your account is not yet linked to a client record. Please contact ${companyName} to activate your portal access.` : 'Failed to load data. Please try again later.'}
    </Alert>
  );
}

export default function ClientPortalPage() {
  const { data: companyBranding } = useCompanyBranding();
  const companyName = companyBranding.company_name;
  const notLinkedMessage = `Your account is not yet linked to a client record. Please contact ${companyName} to activate your portal access.`;
  const { showToast } = useToast();

  const { data: overview, isLoading: loadOverview, isError: overviewIsError, error: overviewErr } = useQuery({
    queryKey: ['portal-overview'],
    queryFn:  portalApi.getOverview,
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey:  ['dashboard-stats', 'CLIENT'],
    queryFn:   dashboardApi.getStats,
    staleTime: 5 * 60_000,
  });

  const { data: invoicesRes, isLoading: loadInvoices, isError: invoicesIsError, error: invoicesErr,
          refetch: refetchInvoices } = useQuery({
    queryKey: ['portal-invoices'],
    queryFn:  portalApi.getInvoices,
  });

  const { data: guards, isLoading: loadGuards, isError: guardsIsError, error: guardsErr } = useQuery({
    queryKey: ['portal-guards'],
    queryFn:  portalApi.getDeployedGuards,
  });

  const { data: complaintsRes, isLoading: loadComplaints, isError: complaintsIsError, error: complaintsErr, refetch: refetchComplaints } = useQuery({
    queryKey: ['portal-complaints'],
    queryFn:  portalApi.getComplaints,
  });

  // Notices STAP has sent to this client. Polled so a notice sent while the
  // portal is open still surfaces without a manual refresh.
  const { data: noticesRes, isLoading: loadNotices, refetch: refetchNotices } = useQuery({
    queryKey:        ['portal-notices'],
    queryFn:         portalApi.getNotices,
    refetchInterval: 60_000,
  });

  const invoices   = invoicesRes?.data ?? [];
  const complaints = complaintsRes?.data ?? [];
  const notices    = noticesRes?.data ?? [];
  const unreadNotices = notices.filter(n => n.status === 'SENT').length;

  const { data: sites } = useQuery({
    queryKey: ['portal-sites'],
    queryFn:  portalApi.getSites,
  });

  const { data: srRes, isLoading: loadSR, isError: srIsError, error: srErr, refetch: refetchSR } = useQuery({
    queryKey: ['portal-service-requests'],
    queryFn:  portalApi.getServiceRequests,
  });
  const serviceRequests = srRes?.data ?? [];

  const [srForm, setSrForm] = useState({ subject: '', type: 'OTHER', priority: 'NORMAL', description: '', quantity: '' });
  const [srSubmitted, setSrSubmitted] = useState<string | null>(null);
  const [srError, setSrError] = useState<string | null>(null);

  const submitServiceRequest = useMutation({
    mutationFn: () => portalApi.submitServiceRequest({
      subject:     srForm.subject,
      type:        srForm.type as any,
      priority:    srForm.priority as any,
      description: srForm.description,
      ...(srForm.quantity ? { quantity: parseInt(srForm.quantity, 10) } : {}),
    }),
    onSuccess: (r) => {
      setSrSubmitted(r.id);
      setSrError(null);
      refetchSR();
      setSrForm({ subject: '', type: 'OTHER', priority: 'NORMAL', description: '', quantity: '' });
    },
    onError: (err: unknown) => {
      if (is403(err)) {
        setSrError(notLinkedMessage);
      } else {
        showToast('Failed to submit service request', 'danger');
      }
    },
  });

  const [compForm, setCompForm] = useState({ subject: '', category: 'GUARD_CONDUCT', severity: 'MEDIUM', description: '', siteId: '' });
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  /** The notice the client is acknowledging, if any. */
  const [ackNotice, setAckNotice] = useState<ComplaintResponse | null>(null);
  const [payInvoice, setPayInvoice] = useState<InvoiceResponse | null>(null);

  const submitComplaint = useMutation({
    mutationFn: () => portalApi.submitComplaint({
      subject:     compForm.subject,
      category:    compForm.category as any,
      severity:    compForm.severity as any,
      description: compForm.description,
      ...(compForm.siteId ? { siteId: compForm.siteId } : {}),
    }),
    onSuccess: (c) => {
      setSubmitted(c.id);
      setCompError(null);
      refetchComplaints();
      setCompForm({ subject: '', category: 'GUARD_CONDUCT', severity: 'MEDIUM', description: '', siteId: '' });
    },
    onError: (err: unknown) => {
      if (is403(err)) {
        setCompError(notLinkedMessage);
      } else {
        showToast('Failed to submit complaint', 'danger');
      }
    },
  });

  if (loadOverview) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (overviewIsError) {
    return (
      <Container className="py-5">
        <Alert variant="warning">
          <Alert.Heading>Portal Access Unavailable</Alert.Heading>
          {is403(overviewErr) ? notLinkedMessage : 'Failed to load portal. Please try again later.'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Tabs defaultActiveKey="overview" className="mb-4">

        {/* TAB 1: Overview */}
        <Tab eventKey="overview" title="Overview">
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-4">
              <h5 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Welcome, {overview?.client.clientName}</h5>
              <p className="text-muted small mb-0">{overview?.client.email} · {overview?.client.contactPhone}</p>
            </Card.Body>
          </Card>
          {/* Client-scoped figures from /dashboard/stats — the same role-aware
              source the internal dashboards use, so the portal stays in step. */}
          <div className="mb-4">
            {dashLoading || !dashboard ? (
              <TabSpinner />
            ) : (
              <RoleDashboard data={dashboard} />
            )}
          </div>

          <Row className="g-3 mb-4">
            <Col md={4}>
              <Card className="border-0 shadow-sm h-100" style={{ background: '#f0fdf4' }}>
                <Card.Body className="text-center">
                  <div style={{ fontSize: '2rem' }}>👮</div>
                  <div className="fw-bold" style={{ fontSize: '1.8rem' }}>{overview?.deployedToday ?? 0}</div>
                  <div className="text-muted small">Guards Deployed Today</div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          <h6 className="fw-semibold mb-2 small text-uppercase text-muted">Recent Invoices</h6>
          {loadInvoices ? <TabSpinner /> : invoicesIsError ? <TabError err={invoicesErr} companyName={companyName} /> : (
            <Table size="sm" hover responsive className="small border-0 shadow-sm">
              <thead className="table-light"><tr><th>Invoice #</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.slice(0, 5).map((inv: any) => (
                  <tr key={inv.id}>
                    <td>{inv.invoiceNumber}</td>
                    <td>UGX {inv.totalAmount.toLocaleString()}</td>
                    <td>{new Date(inv.dueDate).toLocaleDateString('en-UG')}</td>
                    <td><Badge bg={STA_BADGE[inv.status] ?? 'secondary'}>{inv.status}</Badge></td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-3">No invoices</td></tr>}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* TAB 2: Invoices */}
        <Tab eventKey="invoices" title="Invoices">
          {loadInvoices ? <TabSpinner /> : invoicesIsError ? <TabError err={invoicesErr} companyName={companyName} /> : (
            <>
              <Alert variant="info" className="small py-2 mb-3">
                Pay invoices securely via MTN Mobile Money or Airtel Money.
              </Alert>
              <Table striped hover responsive className="align-middle small">
                <thead className="table-dark">
                  <tr><th>Invoice #</th><th>Period</th><th>Amount</th><th>Due</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="fw-semibold">{inv.invoiceNumber}</td>
                      <td className="small text-muted">
                        {new Date(inv.periodStart).toLocaleDateString('en-UG')} — {new Date(inv.periodEnd).toLocaleDateString('en-UG')}
                      </td>
                      <td>
                        UGX {inv.totalAmount.toLocaleString()}
                        {inv.paidAmount > 0 && (
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            UGX {inv.outstandingBalance.toLocaleString()} outstanding
                          </div>
                        )}
                      </td>
                      <td>{new Date(inv.dueDate).toLocaleDateString('en-UG')}</td>
                      <td><Badge bg={STA_BADGE[inv.status] ?? 'secondary'}>{inv.status}</Badge></td>
                      <td>
                        {PAYABLE.includes(inv.status) && (
                          <Button size="sm" variant="success" onClick={() => setPayInvoice(inv)}>
                            Pay Now
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">No invoices have been issued yet.</td></tr>}
                </tbody>
              </Table>
            </>
          )}
        </Tab>

        {/* TAB 3: Deployed Guards */}
        <Tab eventKey="guards" title="Deployed Guards">
          {loadGuards ? <TabSpinner /> : guardsIsError ? <TabError err={guardsErr} companyName={companyName} /> : (
            <>
              <Alert variant="info" className="small py-2 mb-3">
                This shows guards currently deployed to your sites. Contact information and personal details are not shown.
              </Alert>
              <Table hover responsive className="align-middle small">
                <thead className="table-light">
                  <tr><th>Guard Name</th><th>Site</th><th>Shift</th><th>Supervisor</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {(guards ?? []).map((g, i) => (
                    <tr key={i}>
                      <td>{g.guardName}</td>
                      <td>{g.site}</td>
                      <td>{g.shiftType}</td>
                      <td>{g.supervisor}</td>
                      <td>{new Date(g.date).toLocaleDateString('en-UG')}</td>
                    </tr>
                  ))}
                  {(!guards || guards.length === 0) && <tr><td colSpan={5} className="text-center text-muted py-4">No guards deployed today</td></tr>}
                </tbody>
              </Table>
            </>
          )}
        </Tab>

        {/* TAB 4: Complaints & Notices */}
        <Tab
          eventKey="complaint"
          title={
            <>
              Complaints
              {unreadNotices > 0 && (
                <Badge bg="danger" className="ms-2" style={{ fontSize: '0.62rem' }}>
                  {unreadNotices}
                </Badge>
              )}
            </>
          }
        >
          {/* ── Notices from STAP — shown first: these need the client to act ── */}
          <div className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <h6 className="fw-semibold mb-0" style={{ color: '#1B3A6B' }}>
                📤 Notices from {companyName}
              </h6>
              {unreadNotices > 0 && (
                <Badge bg="danger" style={{ fontSize: '0.7rem' }}>{unreadNotices} unread</Badge>
              )}
            </div>

            {loadNotices ? (
              <TabSpinner />
            ) : notices.length === 0 ? (
              <div
                style={{
                  border: '2px dashed #ced4da', borderRadius: '0.5rem',
                  padding: '20px', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
                }}
              >
                No notices from {companyName}
              </div>
            ) : (
              notices.map(n => (
                <div
                  key={n.id}
                  style={{
                    border:       '1px solid #e9ecef',
                    borderRadius: '0.5rem',
                    padding:      '14px 16px',
                    marginBottom: '10px',
                    borderLeft:   `4px solid ${
                      n.status === 'SENT' ? '#1B3A6B'
                      : n.status === 'ACKNOWLEDGED' ? '#0F7B6C'
                      : '#1E8449'}`,
                    background:   n.status === 'SENT' ? '#EBF5FB' : '#fff',
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div style={{ flex: 1 }}>
                      {n.status === 'SENT' && (
                        <div
                          style={{
                            fontSize: '0.68rem', fontWeight: 700, color: '#1B3A6B',
                            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                          }}
                        >
                          🔵 New — action required
                        </div>
                      )}

                      <div className="fw-bold" style={{ fontSize: '0.92rem' }}>{n.subject}</div>

                      <div className="text-muted small mt-1">
                        From {companyName} ·{' '}
                        {new Date(n.sentAt ?? n.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                        {' · '}
                        <Badge
                          bg={n.severity === 'HIGH' ? 'danger' : n.severity === 'MEDIUM' ? 'warning' : 'success'}
                          text={n.severity === 'MEDIUM' ? 'dark' : undefined}
                          style={{ fontSize: '0.62rem' }}
                        >
                          {n.severity}
                        </Badge>
                      </div>

                      <div
                        style={{
                          fontSize: '0.85rem', color: '#2C3E50', marginTop: '8px',
                          lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        }}
                      >
                        {n.description}
                      </div>

                      {n.acknowledgedAt && (
                        <div
                          style={{
                            background: '#d5f5e3', borderRadius: '0.375rem',
                            padding: '6px 10px', marginTop: '10px',
                            fontSize: '0.78rem', color: '#1E8449',
                          }}
                        >
                          ✅ You acknowledged this on{' '}
                          {new Date(n.acknowledgedAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}
                          {n.clientResponse && (
                            <div className="fst-italic mt-1 text-muted">
                              Your response: “{n.clientResponse}”
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {n.status === 'SENT' && (
                      <Button
                        variant="primary"
                        size="sm"
                        style={{ flexShrink: 0 }}
                        onClick={() => setAckNotice(n)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <hr className="my-4" />

          <h6 className="fw-semibold mb-3" style={{ color: '#1B3A6B' }}>
            📥 My Complaints to {companyName}
          </h6>

          <Row>
            <Col md={6}>
              <h6 className="fw-semibold mb-3">Submit a Complaint</h6>
              {submitted ? (
                <Alert variant="success">
                  <strong>Complaint received!</strong><br />
                  Reference: <code>#{submitted.slice(-8).toUpperCase()}</code><br />
                  <small className="text-muted">We will respond within 2 business days.</small>
                  <div className="mt-2">
                    <Button size="sm" variant="outline-success" onClick={() => setSubmitted(null)}>Submit Another</Button>
                  </div>
                </Alert>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {compError && (
                    <Alert variant="danger" className="small py-2" onClose={() => setCompError(null)} dismissible>
                      {compError}
                    </Alert>
                  )}
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Subject <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      size="sm" type="text" maxLength={200}
                      value={compForm.subject}
                      onChange={e => setCompForm(f => ({ ...f, subject: e.target.value }))}
                      placeholder="Brief description of the issue…"
                    />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Site <span className="text-muted">(optional)</span></Form.Label>
                    <Form.Select size="sm" value={compForm.siteId} onChange={e => setCompForm(f => ({ ...f, siteId: e.target.value }))}>
                      <option value="">— All sites / General —</option>
                      {(sites ?? []).map(s => <option key={s.id} value={s.id}>{s.siteName}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Category</Form.Label>
                    <Form.Select size="sm" value={compForm.category} onChange={e => setCompForm(f => ({ ...f, category: e.target.value }))}>
                      {['GUARD_CONDUCT','LATE_DEPLOYMENT','BILLING_DISPUTE','EQUIPMENT','OTHER'].map(c => (
                        <option key={c} value={c}>{c.replace(/_/g,' ')}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Severity</Form.Label>
                    <Form.Select size="sm" value={compForm.severity} onChange={e => setCompForm(f => ({ ...f, severity: e.target.value }))}>
                      {['LOW','MEDIUM','HIGH'].map(s => <option key={s} value={s}>{s}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Description <span className="text-danger">*</span></Form.Label>
                    <Form.Control as="textarea" rows={4} size="sm" value={compForm.description} onChange={e => setCompForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe your complaint in detail…" />
                    <Form.Text className="text-muted">Minimum 10 characters</Form.Text>
                  </Form.Group>
                  <Button
                    variant="danger" size="sm"
                    disabled={!compForm.subject.trim() || compForm.description.length < 10 || submitComplaint.isPending}
                    onClick={() => submitComplaint.mutate()}
                  >
                    {submitComplaint.isPending ? <Spinner size="sm" animation="border" /> : 'Submit Complaint'}
                  </Button>
                </div>
              )}
            </Col>
            <Col md={6}>
              <h6 className="fw-semibold mb-3">My Complaints</h6>
              {loadComplaints ? <TabSpinner /> : complaintsIsError ? <TabError err={complaintsErr} companyName={companyName} /> : (
                <div className="d-flex flex-column gap-2">
                  {complaints.map(c => (
                    <Card key={c.id} className="border-0 shadow-sm">
                      <Card.Body className="py-2 px-3 small">
                        <div className="d-flex justify-content-between">
                          <span className="fw-semibold">{c.subject}</span>
                          <Badge bg={COMP_BADGE[c.status] ?? 'secondary'}>{c.status.replace(/_/g,' ')}</Badge>
                        </div>
                        <div className="text-muted">{c.category.replace(/_/g,' ')} · {c.description.slice(0, 60)}{c.description.length > 60 ? '…' : ''}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>{new Date(c.createdAt).toLocaleDateString('en-UG')}</div>
                      </Card.Body>
                    </Card>
                  ))}
                  {complaints.length === 0 && <div className="text-muted small">No complaints submitted yet</div>}
                </div>
              )}
            </Col>
          </Row>
        </Tab>

        {/* TAB 5: Service Requests */}
        <Tab eventKey="service-requests" title="Service Requests">
          <Row>
            <Col md={6}>
              <h6 className="fw-semibold mb-3">Submit a Service Request</h6>
              {srSubmitted ? (
                <Alert variant="success">
                  <strong>Request submitted!</strong><br />
                  Reference: <code>#{srSubmitted.slice(-8).toUpperCase()}</code><br />
                  <small className="text-muted">{companyName} has been notified and will contact you directly.</small>
                  <div className="mt-2">
                    <Button size="sm" variant="outline-success" onClick={() => setSrSubmitted(null)}>Submit Another</Button>
                  </div>
                </Alert>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {srError && (
                    <Alert variant="danger" className="small py-2" onClose={() => setSrError(null)} dismissible>
                      {srError}
                    </Alert>
                  )}
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Type</Form.Label>
                    <Form.Select size="sm" value={srForm.type} onChange={e => setSrForm(f => ({ ...f, type: e.target.value }))}>
                      {Object.entries(SERVICE_REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Form.Select>
                  </Form.Group>
                  {(srForm.type === 'MORE_GUARDS' || srForm.type === 'FEWER_GUARDS') && (
                    <Form.Group>
                      <Form.Label className="small fw-semibold">Quantity <span className="text-danger">*</span></Form.Label>
                      <Form.Control size="sm" type="number" min={1} value={srForm.quantity} onChange={e => setSrForm(f => ({ ...f, quantity: e.target.value }))} />
                    </Form.Group>
                  )}
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Priority</Form.Label>
                    <Form.Select size="sm" value={srForm.priority} onChange={e => setSrForm(f => ({ ...f, priority: e.target.value }))}>
                      {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Subject <span className="text-danger">*</span></Form.Label>
                    <Form.Control size="sm" maxLength={200} value={srForm.subject} onChange={e => setSrForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief summary…" />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Description <span className="text-danger">*</span></Form.Label>
                    <Form.Control as="textarea" rows={4} size="sm" value={srForm.description} onChange={e => setSrForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe your request in detail…" />
                    <Form.Text className="text-muted">Minimum 10 characters</Form.Text>
                  </Form.Group>
                  <Button
                    style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                    size="sm"
                    disabled={
                      !srForm.subject.trim() ||
                      srForm.description.trim().length < 10 ||
                      ((srForm.type === 'MORE_GUARDS' || srForm.type === 'FEWER_GUARDS') && !srForm.quantity) ||
                      submitServiceRequest.isPending
                    }
                    onClick={() => submitServiceRequest.mutate()}
                  >
                    {submitServiceRequest.isPending ? <Spinner size="sm" animation="border" /> : 'Submit Request'}
                  </Button>
                </div>
              )}
            </Col>
            <Col md={6}>
              <h6 className="fw-semibold mb-3">My Service Requests</h6>
              {loadSR ? <TabSpinner /> : srIsError ? <TabError err={srErr} companyName={companyName} /> : (
                <div className="d-flex flex-column gap-2">
                  {serviceRequests.map(sr => (
                    <Card key={sr.id} className="border-0 shadow-sm">
                      <Card.Body className="py-2 px-3 small">
                        <div className="d-flex justify-content-between">
                          <span className="fw-semibold">{sr.subject}</span>
                          <Badge bg={SERVICE_REQUEST_STATUS_COLORS[sr.status] ?? 'secondary'} text={sr.status === 'IN_PROGRESS' ? 'dark' : undefined}>
                            {sr.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="text-muted">
                          {SERVICE_REQUEST_TYPES[sr.type as keyof typeof SERVICE_REQUEST_TYPES] ?? sr.type}
                          {' · '}
                          <Badge bg={SERVICE_REQUEST_PRIORITY_COLORS[sr.priority] ?? 'secondary'} text={sr.priority === 'HIGH' ? 'dark' : undefined}>{sr.priority}</Badge>
                        </div>
                        {sr.quantity != null && <div className="small mt-1">Quantity requested: {sr.quantity}</div>}
                        <div className="text-muted">{sr.description.slice(0, 80)}{sr.description.length > 80 ? '…' : ''}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>Submitted: {new Date(sr.createdAt).toLocaleDateString('en-UG')}</div>
                        {sr.staffResponse && (
                          <div
                            style={{
                              background:   '#d5f5e3',
                              borderLeft:   '4px solid #1E8449',
                              borderRadius: '0.5rem',
                              padding:      '10px 14px',
                              marginTop:    '8px',
                            }}
                          >
                            <div className="fw-bold small text-success mb-1">✅ {companyName} response</div>
                            <div style={{
                              fontSize: '0.85rem', color: '#2C3E50',
                              whiteSpace: 'pre-wrap', lineHeight: 1.6,
                            }}>
                              {sr.staffResponse}
                            </div>
                            {sr.respondedAt && (
                              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>
                                Responded {new Date(sr.respondedAt).toLocaleDateString('en-GB', {
                                  day: 'numeric', month: 'long', year: 'numeric',
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  ))}
                  {serviceRequests.length === 0 && <div className="text-muted small">No service requests submitted yet</div>}
                </div>
              )}
            </Col>
          </Row>
        </Tab>
      </Tabs>

      {ackNotice && (
        <AcknowledgeNoticeModal
          show
          notice={ackNotice}
          onClose={() => setAckNotice(null)}
          onSuccess={() => { refetchNotices(); }}
        />
      )}

      {payInvoice && (
        <PayInvoiceModal
          show
          invoice={payInvoice}
          onClose={() => setPayInvoice(null)}
          onSuccess={() => { refetchInvoices(); }}
        />
      )}
    </Container>
  );
}
