import { useState } from 'react';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Modal, Row, Spinner,
  Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInvoices, useARAgingReport, usePayrollRuns,
  useRunPayroll, useApprovePayroll, useDisbursePayroll, useDeletePayrollRun,
  useHrApprovePayroll, useRejectPayroll, useFlagPayslip, useUnflagPayslip,
  useCashbook, useCashbookSummary, usePayrollDetail,
  useZonePayrollRoster,
} from '../../hooks/useFinance';
import InvoiceFilterPanel, {
  EMPTY_INVOICE_FILTERS, areInvoiceFiltersActive, raisedRangeQuery,
} from '../../components/finance/InvoiceFilterPanel';
import { useToast } from '../../context/ToastContext';
import { useReportTitle } from '../../hooks/useReportTitles';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InvoiceFormModal from '../../components/finance/InvoiceFormModal';
import RecordPaymentModal from '../../components/finance/RecordPaymentModal';
import FeeIncrementModal from '../../components/finance/FeeIncrementModal';
import InvoiceViewModal from '../../components/finance/InvoiceViewModal';
import InvoiceEditModal from '../../components/finance/InvoiceEditModal';
import InvoiceActionsMenu from '../../components/finance/InvoiceActionsMenu';
import VoidInvoiceModal from '../../components/finance/VoidInvoiceModal';
import { getApiErrorMessage } from '../../lib/api';
import PayInvoiceModal from '../../components/finance/PayInvoiceModal';
import CashbookEntryModal from '../../components/finance/CashbookEntryModal';
import { useInvoicePayments } from '../../hooks/usePayments';
// Invoice amounts may carry cents now (a monthly contract rate ÷ 30 rarely lands
// on a whole shilling); payroll figures are whole and print unchanged.
import { ROLES, HR_ROLES, formatUgx as fmtUGX } from '@security360/shared';
import type { InvoiceResponse, PayslipResponse, PayrollRunResponse } from '@security360/shared';
import { invoicesApi, payrollApi } from '../../lib/finance.api';
import { FILE_PREFIX } from '../../lib/branding';

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
                  <td className="small fw-semibold">{fmtUGX(p.amountPaid)}</td>
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
  const [viewInvoice,   setViewInvoice]   = useState<InvoiceResponse | null>(null);
  const [editInvoice,   setEditInvoice]   = useState<InvoiceResponse | null>(null);
  const [sendingId,     setSendingId]     = useState<string | null>(null);

  // ── Filters over the list ───────────────────────────────────────────────────
  // Both bounds are the day the invoice was raised, which the table prints in its
  // own column: a range that cannot be checked against anything on screen reads
  // as a broken filter the first time it comes back empty. The panel, the range
  // it builds and the customer search behind it all live in InvoiceFilterPanel,
  // shared with the aging report so the two screens cannot drift apart.
  const [filters, setFilters] = useState(EMPTY_INVOICE_FILTERS);
  const filtersActive         = areInvoiceFiltersActive(filters);

  const listQuery: Parameters<typeof invoicesApi.list>[0] = {
    // The table has no pager, so the filtered set comes back in one call. The
    // tiles above are computed from these rows, which is another reason the old
    // default of 20 was too few: a busy month made them quietly wrong.
    limit: 500,
    ...raisedRangeQuery(filters),
  };

  const { data, isLoading }               = useInvoices(listQuery);
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
        <span className="fw-semibold">
          Invoices
          {data && (
            <span className="fw-normal small text-muted ms-2">
              {data.pagination.total.toLocaleString()} {filtersActive ? 'matching' : 'in total'}
              {/* Say so when the cap bit, rather than let a short list look like
                  the whole answer. */}
              {data.pagination.total > invoices.length
                && ` · showing the ${invoices.length} most recent`}
            </span>
          )}
        </span>
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

      {/* Filters. The tiles above are untouched by them: those always speak for
          this month, while the range below narrows the list under it. */}
      <InvoiceFilterPanel value={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Raised</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  {filtersActive ? 'No invoice matches these filters' : 'No invoices yet'}
                </td>
              </tr>
            ) : invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="fw-medium">{inv.invoiceNumber}</td>
                <td>{inv.clientName}</td>
                <td className="text-nowrap">{new Date(inv.createdAt).toLocaleDateString('en-GB')}</td>
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
                  <InvoiceActionsMenu
                    invoice={inv}
                    pdfBusy={pdfId === inv.id}
                    sendBusy={sendingId === inv.id}
                    actions={{
                      onView:          () => setViewInvoice(inv),
                      onEdit:          () => setEditInvoice(inv),
                      onPdf:           () => handleOpenPdf(inv),
                      onHistory:       () => setHistoryInvoice(inv),
                      onSend:          () => handleSendEmail(inv),
                      onAddFees:       () => setIncrementInvoice(inv),
                      onRecordPayment: () => setPayInvoice(inv),
                      onMobileMoney:   () => setPayMoMo(inv),
                      onVoid:          () => setVoidTarget(inv),
                    }}
                  />
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
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
        />
      )}
      {editInvoice && (
        <InvoiceEditModal
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
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
    case 'REJECTED':    return { bg: 'danger' };
    default:             return { bg: 'secondary' };
  }
}

