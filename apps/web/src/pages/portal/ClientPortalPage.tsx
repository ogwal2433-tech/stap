import { useState } from 'react';
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner, Tab, Table, Tabs } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { portalApi } from '../../lib/portal.api';
import { useToast } from '../../context/ToastContext';

const STA_BADGE: Record<string, string> = { PENDING: 'warning', OVERDUE: 'danger', PAID: 'success' };
const COMP_BADGE: Record<string, string> = { OPEN: 'danger', IN_PROGRESS: 'warning', RESOLVED: 'success' };

function is403(err: unknown): boolean {
  return (err as any)?.response?.status === 403;
}

const NOT_LINKED_MSG =
  'Your account is not yet linked to a client record. Please contact STAP Security to activate your portal access.';

function TabSpinner() {
  return (
    <div className="text-center py-5">
      <Spinner animation="border" variant="primary" />
    </div>
  );
}

function TabError({ err }: { err: unknown }) {
  return (
    <Alert variant="warning" className="mt-3">
      {is403(err) ? NOT_LINKED_MSG : 'Failed to load data. Please try again later.'}
    </Alert>
  );
}

export default function ClientPortalPage() {
  const { showToast } = useToast();

  const { data: overview, isLoading: loadOverview, isError: overviewIsError, error: overviewErr } = useQuery({
    queryKey: ['portal-overview'],
    queryFn:  portalApi.getOverview,
  });

  const { data: invoicesRes, isLoading: loadInvoices, isError: invoicesIsError, error: invoicesErr } = useQuery({
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

  const invoices   = invoicesRes?.data ?? [];
  const complaints = complaintsRes?.data ?? [];

  const { data: sites } = useQuery({
    queryKey: ['portal-sites'],
    queryFn:  portalApi.getSites,
  });

  const [compForm, setCompForm] = useState({ category: 'GUARD_CONDUCT', severity: 'MEDIUM', description: '', siteId: '' });
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);

  const submitComplaint = useMutation({
    mutationFn: () => portalApi.submitComplaint({
      category:    compForm.category as any,
      severity:    compForm.severity as any,
      description: compForm.description,
      ...(compForm.siteId ? { siteId: compForm.siteId } : {}),
    }),
    onSuccess: (c) => {
      setSubmitted(c.id);
      setCompError(null);
      refetchComplaints();
      setCompForm({ category: 'GUARD_CONDUCT', severity: 'MEDIUM', description: '', siteId: '' });
    },
    onError: (err: unknown) => {
      if (is403(err)) {
        setCompError(NOT_LINKED_MSG);
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
          {is403(overviewErr) ? NOT_LINKED_MSG : 'Failed to load portal. Please try again later.'}
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
          <Row className="g-3 mb-4">
            {[
              { label: 'Outstanding Invoices',  value: overview?.outstandingInvoices ?? 0, bg: '#fef2f2', icon: '📄' },
              { label: 'Open Complaints',        value: overview?.openComplaints ?? 0,      bg: '#fff7ed', icon: '📋' },
              { label: 'Guards Deployed Today',  value: overview?.deployedToday ?? 0,       bg: '#f0fdf4', icon: '👮' },
            ].map(({ label, value, bg, icon }) => (
              <Col key={label} md={4}>
                <Card className="border-0 shadow-sm h-100" style={{ background: bg }}>
                  <Card.Body className="text-center">
                    <div style={{ fontSize: '2rem' }}>{icon}</div>
                    <div className="fw-bold" style={{ fontSize: '1.8rem' }}>{value}</div>
                    <div className="text-muted small">{label}</div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
          <h6 className="fw-semibold mb-2 small text-uppercase text-muted">Recent Invoices</h6>
          {loadInvoices ? <TabSpinner /> : invoicesIsError ? <TabError err={invoicesErr} /> : (
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
          {loadInvoices ? <TabSpinner /> : invoicesIsError ? <TabError err={invoicesErr} /> : (
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
                      <td>UGX {inv.totalAmount.toLocaleString()}</td>
                      <td>{new Date(inv.dueDate).toLocaleDateString('en-UG')}</td>
                      <td><Badge bg={STA_BADGE[inv.status] ?? 'secondary'}>{inv.status}</Badge></td>
                      <td>
                        {(inv.status === 'PENDING' || inv.status === 'OVERDUE') && (
                          <Button
                            size="sm" variant="success"
                            onClick={() => {
                              showToast('You will be redirected to the payment portal after loading…', 'info');
                              portalApi.payInvoice(inv.id)
                                .then(() => showToast('Payment initiated. Refresh page to check status.', 'success'))
                                .catch(() => showToast('Payment initiation failed', 'danger'));
                            }}
                          >
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
          {loadGuards ? <TabSpinner /> : guardsIsError ? <TabError err={guardsErr} /> : (
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

        {/* TAB 4: Complaints */}
        <Tab eventKey="complaint" title="Complaints">
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
                    disabled={compForm.description.length < 10 || submitComplaint.isPending}
                    onClick={() => submitComplaint.mutate()}
                  >
                    {submitComplaint.isPending ? <Spinner size="sm" animation="border" /> : 'Submit Complaint'}
                  </Button>
                </div>
              )}
            </Col>
            <Col md={6}>
              <h6 className="fw-semibold mb-3">My Complaints</h6>
              {loadComplaints ? <TabSpinner /> : complaintsIsError ? <TabError err={complaintsErr} /> : (
                <div className="d-flex flex-column gap-2">
                  {complaints.map(c => (
                    <Card key={c.id} className="border-0 shadow-sm">
                      <Card.Body className="py-2 px-3 small">
                        <div className="d-flex justify-content-between">
                          <span className="fw-semibold">{c.category.replace(/_/g,' ')}</span>
                          <Badge bg={COMP_BADGE[c.status] ?? 'secondary'}>{c.status.replace(/_/g,' ')}</Badge>
                        </div>
                        <div className="text-muted">{c.description.slice(0, 80)}{c.description.length > 80 ? '…' : ''}</div>
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
      </Tabs>
    </Container>
  );
}
