import { useState } from 'react';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Modal, Row, Spinner,
  Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInvoices, useARAgingReport, usePayrollRuns,
  useRunPayroll, useApprovePayroll, useDisbursePayroll,
  useCashbook, useCashbookSummary, usePayrollDetail,
} from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InvoiceFormModal from '../../components/finance/InvoiceFormModal';
import RecordPaymentModal from '../../components/finance/RecordPaymentModal';
import CashbookEntryModal from '../../components/finance/CashbookEntryModal';
import { ROLES } from '@stap/shared';
import type { InvoiceResponse, PayslipResponse } from '@stap/shared';
import { invoicesApi } from '../../lib/finance.api';

const NAVY = '#1B3A6B';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:   'warning',
    PAID:      'success',
    OVERDUE:   'danger',
    CANCELLED: 'secondary',
  };
  return (
    <Badge bg={map[status] ?? 'secondary'} text={status === 'PENDING' ? 'dark' : undefined}>
      {status}
    </Badge>
  );
}

function fmtUGX(n: number) {
  return `UGX ${n.toLocaleString()}`;
}

function fmtPeriod(start: string, end: string) {
  const s = new Date(start);
  return s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function isOverdue(dueDate: string) {
  return new Date(dueDate) < new Date();
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────

function InvoicesTab() {
  const [showCreate, setShowCreate]       = useState(false);
  const [payInvoice, setPayInvoice]       = useState<InvoiceResponse | null>(null);
  const [sendingId, setSendingId]         = useState<string | null>(null);
  const { data, isLoading }               = useInvoices();
  const { showToast }                     = useToast();
  const queryClient                       = useQueryClient();

  const handleSendEmail = async (inv: InvoiceResponse) => {
    setSendingId(inv.id);
    try {
      await invoicesApi.sendEmail(inv.id);
      showToast(`Invoice ${inv.invoiceNumber} sent to ${inv.clientName}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to send invoice email', 'danger');
    } finally {
      setSendingId(null);
    }
  };

  const invoices = data?.data ?? [];

  const totalInvoiced = invoices.filter((i) => {
    const d = new Date(i.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const sumInvoiced = totalInvoiced.reduce((s, i) => s + i.totalAmount, 0);
  const sumPaid     = totalInvoiced.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalAmount, 0);
  const outstanding = totalInvoiced.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((s, i) => s + i.totalAmount, 0);
  const overdueCount = totalInvoiced.filter((i) => i.status === 'OVERDUE').length;

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <span className="fw-semibold">Invoices</span>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowCreate(true)}>
            + Generate Invoice
          </Button>
        </RoleGuard>
      </div>

      {/* Summary bar */}
      <Row className="g-2 mb-3">
        {[
          { label: 'Invoiced This Month', value: sumInvoiced, color: '#EBF5FB' },
          { label: 'Paid This Month',     value: sumPaid,     color: '#E9F7EF' },
          { label: 'Outstanding',         value: outstanding, color: outstanding > 0 ? '#FEF9E7' : '#F4F6F7' },
          { label: 'Overdue',             value: overdueCount, color: overdueCount > 0 ? '#FDEDEC' : '#F4F6F7', isCount: true },
        ].map(({ label, value, color, isCount }) => (
          <Col xs={6} lg={3} key={label}>
            <Card className="border-0 shadow-sm h-100" style={{ background: color }}>
              <Card.Body className="p-2">
                <div className="small text-muted">{label}</div>
                <div className="fw-bold" style={{ color: NAVY, fontSize: '1.1rem' }}>
                  {isCount ? value : fmtUGX(value)}
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-4">No invoices yet</td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="fw-medium">{inv.invoiceNumber}</td>
                <td>{inv.clientName}</td>
                <td>{fmtPeriod(inv.periodStart, inv.periodEnd)}</td>
                <td>{fmtUGX(inv.totalAmount)}</td>
                <td style={{ color: isOverdue(inv.dueDate) && inv.status !== 'PAID' ? '#C0392B' : undefined }}>
                  {new Date(inv.dueDate).toLocaleDateString('en-GB')}
                </td>
                <td>{statusBadge(inv.status)}</td>
                <td>
                  <div className="d-flex gap-1 flex-wrap">
                    {inv.pdfPath && (
                      <a href={inv.pdfPath} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
                        PDF
                      </a>
                    )}
                    <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
                      <Button
                        size="sm"
                        variant={inv.emailSentAt ? 'outline-secondary' : 'outline-primary'}
                        disabled={!!inv.emailSentAt || sendingId === inv.id}
                        onClick={() => handleSendEmail(inv)}
                        title={inv.emailSentAt ? `Sent to ${inv.emailSentTo} on ${new Date(inv.emailSentAt).toLocaleDateString('en-GB')}` : 'Send invoice by email'}
                      >
                        {sendingId === inv.id ? (
                          <><Spinner size="sm" animation="border" className="me-1" />Sending…</>
                        ) : inv.emailSentAt ? (
                          `✅ Sent ${new Date(inv.emailSentAt).toLocaleDateString('en-GB')}`
                        ) : (
                          '📧 Send'
                        )}
                      </Button>
                    </RoleGuard>
                    {['PENDING', 'OVERDUE'].includes(inv.status) && (
                      <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
                        <Button size="sm" variant="outline-success" onClick={() => setPayInvoice(inv)}>
                          Pay
                        </Button>
                      </RoleGuard>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showCreate && <InvoiceFormModal onClose={() => setShowCreate(false)} />}
      {payInvoice && (
        <RecordPaymentModal
          invoice={payInvoice}
          onClose={() => {
            setPayInvoice(null);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}
    </>
  );
}

// ── Payslip Detail Modal ──────────────────────────────────────────────────────

function PayslipDetailModal({
  payslip,
  month,
  year,
  onClose,
}: {
  payslip: PayslipResponse;
  month:   number;
  year:    number;
  onClose: () => void;
}) {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="small fw-bold">
          Payslip — {payslip.guardName} — {MONTHS[month - 1]} {year}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Earnings */}
        <h6 className="fw-semibold small text-uppercase text-muted mb-2">Earnings</h6>
        <Table size="sm" bordered className="mb-3">
          <thead className="table-light">
            <tr>
              <th>Description</th>
              <th className="text-center">Days</th>
              <th className="text-end">Amount (UGX)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Salary</td>
              <td className="text-center">{payslip.daysWorked}/{payslip.totalDays} days</td>
              <td className="text-end">{payslip.grossSalary.toLocaleString()}</td>
            </tr>
          </tbody>
        </Table>

        {/* Deductions */}
        <h6 className="fw-semibold small text-uppercase text-muted mb-2">Deductions</h6>
        {payslip.deductionsBreakdown.length === 0 ? (
          <Alert variant="light" className="small py-2">No deductions applied in this payroll period.</Alert>
        ) : (
          <Table size="sm" bordered className="mb-3">
            <thead className="table-light">
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th className="text-end">Amount (UGX)</th>
              </tr>
            </thead>
            <tbody>
              {payslip.deductionsBreakdown.map((d, i) => (
                <tr key={d.deductionId ?? i}>
                  <td><Badge bg="secondary" style={{ fontSize: '0.65rem' }}>{d.type.replace(/_/g, ' ')}</Badge></td>
                  <td className="small">{d.description}</td>
                  <td className="text-end">{d.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="table-light">
              <tr>
                <td colSpan={2} className="fw-semibold">Total Deductions</td>
                <td className="text-end fw-semibold text-danger">
                  {payslip.totalDeductions.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </Table>
        )}

        {/* Net Pay */}
        <div
          className="text-center py-3 rounded"
          style={{ background: '#EEF2FA', borderLeft: '4px solid #1B3A6B' }}
        >
          <div className="text-muted small">Net Pay</div>
          <div className="fw-bold fs-4" style={{ color: '#1B3A6B' }}>
            UGX {payslip.netSalary.toLocaleString()}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Payroll Tab ───────────────────────────────────────────────────────────────

function PayrollTab() {
  const now   = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  const [confirming, setConfirming] = useState(false);
  const [viewPayslip, setViewPayslip] = useState<PayslipResponse | null>(null);

  const { data, isLoading }   = usePayrollRuns();
  const runPayroll             = useRunPayroll();
  const approvePayroll         = useApprovePayroll();
  const disbursePayroll        = useDisbursePayroll();
  const { showToast }          = useToast();
  const { user }               = useAuth();

  const runs    = data?.data ?? [];
  const thisRun = runs.find((r) => r.month === month && r.year === year);

  const { data: runDetail } = usePayrollDetail(thisRun?.id ?? '');
  const payslips = runDetail?.payslips ?? [];

  const handleCalculate = async () => {
    try {
      await runPayroll.mutateAsync({ month, year });
      showToast('Payroll calculated', 'success');
      setConfirming(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to calculate payroll', 'danger');
      setConfirming(false);
    }
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <Form.Select size="sm" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
          {!thisRun && (
            <Button
              size="sm"
              style={{ background: NAVY, borderColor: NAVY }}
              onClick={() => setConfirming(true)}
              disabled={runPayroll.isPending}
            >
              Calculate Payroll
            </Button>
          )}
        </RoleGuard>
      </div>

      {confirming && (
        <Card className="border-warning mb-3">
          <Card.Body className="small">
            <strong>Confirm:</strong> Calculate payroll for {MONTHS[month - 1]} {year} for all active guards?
            <div className="mt-2 d-flex gap-2">
              <Button size="sm" variant="primary" onClick={handleCalculate} disabled={runPayroll.isPending}>
                {runPayroll.isPending ? 'Calculating…' : 'Proceed'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </Card.Body>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : thisRun ? (
        <>
          <Card className="mb-3 border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <Badge bg={thisRun.status === 'DRAFT' ? 'warning' : thisRun.status === 'APPROVED' ? 'success' : 'primary'}
                    text={thisRun.status === 'DRAFT' ? 'dark' : undefined}
                    className="mb-2">
                    {thisRun.status}
                  </Badge>
                  <div className="small">
                    <strong>{thisRun.totalGuards}</strong> guards &nbsp;|&nbsp;
                    Gross: <strong>{fmtUGX(thisRun.totalGross)}</strong> &nbsp;|&nbsp;
                    Deductions: <strong>{fmtUGX(thisRun.totalDeductions)}</strong> &nbsp;|&nbsp;
                    Net: <strong>{fmtUGX(thisRun.totalNet)}</strong>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  {thisRun.status === 'DRAFT' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="success"
                      onClick={() => approvePayroll.mutateAsync(thisRun.id).then(() => showToast('Payroll approved', 'success')).catch(() => showToast('Failed', 'danger'))}>
                      Approve
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="primary"
                      onClick={() => disbursePayroll.mutateAsync(thisRun.id).then(() => showToast('Disbursement initiated', 'success')).catch(() => showToast('Failed', 'danger'))}>
                      Disburse
                    </Button>
                  )}
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Per-guard payslip breakdown */}
          {payslips.length > 0 && (
            <div className="mt-3">
              <h6 className="fw-semibold small text-uppercase text-muted mb-2">Payslips</h6>
              <Table size="sm" hover responsive className="align-middle small">
                <thead className="table-light">
                  <tr>
                    <th>Guard</th>
                    <th className="text-center">Days</th>
                    <th className="text-end">Gross (UGX)</th>
                    <th className="text-end">Deductions (UGX)</th>
                    <th className="text-end">Net (UGX)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id}>
                      <td>{p.guardName}</td>
                      <td className="text-center">{p.daysWorked}/{p.totalDays}</td>
                      <td className="text-end">{p.grossSalary.toLocaleString()}</td>
                      <td className="text-end text-danger">
                        {p.totalDeductions > 0 ? p.totalDeductions.toLocaleString() : '—'}
                      </td>
                      <td className="text-end fw-semibold">{p.netSalary.toLocaleString()}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: '0.7rem' }}
                          onClick={() => setViewPayslip(p)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <div className="text-muted small text-center py-4">
          No payroll run for {MONTHS[month - 1]} {year}. Use "Calculate Payroll" to generate one.
        </div>
      )}

      {/* Payslip detail modal */}
      {viewPayslip && (
        <PayslipDetailModal
          payslip={viewPayslip}
          month={month}
          year={year}
          onClose={() => setViewPayslip(null)}
        />
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <Table striped responsive className="small mt-3">
          <thead className="table-light">
            <tr><th>Period</th><th>Guards</th><th>Gross</th><th>Net</th><th>Status</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{MONTHS[r.month - 1]} {r.year}</td>
                <td>{r.totalGuards}</td>
                <td>{fmtUGX(r.totalGross)}</td>
                <td>{fmtUGX(r.totalNet)}</td>
                <td>
                  <Badge bg={r.status === 'DRAFT' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'primary'}
                    text={r.status === 'DRAFT' ? 'dark' : undefined}>
                    {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ── Cashbook Tab ──────────────────────────────────────────────────────────────

function CashbookTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useCashbook({ month, year, limit: 200 });
  const { data: summary }   = useCashbookSummary(month, year);
  const entries = data?.data ?? [];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <Form.Select size="sm" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowAdd(true)}>
            + Add Entry
          </Button>
        </RoleGuard>
      </div>

      {summary && (
        <Row className="g-2 mb-3">
          {[
            { label: 'Total In',  value: summary.totalIn,  color: '#E9F7EF' },
            { label: 'Total Out', value: summary.totalOut, color: '#FDEDEC' },
            { label: 'Net Cash',  value: summary.netCash,  color: '#EBF5FB' },
          ].map(({ label, value, color }) => (
            <Col xs={4} key={label}>
              <Card className="border-0 shadow-sm" style={{ background: color }}>
                <Card.Body className="p-2">
                  <div className="small text-muted">{label}</div>
                  <div className="fw-bold small" style={{ color: NAVY }}>{fmtUGX(value)}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr><th>Date</th><th>Description</th><th>Category</th><th className="text-end">In (UGX)</th><th className="text-end">Out (UGX)</th><th className="text-end">Balance</th></tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted py-4">No entries for this period</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                <td>{e.description}</td>
                <td><Badge bg="secondary" style={{ fontSize: '0.65rem' }}>{e.category}</Badge></td>
                <td className="text-end text-success">{e.type === 'IN' ? e.amount.toLocaleString() : ''}</td>
                <td className="text-end text-danger">{e.type === 'OUT' ? e.amount.toLocaleString() : ''}</td>
                <td className="text-end fw-medium" style={{ color: e.runningBalance >= 0 ? '#1E8449' : '#C0392B' }}>
                  {e.runningBalance.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showAdd && <CashbookEntryModal onClose={() => setShowAdd(false)} />}
    </>
  );
}

// ── AR Aging Tab ──────────────────────────────────────────────────────────────

function ARAgingTab() {
  const { data, isLoading } = useARAgingReport();

  if (isLoading) return <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>;

  const report = data;
  if (!report) return <div className="text-muted small">No data</div>;

  const buckets = [
    { label: 'Current (0-30 days)', value: report.buckets.current,   color: 'success' },
    { label: '31-60 Days',          value: report.buckets.days31_60, color: 'warning' },
    { label: '61-90 Days',          value: report.buckets.days61_90, color: 'warning' },
    { label: '90+ Days',            value: report.buckets.over90,    color: 'danger' },
  ];

  const unpaid = report.invoices.filter((i) => ['PENDING', 'OVERDUE'].includes(i.status));

  return (
    <>
      <h6 className="fw-semibold mb-3">Accounts Receivable Aging Report</h6>
      <Row className="g-2 mb-4">
        {buckets.map(({ label, value, color }) => (
          <Col xs={6} lg={3} key={label}>
            <Card className="border-0 shadow-sm text-center">
              <Card.Body className="py-2 px-1">
                <div className="small text-muted mb-1" style={{ fontSize: '0.7rem' }}>{label}</div>
                <Badge bg={color} text={color === 'warning' ? 'dark' : undefined} style={{ fontSize: '0.9rem', padding: '6px 10px' }}>
                  {fmtUGX(value)}
                </Badge>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Table striped responsive className="small">
        <thead className="table-light">
          <tr><th>Invoice #</th><th>Client</th><th>Amount</th><th>Due Date</th><th>Status</th></tr>
        </thead>
        <tbody>
          {unpaid.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-muted py-3">No outstanding invoices</td></tr>
          ) : unpaid.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.invoiceNumber}</td>
              <td>{inv.clientName}</td>
              <td>{fmtUGX(inv.totalAmount)}</td>
              <td style={{ color: isOverdue(inv.dueDate) ? '#C0392B' : undefined }}>
                {new Date(inv.dueDate).toLocaleDateString('en-GB')}
              </td>
              <td>{statusBadge(inv.status)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

import { Form } from 'react-bootstrap';

export default function FinancePage() {
  const navigate = useNavigate();

  return (
    <div className="py-4 px-3">
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Finance</Breadcrumb.Item>
      </Breadcrumb>

      <h4 className="fw-bold mb-4" style={{ color: NAVY }}>Finance</h4>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <Tabs defaultActiveKey="invoices" className="mb-3">
            <Tab eventKey="invoices" title="Invoices">
              <InvoicesTab />
            </Tab>
            <Tab eventKey="payroll" title="Payroll">
              <PayrollTab />
            </Tab>
            <Tab eventKey="cashbook" title="Cashbook">
              <CashbookTab />
            </Tab>
            <Tab eventKey="aging" title="AR Aging">
              <ARAgingTab />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </div>
  );
}