// Same gate as the DELETE endpoint: dropping a draft is a write action on the
// same footing as calculating one, but stopping short of the money trail an
// approved run leaves is why only these two roles may do it.
const RUN_DELETE_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

function PayrollTab() {
  const now   = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  const [confirming, setConfirming] = useState(false);
  const [hrApproving, setHrApproving] = useState(false);
  const [hrNotes, setHrNotes] = useState('');
  const [viewPayslip, setViewPayslip] = useState<PayslipResponse | null>(null);
  const [flagTarget, setFlagTarget] = useState<PayslipResponse | null>(null);
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('');
  // Two-step inline confirmation, shared by the run card and the history row.
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);
  // Rejection always needs a reason, so it goes through a modal — run card or
  // history row — instead of an inline confirm.
  const [rejectTarget, setRejectTarget] = useState<PayrollRunResponse | null>(null);

  // Payroll is run per zone: the roster drives the zone dropdown and the
  // sites → employees tick-list inside the confirm card.
  const { data: rosterData } = useZonePayrollRoster(month, year);
  const zones = rosterData?.zones ?? [];
  const [zoneId, setZoneId] = useState('');
  const selectedZoneId = zones.some((z) => z.zoneId === zoneId) ? zoneId : (zones[0]?.zoneId ?? '');
  const selectedZone = zones.find((z) => z.zoneId === selectedZoneId);

  // Guards unticked in the confirm list, keyed by guard id — a removal, not an
  // allow-list, so newly assigned guards arrive pre-checked by default.
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const toggleGuard = (id: string) => setUnpicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const { data, isLoading }   = usePayrollRuns();
  const runPayroll             = useRunPayroll();
  const approvePayroll         = useApprovePayroll();
  const hrApprovePayroll       = useHrApprovePayroll();
  const disbursePayroll        = useDisbursePayroll();
  const deletePayrollRun       = useDeletePayrollRun();
  const unflagPayslip          = useUnflagPayslip();
  const { showToast }          = useToast();
  const { user }               = useAuth();

  const runs    = data?.data ?? [];
  const thisRun = runs.find((r) => r.month === month && r.year === year && (r.zoneId ?? '') === selectedZoneId);

  const { data: runDetail } = usePayrollDetail(thisRun?.id ?? '');
  const payslips = runDetail?.payslips ?? [];

  const isHR = !!user && HR_ROLES.includes(user.role as any);
  const canDeleteRun = !!user && RUN_DELETE_ROLES.includes(user.role as typeof RUN_DELETE_ROLES[number]);

  const handleDeleteRun = async (id: string) => {
    try {
      await deletePayrollRun.mutateAsync(id);
      showToast('Draft payroll deleted — its deductions are pending again.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Could not delete the payroll run.', 'danger');
    } finally {
      setConfirmDeleteRunId(null);
    }
  };

  // The zone's payable roster: assigned guards minus the manual unticks.
  const selectableGuards = selectedZone?.sites.flatMap((s) => s.guards).filter((g) => g.assignedHere) ?? [];
  const selectedGuardIds = selectableGuards.filter((g) => !unpicked.has(g.guardId)).map((g) => g.guardId);

  const handleCalculate = async () => {
    if (!selectedZone) return;
    try {
      await runPayroll.mutateAsync({ month, year, zoneId: selectedZoneId, guardIds: selectedGuardIds });
      showToast(`Payroll calculated for ${selectedZone.zoneName}`, 'success');
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

  // Export the calculated run — the server stamps each file with the header
  // block (zone, month, year, print date, generated by) and names it the same
  // way, so the client mirror must slug the zone identically.
  const handleExport = async (format: 'excel' | 'pdf') => {
    if (!thisRun) return;
    setExporting(format);
    const zoneSlug = (thisRun.zoneName ?? 'Company-wide').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const base = `${FILE_PREFIX}_Payroll_${zoneSlug}_${MONTHS[thisRun.month - 1]}${thisRun.year}`;
    try {
      if (format === 'excel') await payrollApi.downloadRunExcel(thisRun.id, `${base}.xlsx`);
      else                    await payrollApi.downloadRunPdf(thisRun.id, `${base}.pdf`);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, `Failed to export payroll to ${format.toUpperCase()}`), 'danger');
    } finally {
      setExporting('');
    }
  };

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <Form.Select size="sm" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 260 }} value={selectedZoneId} onChange={(e) => setZoneId(e.target.value)}>
          {zones.length === 0 && <option value="">— No active zones —</option>}
          {zones.map((z) => (
            <option key={z.zoneId} value={z.zoneId}>
              {z.zoneName} ({z.assignedCount} guard{z.assignedCount === 1 ? '' : 's'})
            </option>
          ))}
        </Form.Select>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
          {!thisRun && selectedZone && (
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

      {confirming && selectedZone && (
        <Card className="border-warning mb-3">
          <Card.Body className="small">
            <strong>Confirm:</strong> Calculate {MONTHS[month - 1]} {year} payroll for{' '}
            <strong>{selectedZone.zoneName}</strong>. Everyone deployed to this zone is listed under
            their main site — untick anyone who should not be paid in this run.
            {selectedZone.sites.length === 0 ? (
              <div className="text-muted mt-2">No guards were deployed to this zone's sites during the period.</div>
            ) : (
              <div className="mt-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {selectedZone.sites.map((site) => (
                  <div key={site.siteId} className="mb-2">
                    <div className="fw-bold text-uppercase" style={{ fontSize: '0.72rem', color: NAVY }}>
                      {site.siteName}
                    </div>
                    {site.guards.map((g) => (
                      <div key={g.guardId} className="d-flex align-items-center justify-content-between ms-2">
                        {g.assignedHere ? (
                          <Form.Check
                            type="switch"
                            id={`pp-${selectedZoneId}-${g.guardId}`}
                            label={`${g.name}${g.systemId ? ` (${g.systemId})` : ''}`}
                            checked={!unpicked.has(g.guardId)}
                            onChange={() => toggleGuard(g.guardId)}
                          />
                        ) : (
                          <span className="text-muted">
                            {g.name}{' '}
                            <Badge bg="secondary" text="light" className="ms-1" style={{ fontSize: '0.62rem' }}>
                              Paid under {g.assignedZoneName ?? 'another zone'}
                            </Badge>
                          </span>
                        )}
                        <span className="text-muted ms-2" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          {g.deploymentDays}d deployed · {g.attendanceDays}d present
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {(selectedZone.alsoElsewhereCount > 0 || (rosterData?.unZonedGuardCount ?? 0) > 0) && (
              <div className="mt-1 text-muted" style={{ fontSize: '0.75rem' }}>
                {selectedZone.alsoElsewhereCount > 0 &&
                  `${selectedZone.alsoElsewhereCount} guard(s) deployed here are paid under another zone this period. `}
                {(rosterData?.unZonedGuardCount ?? 0) > 0 &&
                  `${rosterData!.unZonedGuardCount} guard(s) are deployed only to sites with no zone — they are not in any zone payroll.`}
              </div>
            )}
            <div className="mt-2 d-flex gap-2">
              <Button size="sm" variant="primary" onClick={handleCalculate}
                disabled={runPayroll.isPending || selectedGuardIds.length === 0}>
                {runPayroll.isPending
                  ? 'Calculating…'
                  : `Proceed — pay ${selectedGuardIds.length} of ${selectableGuards.length}`}
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
                  <div className="small fw-semibold" style={{ color: NAVY }}>
                    {thisRun.zoneName ?? 'Company-wide (legacy)'}
                  </div>
                  {thisRun.status === 'REJECTED' && (
                    <Alert variant="danger" className="mt-2 mb-0 small py-2">
                      🚫 Rejected payroll — {thisRun.rejectReason || 'no reason given'}
                      {thisRun.rejectedAt && (
                        <span className="text-muted"> · {new Date(thisRun.rejectedAt).toLocaleString('en-GB')}</span>
                      )}
                      . Deductions were released back to pending — this zone and period can be calculated again.
                    </Alert>
                  )}
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
                  <Button size="sm" variant="outline-primary" disabled={!!exporting}
                    onClick={() => handleExport('excel')}>
                    {exporting === 'excel'
                      ? <><Spinner animation="border" size="sm" className="me-1" />Exporting…</>
                      : '📊 Excel'}
                  </Button>
                  <Button size="sm" variant="outline-primary" disabled={!!exporting}
                    onClick={() => handleExport('pdf')}>
                    {exporting === 'pdf'
                      ? <><Spinner animation="border" size="sm" className="me-1" />Exporting…</>
                      : '🖨 PDF'}
                  </Button>
                  {thisRun.status === 'DRAFT' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="success"
                      onClick={() => approvePayroll.mutateAsync(thisRun.id).then(() => showToast('Payroll approved', 'success')).catch(() => showToast('Failed', 'danger'))}>
                      Approve
                    </Button>
                  )}
                  {thisRun.status === 'DRAFT' && canDeleteRun && (
                    confirmDeleteRunId === thisRun.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteRun(thisRun.id)} disabled={deletePayrollRun.isPending}>
                          {deletePayrollRun.isPending ? 'Deleting…' : 'Confirm delete?'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteRunId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline-danger" onClick={() => setConfirmDeleteRunId(thisRun.id)}>
                        Delete
                      </Button>
                    )
                  )}
                  {/* Reject windows: a draft by either run role, an APPROVED run
                      only by the Director who stamped it (enforced server-side). */}
                  {thisRun.status === 'DRAFT' && canDeleteRun && (
                    <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(thisRun)}>
                      🚫 Reject
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(thisRun)}>
                      🚫 Reject
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
          {selectedZone ? (
            <>No payroll run for <strong>{selectedZone.zoneName}</strong> in {MONTHS[month - 1]} {year} yet.
              Use "Calculate Payroll" to generate one.</>
          ) : (
            'No active zones — payroll runs are created per zone.'
          )}
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

      {/* Reject-run modal */}
      {rejectTarget && (
        <RejectPayrollModal
          run={rejectTarget}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <Table striped responsive className="small mt-3">
          <thead className="table-light">
            <tr>
              <th>Period</th><th>Zone</th><th>Guards</th><th>Gross</th><th>Net</th><th>Status</th>
              {canDeleteRun && <th className="text-end">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const c = payrollStatusColor(r.status);
              return (
                <tr key={r.id}>
                  <td>{MONTHS[r.month - 1]} {r.year}</td>
                  <td>{r.zoneName ?? 'Company-wide'}</td>
                  <td>{r.totalGuards}</td>
                  <td>{fmtUGX(r.totalGross)}</td>
                  <td>{fmtUGX(r.totalNet)}</td>
                  <td>
                    <Badge bg={c.bg} text={c.dark ? 'dark' : undefined}>
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  {canDeleteRun && (
                    <td className="text-end">
                      {r.status === 'APPROVED' && user?.role === ROLES.DIRECTOR && (
                        <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(r)}>
                          Reject
                        </Button>
                      )}
                      {r.status === 'DRAFT' && (
                        confirmDeleteRunId === r.id ? (
                          <span className="d-inline-flex gap-1">
                            <Button size="sm" variant="danger" onClick={() => handleDeleteRun(r.id)} disabled={deletePayrollRun.isPending}>
                              {deletePayrollRun.isPending ? 'Deleting…' : 'Confirm delete?'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteRunId(null)}>Cancel</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline-danger" onClick={() => setConfirmDeleteRunId(r.id)}>
                            Delete
                          </Button>
                        )
                      )}
                    </td>
                  )}
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

// ── Reject Payroll Modal ───────────────────────────────────────────────────────

// Rejecting releases everything the run consumed — payslips go, applied
// deductions return to PENDING — and the zone/period opens up for a fresh
// calculation. The reason is mandatory so the redo has something to go on.
function RejectPayrollModal({ run, onClose }: { run: PayrollRunResponse; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { showToast } = useToast();
  const rejectPayroll = useRejectPayroll();

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      showToast('Give a reason — at least 5 characters', 'danger');
      return;
    }
    try {
      await rejectPayroll.mutateAsync({ id: run.id, reason: reason.trim() });
      showToast(`Payroll for ${run.zoneName ?? 'this run'} rejected — deductions are pending again`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to reject the payroll run.', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h6">Reject Payroll Run</Modal.Title>
      </Modal.Header>
      <Modal.Body className="small">
        <div className="mb-2">
          <span className="fw-semibold">{run.zoneName ?? 'Company-wide (legacy)'}</span>{' '}
          · {new Date(run.createdAt).toLocaleDateString('en-GB', { month: 'long' })} {run.year}
          {' '}· {run.totalGuards} guard(s)
        </div>
        <Alert variant="warning" className="mb-3 py-2">
          The {run.status} run's payslips are removed and its deductions return to pending.
          The run stays on file marked <strong>REJECTED</strong> with your reason, and this
          zone can be calculated again.
        </Alert>
        <Form.Group>
          <Form.Label className="fw-semibold">Reason <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Deployment days for two guards look wrong — recalculate after fixing."
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={rejectPayroll.isPending}>Cancel</Button>
        <Button variant="danger" onClick={handleSubmit} disabled={rejectPayroll.isPending}>
          {rejectPayroll.isPending ? 'Rejecting…' : '🚫 Reject Payroll'}
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
  const agingTitle = useReportTitle('receivables_aging_report');
  // The same two narrowings the invoice list offers, reaching the report the same
  // way: the days bound the invoice's raised date, the customer is its own. The
  // buckets still age by due date, so a range here answers "what did we bill in
  // this window, and how much of it is still owed" — not "what fell due in it".
  const [filters, setFilters] = useState(EMPTY_INVOICE_FILTERS);
  const filtersActive         = areInvoiceFiltersActive(filters);
  const { data, isLoading }   = useARAgingReport(raisedRangeQuery(filters));

  const buckets = data ? [
    { label: 'Current (0-30 days)', value: data.buckets.current,   color: 'success' },
    { label: '31-60 Days',          value: data.buckets.days31_60, color: 'warning' },
    { label: '61-90 Days',          value: data.buckets.days61_90, color: 'warning' },
    { label: '90+ Days',            value: data.buckets.over90,    color: 'danger' },
  ] : [];

  const unpaid = (data?.invoices ?? []).filter((i) => ['PENDING', 'OVERDUE'].includes(i.status));

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h6 className="fw-semibold mb-0">{agingTitle.title}</h6>
        {data && (
          <span className="small text-muted">
            {unpaid.length.toLocaleString()} outstanding invoice{unpaid.length === 1 ? '' : 's'}
            {filtersActive && ' matching these filters'}
          </span>
        )}
      </div>

      {/* Above the loading branch, so the controls a person has just set do not
          vanish out from under them while the new answer arrives. */}
      <InvoiceFilterPanel value={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : !data ? (
        <div className="text-muted small">No data</div>
      ) : (
        <>
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
              <tr><th>Invoice #</th><th>Client</th><th>Raised</th><th>Amount</th><th>Due Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-3">
                    {filtersActive ? 'No outstanding invoice matches these filters' : 'No outstanding invoices'}
                  </td>
                </tr>
              ) : unpaid.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{inv.clientName}</td>
                  <td className="text-nowrap">{new Date(inv.createdAt).toLocaleDateString('en-GB')}</td>
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
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

import { Form } from 'react-bootstrap';

export default function FinancePage() {
  const navigate = useNavigate();
  const agingTitle = useReportTitle('receivables_aging_report');

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
            <Tab eventKey="aging" title={agingTitle.shortTitle ?? agingTitle.title}>
              <ARAgingTab />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </div>
  );
}
