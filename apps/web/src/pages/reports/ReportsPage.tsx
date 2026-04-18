import { useState } from 'react';
import {
  Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../../lib/reports.api';
import { useToast } from '../../context/ToastContext';
import RoleGuard from '../../components/RoleGuard';
import { ROLES } from '@stap/shared';
import type { ScheduledReportInput } from '@stap/shared';

// ── Scheduled report form modal ────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
  { label: 'Daily at 06:00 EAT',        value: '0 6 * * *' },
  { label: 'Weekly Monday 07:00 EAT',   value: '0 7 * * 1' },
  { label: 'Monthly 1st at 07:00 EAT',  value: '0 7 1 * *' },
  { label: 'Custom…',                   value: 'custom' },
];

function ScheduleFormModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ScheduledReportInput> & { scheduleOption: string; customCron: string }>({
    name: '', reportType: 'DAILY_OPS', recipients: [], isActive: true,
    scheduleOption: '0 6 * * *', customCron: '',
  });
  const [emailInput, setEmailInput] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const schedule = form.scheduleOption === 'custom' ? form.customCron! : form.scheduleOption!;
      return reportsApi.createScheduledReport({ ...form, schedule } as ScheduledReportInput);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); showToast('Schedule created', 'success'); onClose(); },
    onError:   () => showToast('Failed to create', 'danger'),
  });

  function addEmail() {
    const e = emailInput.trim();
    if (e && !form.recipients!.includes(e)) {
      setForm(f => ({ ...f, recipients: [...f.recipients!, e] }));
    }
    setEmailInput('');
  }

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton><Modal.Title>Add Scheduled Report</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Report Name</Form.Label>
          <Form.Control value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Ops Summary" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Report Type</Form.Label>
          <Form.Select value={form.reportType} onChange={e => setForm(f => ({ ...f, reportType: e.target.value as any }))}>
            {['DAILY_OPS','WEEKLY_PAYROLL_ESTIMATE','MONTHLY_AR_AGING','MONTHLY_PAYROLL'].map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Schedule</Form.Label>
          <Form.Select value={form.scheduleOption} onChange={e => setForm(f => ({ ...f, scheduleOption: e.target.value }))}>
            {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Form.Select>
          {form.scheduleOption === 'custom' && (
            <Form.Control className="mt-2" placeholder="Cron expression e.g. 0 8 * * 1" value={form.customCron} onChange={e => setForm(f => ({ ...f, customCron: e.target.value }))} />
          )}
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Recipients</Form.Label>
          <div className="d-flex gap-2 mb-2">
            <Form.Control size="sm" type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="email@example.com" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())} />
            <Button size="sm" variant="outline-primary" onClick={addEmail}>Add</Button>
          </div>
          <div className="d-flex flex-wrap gap-1">
            {form.recipients!.map(email => (
              <Badge key={email} bg="secondary" style={{ cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, recipients: f.recipients!.filter(r => r !== email) }))}>
                {email} ✕
              </Badge>
            ))}
          </div>
        </Form.Group>
        <Form.Check type="switch" label="Active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!form.name || form.recipients!.length === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner size="sm" animation="border" /> : 'Create Schedule'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [opsDate, setOpsDate]     = useState(today);
  const [prMonth, setPrMonth]     = useState(new Date().getMonth() + 1);
  const [prYear,  setPrYear]      = useState(new Date().getFullYear());
  const [loading, setLoading]     = useState<string | null>(null);

  const { data: scheduled } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn:  reportsApi.getScheduledReports,
  });

  const deleteSchedule = useMutation({
    mutationFn: reportsApi.deleteScheduledReport,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['scheduled-reports'] }),
    onError:    () => showToast('Failed to delete', 'danger'),
  });

  async function download(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } catch { showToast('Download failed', 'danger'); }
    setLoading(null);
  }

  return (
    <Container className="py-4">
      <h4 className="fw-bold mb-4" style={{ color: '#1B3A6B' }}>Reports</h4>

      {/* On-Demand Reports */}
      <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>On-Demand Reports</h6>
      <Row className="g-3 mb-5">
        {/* Daily Ops */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex flex-column gap-2 p-4">
              <div style={{ fontSize: '2rem' }}>📅</div>
              <Card.Title className="fs-6 fw-semibold">Daily Operations Report</Card.Title>
              <Card.Text className="text-muted small">Guard deployments, attendance, incidents, and supervisor check-ins for any given day.</Card.Text>
              <Form.Control type="date" size="sm" value={opsDate} onChange={e => setOpsDate(e.target.value)} style={{ maxWidth: 180 }} />
              <div className="mt-auto">
                <Button size="sm" variant="outline-primary" disabled={loading === 'ops'} onClick={() => download('ops', () => reportsApi.downloadDailyOps(opsDate))}>
                  {loading === 'ops' ? <Spinner size="sm" animation="border" /> : '⬇ Download Excel'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* AR Aging */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex flex-column gap-2 p-4">
              <div style={{ fontSize: '2rem' }}>📄</div>
              <Card.Title className="fs-6 fw-semibold">AR Aging Report</Card.Title>
              <Card.Text className="text-muted small">Outstanding invoices grouped by overdue period.</Card.Text>
              <div className="mt-auto">
                <Button size="sm" variant="outline-primary" disabled={loading === 'ar'} onClick={() => download('ar', reportsApi.downloadARAgingExcel)}>
                  {loading === 'ar' ? <Spinner size="sm" animation="border" /> : '⬇ Download Excel'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Payroll */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex flex-column gap-2 p-4">
              <div style={{ fontSize: '2rem' }}>💼</div>
              <Card.Title className="fs-6 fw-semibold">Monthly Payroll Report</Card.Title>
              <Card.Text className="text-muted small">Full payroll breakdown with guard-level salary and deductions.</Card.Text>
              <div className="d-flex gap-2">
                <Form.Select size="sm" value={prMonth} onChange={e => setPrMonth(+e.target.value)} style={{ width: 100 }}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('en', { month: 'short' })}</option>)}
                </Form.Select>
                <Form.Control size="sm" type="number" value={prYear} onChange={e => setPrYear(+e.target.value)} style={{ width: 90 }} />
              </div>
              <div className="mt-auto">
                <Button size="sm" variant="outline-primary" disabled={loading === 'payroll'} onClick={() => download('payroll', () => reportsApi.downloadPayrollExcel(prMonth, prYear))}>
                  {loading === 'payroll' ? <Spinner size="sm" animation="border" /> : '⬇ Download Excel'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Inventory */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex flex-column gap-2 p-4">
              <div style={{ fontSize: '2rem' }}>📦</div>
              <Card.Title className="fs-6 fw-semibold">Inventory Ledger</Card.Title>
              <Card.Text className="text-muted small">All inventory transactions with running stock balance.</Card.Text>
              <div className="mt-auto">
                <Button size="sm" variant="outline-primary" disabled={loading === 'inv'} onClick={() => download('inv', reportsApi.downloadInventoryLedger)}>
                  {loading === 'inv' ? <Spinner size="sm" animation="border" /> : '⬇ Download Excel'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Scheduled Reports */}
      <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="text-uppercase text-muted fw-semibold mb-0" style={{ letterSpacing: '0.06em' }}>Scheduled Reports</h6>
          <Button size="sm" variant="primary" onClick={() => setShowSchedule(true)}>+ Add Schedule</Button>
        </div>
        <Table striped hover responsive className="align-middle small border-0 shadow-sm rounded">
          <thead className="table-dark">
            <tr>
              <th>Name</th><th>Type</th><th>Schedule</th><th>Recipients</th>
              <th>Last Run</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(!scheduled || scheduled.length === 0) && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No scheduled reports yet</td></tr>
            )}
            {(scheduled ?? []).map(s => (
              <tr key={s.id}>
                <td className="fw-semibold">{s.name}</td>
                <td>{s.reportType.replace(/_/g,' ')}</td>
                <td><code>{s.schedule}</code></td>
                <td>{s.recipients.slice(0,2).join(', ')}{s.recipients.length > 2 && ` +${s.recipients.length - 2}`}</td>
                <td>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString('en-UG') : '—'}</td>
                <td><Badge bg={s.isActive ? 'success' : 'secondary'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td>
                  <Button size="sm" variant="outline-danger" onClick={() => deleteSchedule.mutate(s.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </RoleGuard>

      {showSchedule && <ScheduleFormModal onClose={() => setShowSchedule(false)} />}
    </Container>
  );
}
