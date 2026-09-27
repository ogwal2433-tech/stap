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
  useHrApprovePayroll, useFlagPayslip, useUnflagPayslip,
  useCashbook, useCashbookSummary, usePayrollDetail,
  usePayrollGroups, useCreatePayrollGroup, useUpdatePayrollGroup, useDeletePayrollGroup,
} from '../../hooks/useFinance';
import { useGuardList } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InvoiceFormModal from '../../components/finance/InvoiceFormModal';
import RecordPaymentModal from '../../components/finance/RecordPaymentModal';
import FeeIncrementModal from '../../components/finance/FeeIncrementModal';
import VoidInvoiceModal from '../../components/finance/VoidInvoiceModal';
import PermissionGuard from '../../components/PermissionGuard';
import { getApiErrorMessage } from '../../lib/api';
import PayInvoiceModal from '../../components/finance/PayInvoiceModal';
import CashbookEntryModal from '../../components/finance/CashbookEntryModal';
import { useInvoicePayments } from '../../hooks/usePayments';
import { ROLES, HR_ROLES } from '@stap/shared';
import type { InvoiceResponse, PayslipResponse, PayrollGroupResponse } from '@stap/shared';
import { invoicesApi } from '../../lib/finance.api';

const NAVY = '#1B3A6B';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:   'warning',
    PAID:      'success',
    OVERDUE:   'danger',
    CANCELLED: 'secondary',
    // Voided, not deleted: stays on file and owes nothing.
    VOID:      'dark',
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

// ── Invoice Payment History Modal ─────────────────────────────────────────────

function InvoicePaymentHistoryModal({ invoice, onClose }: { invoice: InvoiceResponse; onClose: () => void }) {
  const { data: payments, isLoading } = useInvoicePayments(invoice.id);

  const statusColor: Record<string, string> = {
    PENDING:   'warning',
    SUCCESS:   'success',
    FAILED:    'danger',
    CANCELLED: 'secondary',
  };

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="small fw-bold">
          Mobile Money Payment History — {invoice.invoiceNumber}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : !payments?.length ? (
          <p className="text-muted text-center py-4 small">No mobile money payment attempts for this invoice.</p>
        ) : (
          <Table size="sm" bordered>
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Phone</th>
                <th>Network</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="small">{new Date(p.initiatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="small">{p.phone}</td>
                  <td><Badge bg={p.network === 'MTN' ? 'warning' : 'danger'} text={p.network === 'MTN' ? 'dark' : 'white'}>{p.network}</Badge></td>
                  <td className="small fw-semibold">UGX {p.amountPaid.toLocaleString()}</td>
                  <td><Badge bg={statusColor[p.status] ?? 'secondary'}>{p.status}</Badge></td>
                  <td className="small text-muted" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.extReference}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────

function InvoicesTab() {
  const [showCreate, setShowCreate]       = useState(false);
  const [payInvoice,    setPayInvoice]    = useState<InvoiceResponse | null>(null);
  const [incrementInvoice, setIncrementInvoice] = useState<InvoiceResponse | null>(null);
  const [voidTarget, setVoidTarget] = useState<InvoiceResponse | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);

  const handleOpenPdf = async (inv: InvoiceResponse) => {
    setPdfId(inv.id);
    try {
      await invoicesApi.openInvoicePdf(inv.id, inv.invoiceNumber);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not build the invoice PDF.'), 'danger');
    } finally {
      setPdfId(null);
    }
  };
  const [payMoMo,       setPayMoMo]       = useState<InvoiceResponse | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<InvoiceResponse | null>(null);
  const [sendingId,     setSendingId]     = useState<string | null>(null);
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
  // Both figures read the per-invoice balances rather than the invoice total.
  // Summing totalAmount meant a part payment moved neither tile: the invoice
  // still counted in full towards Outstanding, and contributed nothing to Paid
  // because its status was PARTIALLY_PAID rather than PAID.
  const sumPaid     = totalInvoiced.filter((i) => i.status !== 'CANCELLED')
    .reduce((s, i) => s + (i.paidAmount ?? 0), 0);
  const outstanding = totalInvoiced.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((s, i) => s + (i.outstandingBalance ?? i.totalAmount), 0);
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
                <td>
                  {fmtUGX(inv.totalAmount)}
                  {inv.paidAmount > 0 && inv.outstandingBalance > 0 && (
                    <div style={{ fontSize: '0.72rem', lineHeight: 1.3 }}>
                      <span style={{ color: '#1E8449' }}>paid {fmtUGX(inv.paidAmount)}</span>
                      {' · '}
                      <span style={{ color: '#C0392B', fontWeight: 600 }}>
                        due {fmtUGX(inv.outstandingBalance)}
                      </span>
                    </div>
                  )}
                </td>
                <td style={{ color: isOverdue(inv.dueDate) && inv.status !== 'PAID' ? '#C0392B' : undefined }}>
                  {new Date(inv.dueDate).toLocaleDateString('en-GB')}
                </td>
                <td>
                  {statusBadge(inv.status)}
                  {inv.status === 'VOID' && inv.voidReason && (
                    <div className="text-muted" style={{ fontSize: '0.68rem', maxWidth: 180 }} title={inv.voidReason}>
                      {inv.voidReason}
                    </div>
                  )}
                </td>
                <td>
                  <div className="d-flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={pdfId === inv.id}
                      onClick={() => handleOpenPdf(inv)}
                      title="Open a printable PDF of this invoice"
                    >
                      {pdfId === inv.id
                        ? <><Spinner size="sm" animation="border" className="me-1" />Preparing…</>
                        : '🖨️ Print / PDF'}
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => setHistoryInvoice(inv)} title="View payment history">
                      History
                    </Button>
                    <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
                      <Button
                        size="sm"
                        variant={inv.emailSentAt ? 'outline-secondary' : 'outline-primary'}
                        disabled={!!inv.emailSentAt || sendingId === inv.id || inv.status === 'VOID'}
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
                    {inv.status !== 'PAID' && inv.status !== 'VOID' && (
                      <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
                        <Button size="sm" variant="outline-warning" onClick={() => setIncrementInvoice(inv)} title="Charge for extra guards on this invoice">
                          ➕ Add Fees
                        </Button>
                      </RoleGuard>
                    )}
                    {['PENDING', 'OVERDUE', 'PARTIALLY_PAID'].includes(inv.status) && (
                      <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
                        <Button size="sm" variant="outline-success" onClick={() => setPayInvoice(inv)}>
                          Record Payment
                        </Button>
                        <Button size="sm" variant="outline-primary" onClick={() => setPayMoMo(inv)} title="Pay via MTN/Airtel Mobile Money">
                          💳 Mobile Money
                        </Button>
                      </RoleGuard>
                    )}
                    {/* Only while nothing has been received — the server refuses otherwise. */}
                    {['PENDING', 'OVERDUE'].includes(inv.status) && inv.paidAmount === 0 && (
                      <PermissionGuard permission="invoices.void">
                        <Button size="sm" variant="outline-dark" onClick={() => setVoidTarget(inv)} title="Void — the invoice stays on file marked VOID">
                          Void
                        </Button>
                      </PermissionGuard>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showCreate && <InvoiceFormModal onClose={() => setShowCreate(false)} />}
      <VoidInvoiceModal
        show={!!voidTarget}
        onHide={() => setVoidTarget(null)}
        invoiceNumber={voidTarget?.invoiceNumber ?? ''}
        totalAmount={voidTarget?.totalAmount ?? 0}
        onConfirm={async (reason) => {
          const r = await invoicesApi.voidInvoice(voidTarget!.id, reason);
          showToast(`${r.name} voided.`, 'success');
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />
      {incrementInvoice && (
        <FeeIncrementModal
          invoice={incrementInvoice}
          onClose={() => setIncrementInvoice(null)}
          onSuccess={() => showToast('Charge added to the invoice', 'success')}
        />
      )}
      {payInvoice && (
        <RecordPaymentModal
          invoice={payInvoice}
          onClose={() => {
            setPayInvoice(null);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}
      {payMoMo && (
        <PayInvoiceModal
          invoice={payMoMo}
          onClose={() => setPayMoMo(null)}
        />
      )}
      {historyInvoice && (
        <InvoicePaymentHistoryModal
          invoice={historyInvoice}
          onClose={() => setHistoryInvoice(null)}
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

function payrollStatusColor(status: string): { bg: string; dark?: boolean } {
  switch (status) {
    case 'DRAFT':       return { bg: 'warning', dark: true };
    case 'APPROVED':    return { bg: 'info', dark: true };
    case 'HR_APPROVED': return { bg: 'primary' };
    case 'DISBURSING':  return { bg: 'info', dark: true };
    case 'DISBURSED':   return { bg: 'success' };
    default:             return { bg: 'secondary' };
  }
}

function PayrollTab() {
  const now   = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  const [confirming, setConfirming] = useState(false);
  const [hrApproving, setHrApproving] = useState(false);
  const [hrNotes, setHrNotes] = useState('');
  const [viewPayslip, setViewPayslip] = useState<PayslipResponse | null>(null);
  const [flagTarget, setFlagTarget] = useState<PayslipResponse | null>(null);

  const { data, isLoading }   = usePayrollRuns();
  const runPayroll             = useRunPayroll();
  const approvePayroll         = useApprovePayroll();
  const hrApprovePayroll       = useHrApprovePayroll();
  const disbursePayroll        = useDisbursePayroll();
  const unflagPayslip          = useUnflagPayslip();
  const { showToast }          = useToast();
  const { user }               = useAuth();

  const runs    = data?.data ?? [];
  const thisRun = runs.find((r) => r.month === month && r.year === year);

  const { data: runDetail } = usePayrollDetail(thisRun?.id ?? '');
  const payslips = runDetail?.payslips ?? [];

  const isHR = !!user && HR_ROLES.includes(user.role as any);

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

  const handleHrApprove = async () => {
    if (!thisRun) return;
    try {
      await hrApprovePayroll.mutateAsync({ id: thisRun.id, notes: hrNotes.trim() || undefined });
      showToast('Salary run approved by HR — Finance may now disburse', 'success');
      setHrApproving(false);
      setHrNotes('');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to approve', 'danger');
    }
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const flaggedCount = payslips.filter((p) => p.hrFlagged).length;

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
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  {(() => {
                    const c = payrollStatusColor(thisRun.status);
                    return (
                      <Badge bg={c.bg} text={c.dark ? 'dark' : undefined} className="mb-2">
                        {thisRun.status.replace('_', ' ')}
                      </Badge>
                    );
                  })()}
                  <div className="small">
                    <strong>{thisRun.totalGuards}</strong> guards &nbsp;|&nbsp;
                    Gross: <strong>{fmtUGX(thisRun.totalGross)}</strong> &nbsp;|&nbsp;
                    Deductions: <strong>{fmtUGX(thisRun.totalDeductions)}</strong> &nbsp;|&nbsp;
                    Net: <strong>{fmtUGX(thisRun.totalNet)}</strong>
                  </div>
                  {thisRun.status === 'DISBURSED' && (
                    <div className="small mt-1">
                      <span className="text-success">✅ {thisRun.successCount} paid</span>
                      {thisRun.failedCount > 0 && (
                        <span className="text-danger ms-2">❌ {thisRun.failedCount} failed</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2">
                  {thisRun.status === 'DRAFT' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="success"
                      onClick={() => approvePayroll.mutateAsync(thisRun.id).then(() => showToast('Payroll approved', 'success')).catch(() => showToast('Failed', 'danger'))}>
                      Approve
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && isHR && (
                    <Button size="sm" variant="success" onClick={() => setHrApproving(true)}>
                      ✅ HR Approve
                    </Button>
                  )}
                  {thisRun.status === 'HR_APPROVED' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="primary"
                      onClick={() => disbursePayroll.mutateAsync(thisRun.id).then(() => showToast('Disbursement initiated', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                      💸 Disburse via Mobile Money
                    </Button>
                  )}
                  {thisRun.status === 'DISBURSING' && (
                    <Badge bg="info" text="dark"><Spinner animation="border" size="sm" className="me-1" />Disbursing…</Badge>
                  )}
                </div>
              </div>

              {thisRun.status === 'APPROVED' && isHR && (
                <Alert variant="info" className="mt-3 mb-0 small">
                  <div className="fw-bold mb-1">⚠️ HR Review Required</div>
                  Review each guard's salary below. Flag any that need adjustment before approving.
                  Once approved, Finance will process the payments via mobile money.
                  {flaggedCount > 0 && <div className="mt-1">{flaggedCount} guard(s) currently flagged.</div>}
                </Alert>
              )}
              {thisRun.status === 'HR_APPROVED' && (
                <Alert variant="success" className="mt-3 mb-0 small">
                  <div className="fw-bold mb-1">✅ HR Approved</div>
                  This run has been reviewed and approved by HR
                  {thisRun.hrNotes ? `: "${thisRun.hrNotes}"` : '.'} You may now disburse salaries via mobile money.
                </Alert>
              )}

              {hrApproving && (
                <div className="mt-3 border-top pt-3">
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Notes (optional)</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      size="sm"
                      value={hrNotes}
                      onChange={(e) => setHrNotes(e.target.value)}
                      placeholder="e.g. All salaries verified, no adjustments needed."
                    />
                  </Form.Group>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="success" onClick={handleHrApprove} disabled={hrApprovePayroll.isPending}>
                      {hrApprovePayroll.isPending ? 'Approving…' : 'Confirm HR Approval'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setHrApproving(false)}>Cancel</Button>
                  </div>
                </div>
              )}
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
                    <th>HR Flag</th>
                    {thisRun.status !== 'DRAFT' && thisRun.status !== 'APPROVED' && <th>Payment</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id} style={{ background: p.hrFlagged ? '#fff3cd' : undefined }}>
                      <td>{p.guardName}</td>
                      <td className="text-center">{p.daysWorked}/{p.totalDays}</td>
                      <td className="text-end">{p.grossSalary.toLocaleString()}</td>
                      <td className="text-end text-danger">
                        {p.totalDeductions > 0 ? p.totalDeductions.toLocaleString() : '—'}
                      </td>
                      <td className="text-end fw-semibold">
                        {(p.hrAdjustedAmount ?? p.netSalary).toLocaleString()}
                        {p.hrAdjustedAmount != null && p.hrAdjustedAmount !== p.netSalary && (
                          <div className="text-muted fw-normal" style={{ fontSize: '0.68rem' }}>
                            was {p.netSalary.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td>
                        {p.hrFlagged ? (
                          <div>
                            <Badge bg="warning" text="dark">⚠️ Flagged</Badge>
                            <div style={{ fontSize: '0.68rem', color: '#856404' }}>{p.hrFlagReason}</div>
                          </div>
                        ) : (
                          <Badge bg="success">✓ Clear</Badge>
                        )}
                      </td>
                      {thisRun.status !== 'DRAFT' && thisRun.status !== 'APPROVED' && (
                        <td>
                          <Badge bg={
                            p.disbursementStatus === 'SUCCESS' ? 'success'
                            : p.disbursementStatus === 'FAILED' ? 'danger'
                            : p.disbursementStatus === 'SENT' ? 'info'
                            : 'secondary'
                          } text={p.disbursementStatus === 'SENT' ? 'dark' : undefined}>
                            {p.disbursementStatus}
                          </Badge>
                          {p.disbursementFailureReason && (
                            <div style={{ fontSize: '0.68rem', color: '#6c757d' }}>{p.disbursementFailureReason}</div>
                          )}
                        </td>
                      )}
                      <td className="d-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: '0.7rem' }}
                          onClick={() => setViewPayslip(p)}
                        >
                          View
                        </Button>
                        {thisRun.status === 'APPROVED' && isHR && (
                          p.hrFlagged ? (
                            <Button size="sm" variant="outline-success" style={{ fontSize: '0.7rem' }}
                              onClick={() => unflagPayslip.mutateAsync(p.id)}>
                              Unflag
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline-warning" style={{ fontSize: '0.7rem' }}
                              onClick={() => setFlagTarget(p)}>
                              ⚠️ Flag
                            </Button>
                          )
                        )}
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

      {/* HR flag modal */}
      {flagTarget && (
        <FlagPayslipModal
          payslip={flagTarget}
          onClose={() => setFlagTarget(null)}
        />
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <Table striped responsive className="small mt-3">
          <thead className="table-light">
            <tr><th>Period</th><th>Guards</th><th>Gross</th><th>Net</th><th>Status</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const c = payrollStatusColor(r.status);
              return (
                <tr key={r.id}>
                  <td>{MONTHS[r.month - 1]} {r.year}</td>
                  <td>{r.totalGuards}</td>
                  <td>{fmtUGX(r.totalGross)}</td>
                  <td>{fmtUGX(r.totalNet)}</td>
                  <td>
                    <Badge bg={c.bg} text={c.dark ? 'dark' : undefined}>
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ── Flag Payslip Modal (HR use) ─────────────────────────────────────────────────

function FlagPayslipModal({ payslip, onClose }: { payslip: PayslipResponse; onClose: () => void }) {
  const [flagReason, setFlagReason] = useState('');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const { showToast } = useToast();
  const flagPayslip = useFlagPayslip();

  const handleSubmit = async () => {
    if (flagReason.trim().length < 5) {
      showToast('Flag reason must be at least 5 characters', 'danger');
      return;
    }
    try {
      await flagPayslip.mutateAsync({
        payslipId: payslip.id,
        data: {
          flagReason: flagReason.trim(),
          adjustedAmount: adjustedAmount ? Number(adjustedAmount) : undefined,
        },
      });
      showToast(`${payslip.guardName} flagged`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to flag guard', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Flag Guard Salary</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small text-muted text-uppercase">Guard</Form.Label>
          <div className="fw-medium">{payslip.guardName}</div>
          <div className="text-muted small">Net pay: UGX {payslip.netSalary.toLocaleString()}</div>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Flag Reason <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="e.g. Amount looks incorrect, pending disciplinary review..."
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Adjusted Amount (optional)</Form.Label>
          <Form.Control
            type="number"
            value={adjustedAmount}
            onChange={(e) => setAdjustedAmount(e.target.value)}
            placeholder="Leave blank to exclude guard from this disbursement"
          />
          <Form.Text className="text-muted">
            Leave blank to exclude this guard from the disbursement entirely.
          </Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={flagPayslip.isPending}>Cancel</Button>
        <Button variant="warning" onClick={handleSubmit} disabled={flagPayslip.isPending}>
          {flagPayslip.isPending ? 'Flagging…' : '⚠️ Flag Guard'}
        </Button>
      </Modal.Footer>
    </Modal>
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

// ── Payroll groups tab ─────────────────────────────────────────────────────────────

const GROUP_WRITE_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];
const GROUP_DELETE_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

function PayrollGroupFormModal({
  group,
  onClose,
}: {
  group: PayrollGroupResponse | 'new';
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const createGroup = useCreatePayrollGroup();
  const updateGroup = useUpdatePayrollGroup();
  const isNew = group === 'new';

  const [name, setName] = useState(isNew ? '' : group.name);
  const [description, setDescription] = useState(isNew ? '' : group.description ?? '');
  const [isActive, setIsActive] = useState(isNew ? true : group.isActive);
  const [guardIds, setGuardIds] = useState<Set<string>>(
    new Set(isNew ? [] : (group.members ?? []).map((m) => m.id)),
  );
  const [memberSearch, setMemberSearch] = useState('');

  // One fetch of the active roll; filtering is local so picking members does
  // not requery the server on every keystroke.
  const { data: guardPage, isLoading: guardsLoading } = useGuardList({ page: 1, limit: 500, status: 'ACTIVE' });
  const guards = guardPage?.data ?? [];

  // A guard belongs to only one group, so offer everyone except guards already
  // grouped elsewhere. The groups query is cached from the tab — no extra fetch.
  const { data: allGroups } = usePayrollGroups();
  const takenGuardIds = new Set(
    (allGroups ?? [])
      .filter((grp) => isNew || grp.id !== group.id)
      .flatMap((grp) => (grp.members ?? []).map((m) => m.id)),
  );

  const q = memberSearch.trim().toLowerCase();
  const selectableGuards = guards.filter((g) => !takenGuardIds.has(g.id) || guardIds.has(g.id));
  const visibleGuards = q
    ? selectableGuards.filter((g) => g.fullName.toLowerCase().includes(q) || (g.systemId ?? '').toLowerCase().includes(q))
    : selectableGuards;
  const selectedCount = guardIds.size;

  const toggleGuard = (id: string) => {
    setGuardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      isActive,
      // Always sent: save replaces the membership with exactly what is on screen.
      guardIds: [...guardIds],
    };
    try {
      if (isNew) await createGroup.mutateAsync(payload);
      else await updateGroup.mutateAsync({ id: group.id, data: payload });
      showToast(`Payroll group ${isNew ? 'created' : 'updated'}.`, 'success');
      onClose();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not save the group.'), 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="small fw-bold">
          {isNew ? 'Add Payroll Group' : `Edit — ${group.name}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label className="small fw-semibold">Name</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Night Shift — Industrial Area"
              maxLength={80}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-semibold">Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this group is for"
              maxLength={300}
            />
          </Form.Group>
          <Form.Check
            type="switch"
            id="group-active"
            label={<span className="small">Active</span>}
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />

          <div>
            <div className="d-flex align-items-center justify-content-between mb-1">
              <Form.Label className="small fw-semibold mb-0">Members</Form.Label>
              <Badge bg={selectedCount ? 'primary' : 'secondary'}>{selectedCount} selected</Badge>
            </div>
            <Form.Control
              size="sm"
              placeholder="Search active guards by name or system ID…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="mb-2"
            />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '0.375rem' }}>
              {guardsLoading ? (
                <div className="text-center py-3"><Spinner size="sm" animation="border" /></div>
              ) : visibleGuards.length === 0 ? (
                <div className="text-muted small text-center py-3">No available guards match the search.</div>
              ) : (
                visibleGuards.map((g) => (
                  <div key={g.id} className="d-flex align-items-center gap-2" style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>
                    <Form.Check
                      id={`member-${g.id}`}
                      checked={guardIds.has(g.id)}
                      onChange={() => toggleGuard(g.id)}
                    />
                    <label htmlFor={`member-${g.id}`} className="mb-0 small flex-grow-1" style={{ cursor: 'pointer' }}>
                      <span className="fw-semibold">{g.fullName}</span>
                      <span className="text-muted ms-2">{g.rank}</span>
                    </label>
                    {g.systemId && <span className="text-muted" style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{g.systemId}</span>}
                  </div>
                ))
              )}
            </div>
            <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Each guard can only be in one payroll group, so guards already grouped elsewhere are not listed.
              Only active guards are offered; existing members who have since left stay in the group until you
              remove them here.
            </div>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          style={{ backgroundColor: NAVY, borderColor: NAVY }}
          onClick={handleSave}
          disabled={createGroup.isPending || updateGroup.isPending || name.trim().length < 2}
        >
          {createGroup.isPending || updateGroup.isPending ? 'Saving…' : 'Save'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function PayrollGroupsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: groups, isLoading, isError } = usePayrollGroups();
  const deleteGroup = useDeletePayrollGroup();
  const [editing, setEditing] = useState<PayrollGroupResponse | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManage = !!user && GROUP_WRITE_ROLES.includes(user.role as typeof GROUP_WRITE_ROLES[number]);
  const canDelete = !!user && GROUP_DELETE_ROLES.includes(user.role as typeof GROUP_DELETE_ROLES[number]);

  const handleDelete = async (id: string) => {
    try {
      await deleteGroup.mutateAsync(id);
      showToast('Payroll group deleted.', 'success');
    } catch {
      showToast('Could not delete the group.', 'danger');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="text-muted small">
          Named groupings of guards for payroll organisation — teams, sites or pay batches.
        </div>
        {canManage && (
          <Button size="sm" style={{ backgroundColor: NAVY, borderColor: NAVY }} onClick={() => setEditing('new')}>
            + Add Group
          </Button>
        )}
      </div>

      {isLoading && <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>}
      {isError && <Alert variant="danger" className="small">Could not load payroll groups.</Alert>}
      {!isLoading && (groups?.length ?? 0) === 0 && (
        <Alert variant="info" className="small">
          No payroll groups yet. {canManage ? "Click '+ Add Group' to create one." : 'Ask Finance or the Director to create one.'}
        </Alert>
      )}
      {!isLoading && (groups?.length ?? 0) > 0 && (
        <Table striped hover responsive size="sm" className="align-middle">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th className="text-center">Members</th>
              <th>Status</th>
              <th>Updated</th>
              {(canManage || canDelete) && <th className="text-end">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {groups!.map((g) => (
              <tr key={g.id}>
                <td className="fw-semibold">{g.name}</td>
                <td className="small text-muted">{g.description ?? '—'}</td>
                <td className="text-center">
                  <Badge bg="secondary">{g.memberCount}</Badge>
                </td>
                <td>
                  <Badge bg={g.isActive ? 'success' : 'secondary'}>{g.isActive ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="small text-muted">{new Date(g.updatedAt).toLocaleDateString('en-GB')}</td>
                {(canManage || canDelete) && (
                  <td className="text-end">
                    {canManage && (
                      <Button variant="outline-secondary" size="sm" className="me-1" onClick={() => setEditing(g)}>
                        Edit
                      </Button>
                    )}
                    {canDelete && (confirmDeleteId === g.id ? (
                      <>
                        <Button variant="danger" size="sm" className="me-1" onClick={() => handleDelete(g.id)}>
                          Confirm
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => setConfirmDeleteId(g.id)}
                      >
                        Delete
                      </Button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <PayrollGroupFormModal group={editing} onClose={() => setEditing(null)} />
      )}
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
            <Tab eventKey="groups" title="Payroll Groups">
              <PayrollGroupsTab />
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
