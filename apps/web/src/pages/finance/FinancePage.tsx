import { useEffect, useState } from 'react';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, Form, Modal, Row, Spinner,
  Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useInvoices, useARAgingReport, usePayrollRuns,
  useDeductions, useCancelDeduction,
  useRunPayroll, useApprovePayroll, useDisbursePayroll, useDeletePayrollRun,
  useHrApprovePayroll, useMdApprovePayroll, useRejectPayroll, useFlagPayslip, useUnflagPayslip,
  useCashbook, useCashbookSummary, usePayrollDetail,
  useZonePayrollRoster, useCompanyPayrollRoster, usePayrollSummary,
  useStaffPayrollRoster, useStaffPayrollRuns, useRunStaffPayroll,
  useStaffDeductions, useCreateStaffDeduction, useCancelStaffDeduction,
  usePayrollShares, useSharePayroll,
} from '../../hooks/useFinance';
import { useStaffList } from '../../hooks/useStaff';
import InvoiceFilterPanel, {
  EMPTY_INVOICE_FILTERS, areInvoiceFiltersActive, raisedRangeQuery,
} from '../../components/finance/InvoiceFilterPanel';
import { useToast } from '../../context/ToastContext';
import { useReportTitle } from '../../hooks/useReportTitles';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import PermissionGuard from '../../components/PermissionGuard';
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
import type { InvoiceResponse, PaymentResponse, PayslipResponse, PayrollRunResponse, RunPayrollInput } from '@security360/shared';
import { invoicesApi, paymentApprovalsApi, payrollApi, payrollSharesApi } from '../../lib/finance.api';
import { FILE_PREFIX } from '../../lib/branding';

const NAVY = '#1B3A6B';

/** Billing month as YYYY-MM: the filter, the run and the summary share it. */
const monthStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** The last twelve billing months, newest first, for the month pickers. */
const MONTH_OPTIONS: { value: string; label: string }[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return {
    value: monthStr(d),
    label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
  };
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:        'warning',
    ISSUED:         'primary',
    PARTIALLY_PAID: 'info',
    PAID:           'success',
    OVERDUE:        'danger',
    CANCELLED:      'secondary',
    // Voided, not deleted: stays on file and owes nothing.
    VOID:           'dark',
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

function InvoicesTab({ onGoAging }: { onGoAging: () => void }) {
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
  const [monthFilter, setMonthFilter] = useState<string>(monthStr(new Date()));
  const [statusFilter, setStatusFilter] = useState<string>('');
  // Column sort over the list: the Client header toggles name A→Z / newest.
  const [sortBy, setSortBy] = useState<'newest' | 'clientName'>('newest');
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [runningRun, setRunningRun] = useState(false);
  const [issuingBatch, setIssuingBatch] = useState(false);
  const [editInvoice,   setEditInvoice]   = useState<InvoiceResponse | null>(null);
  const [sendingId,     setSendingId]     = useState<string | null>(null);
  const [cloningId,     setCloningId]     = useState<string | null>(null);

  // ── Filters over the list ───────────────────────────────────────────────────
  // Both bounds are the day the invoice was raised, which the table prints in its
  // own column: a range that cannot be checked against anything on screen reads
  // as a broken filter the first time it comes back empty. The panel, the range
  // it builds and the customer search behind it all live in InvoiceFilterPanel,
  // shared with the aging report so the two screens cannot drift apart.
  const [filters, setFilters] = useState(EMPTY_INVOICE_FILTERS);
  const filtersActive         = areInvoiceFiltersActive(filters);

  const listQuery: Parameters<typeof invoicesApi.list>[0] = {
    // The table has no pager, so the filtered set comes back in one call.
    limit: 500,
    month:     monthFilter || undefined,
    status:    statusFilter || undefined,
    sortBy,
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

  const handleClone = async (inv: InvoiceResponse) => {
    if (cloningId) return;
    setCloningId(inv.id);
    try {
      const copy = await invoicesApi.clone(inv.id);
      showToast('Cloned '+inv.invoiceNumber+' as '+copy.invoiceNumber+' - adjust dates then save.', 'success');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setEditInvoice(copy);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Could not clone invoice.', 'danger');
    } finally {
      setCloningId(null);
    }
  };

  const invoices = data?.data ?? [];

  // The tiles are read from the server now: billing periods, not the raised
  // date of one capped page, so the month on screen is the month totalled.
  const { data: summary } = useQuery({
    queryKey: ['invoice-summary', monthFilter],
    queryFn:  () => invoicesApi.getSummary(monthFilter || undefined),
  });

  const handleIssue = async (inv: InvoiceResponse) => {
    setIssuingId(inv.id);
    try {
      await invoicesApi.issue(inv.id);
      showToast(`${inv.invoiceNumber} issued.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not issue the invoice.'), 'danger');
    } finally {
      setIssuingId(null);
    }
  };

  const handleRun = async () => {
    const month = monthFilter || monthStr(new Date());
    setRunningRun(true);
    try {
      const r = await invoicesApi.runMonthly(month);
      showToast(`Run ${month}: ${r.created} raised, ${r.skipped} already on file.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not run the month-end invoices.'), 'danger');
    } finally {
      setRunningRun(false);
    }
  };

  const handleIssueBatch = async () => {
    const month = monthFilter || monthStr(new Date());
    setIssuingBatch(true);
    try {
      const r = await invoicesApi.issueBatch({ month });
      showToast(
        r.issued > 0 ? `${r.issued} invoice${r.issued === 1 ? '' : 's'} issued.` : 'Nothing left to issue.',
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not issue the run.'), 'danger');
    } finally {
      setIssuingBatch(false);
    }
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
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
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Form.Select
            size="sm" style={{ width: 190 }} aria-label="Billing month"
            value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="">All months</option>
            {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Form.Select>
          <PermissionGuard permission="invoices.run">
            <Button
              size="sm" variant="outline-primary" disabled={runningRun}
              onClick={handleRun}
              title="Raise one invoice per active contract for the month, held for MD issue"
            >
              {runningRun ? 'Running...' : 'Run month-end invoices'}
            </Button>
          </PermissionGuard>
          <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
            <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowCreate(true)}>
              + Generate Invoice
            </Button>
          </RoleGuard>
        </div>
      </div>

      {(summary?.awaitingIssue ?? 0) > 0 && monthFilter && (
        <Alert variant="info" className="d-flex align-items-center justify-content-between py-2 small mb-3 flex-wrap gap-2">
          <span>
            <i className="bi bi-envelope-paper me-2" />
            {summary!.awaitingIssue} invoice{summary!.awaitingIssue === 1 ? '' : 's'} for
            {MONTH_OPTIONS.find((m) => m.value === monthFilter)?.label ?? monthFilter} await your issue.
          </span>
          <PermissionGuard permission="invoices.issue">
            <Button size="sm" style={{ background: '#1E8449', borderColor: '#1E8449' }} disabled={issuingBatch} onClick={handleIssueBatch}>
              {issuingBatch ? 'Issuing...' : 'Issue all'}
            </Button>
          </PermissionGuard>
        </Alert>
      )}

      {statusFilter && (
        <div className="mb-2">
          <Badge bg="secondary">Status: {statusFilter.replace('_', ' ')}</Badge>{' '}
          <Button size="sm" variant="link" className="text-decoration-none p-0 ms-1" onClick={() => setStatusFilter('')}>
            clear
          </Button>
        </div>
      )}

      {/* Summary bar - server-computed for the picked month, and each tile
          narrows the page to the figures it shows. */}
      <Row className="g-2 mb-3">
        {([
          { label: 'Invoiced This Month', value: summary?.invoiced ?? 0, color: '#EBF5FB',
            onClick: () => { setStatusFilter(''); setMonthFilter(monthFilter || monthStr(new Date())); } },
          { label: 'Paid This Month', value: summary?.paid ?? 0, color: '#E9F7EF',
            onClick: () => setStatusFilter('PAID') },
          { label: 'Outstanding', value: summary?.outstanding ?? 0,
            color: (summary?.outstanding ?? 0) > 0 ? '#FEF9E7' : '#F4F6F7',
            onClick: onGoAging },
          { label: 'Overdue', value: summary?.overdueCount ?? 0,
            color: (summary?.overdueCount ?? 0) > 0 ? '#FDEDEC' : '#F4F6F7', isCount: true,
            onClick: () => setStatusFilter('OVERDUE') },
        ] as Array<{ label: string; value: number; color: string; isCount?: boolean; onClick: () => void }>)
          .map(({ label, value, color, isCount, onClick }) => (
          <Col xs={6} lg={3} key={label}>
            <Card
              className="border-0 shadow-sm h-100"
              style={{ background: color, cursor: 'pointer' }}
              onClick={onClick}
              title={`Show ${label.toLowerCase()} on this page`}
            >
              <Card.Body className="p-2">
                <div className="small text-muted d-flex justify-content-between">
                  {label}<i className="bi bi-arrow-right-short" />
                </div>
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
              <th
                role="button"
                onClick={() => setSortBy(sortBy === 'clientName' ? 'newest' : 'clientName')}
                title={sortBy === 'clientName' ? 'Sorted A→Z — click for newest first' : 'Click to sort by client name'}
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Client {sortBy === 'clientName' ? '▲' : '↕'}
              </th>
              <th>Raised</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>Raised by</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
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
                <td className="text-muted small text-nowrap">{inv.createdByName ?? '-'}</td>
                <td>
                  <InvoiceActionsMenu
                    invoice={inv}
                    pdfBusy={pdfId === inv.id}
                    sendBusy={sendingId === inv.id}
                    issueBusy={issuingId === inv.id}
                    actions={{
                      onView:          () => setViewInvoice(inv),
                      onIssue:         () => handleIssue(inv),
                      onEdit:          () => setEditInvoice(inv),
                      onClone:         () => handleClone(inv),
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
        paidAmount={voidTarget?.paidAmount ?? 0}
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
          Payslip — {(payslip.guardName || payslip.staffName)} — {MONTHS[month - 1]} {year}
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
    case 'MD_APPROVED':  return { bg: 'dark' };
    case 'DISBURSING':  return { bg: 'info', dark: true };
    case 'DISBURSED':   return { bg: 'success' };
    case 'REJECTED':    return { bg: 'danger' };
    default:             return { bg: 'secondary' };
  }
}

// Same gate as the DELETE endpoint: dropping a draft is a write action on the
// same footing as calculating one, but stopping short of the money trail an
// approved run leaves is why only these two roles may do it.
const RUN_DELETE_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER];

// Zone-totals panel: total pay for each zone for the selected period plus the
// countrywide total across them. Clicking a zone row expands every guard paid
// in it, their amounts footing to the row figure. Reads its own summary query
// so it stays in step with month/year without threading props through the run
// card. Rejected runs never appear — the server only counts live runs.
function ZoneTotalsCard({ month, year }: { month: number; year: number }) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const { data, isLoading } = usePayrollSummary(month, year);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const { data: openDetail, isLoading: openLoading } = usePayrollDetail(openRunId ?? '');

  const zones  = data?.zones ?? [];
  const totals = data?.totals;
  const payslips = (openDetail?.payslips ?? [])
    .slice()
    .sort((a, b) => b.netSalary - a.netSalary);
  const openRow = zones.find((z) => z.runId === openRunId);

  return (
    <Card className="mb-3 border-0 shadow-sm">
      <Card.Body className="py-3">
        <div className="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-2">
          <div className="small fw-bold text-uppercase" style={{ fontSize: '0.72rem', color: NAVY }}>
            Guard payroll — zone totals
          </div>
          <div className="small text-muted">{MONTHS[month - 1]} {year}</div>
        </div>
        {isLoading ? (
          <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
        ) : zones.length === 0 ? (
          <div className="small text-muted">
            No live guard payroll run for {MONTHS[month - 1]} {year} yet — calculated zone totals appear here.
          </div>
        ) : (
          <Table size="sm" className="mb-0 align-middle">
            <thead>
              <tr className="small text-uppercase" style={{ fontSize: '0.68rem', color: NAVY }}>
                <th>Zone</th>
                <th>Status</th>
                <th className="text-end">Guards</th>
                <th className="text-end">Gross</th>
                <th className="text-end">Deductions</th>
                <th className="text-end">Net pay</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => {
                const c = payrollStatusColor(z.status);
                const open = z.runId === openRunId;
                return (
                  <tr
                    key={z.runId}
                    style={{ cursor: 'pointer', background: open ? '#EEF3FA' : undefined }}
                    onClick={() => setOpenRunId(open ? null : z.runId)}
                    title="Click to see every guard paid in this zone"
                  >
                    <td className="small fw-semibold">{z.zoneName ?? 'Company-wide (all zones)'}</td>
                    <td><Badge bg={c.bg} text={c.dark ? 'dark' : undefined}>{z.status.replace('_', ' ')}</Badge></td>
                    <td className="small text-end">{z.guards}</td>
                    <td className="small text-end">{fmtUGX(z.gross)}</td>
                    <td className="small text-end">{fmtUGX(z.deductions)}</td>
                    <td className="small text-end fw-semibold">{fmtUGX(z.net)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F4F7FB' }}>
                <td className="small fw-bold" colSpan={2}>Total — all zones (countrywide)</td>
                <td className="small fw-bold text-end">{totals?.guards ?? 0}</td>
                <td className="small fw-bold text-end">{fmtUGX(totals?.gross ?? 0)}</td>
                <td className="small fw-bold text-end">{fmtUGX(totals?.deductions ?? 0)}</td>
                <td className="small fw-bold text-end" style={{ color: NAVY }}>{fmtUGX(totals?.net ?? 0)}</td>
              </tr>
            </tfoot>
          </Table>
        )}
        <div className="small text-muted mt-2">
          Click a zone to see every guard paid in it. Rejected runs are excluded — they paid nobody.
        </div>
      </Card.Body>

      {openRunId && (
        <Card.Body className="border-top py-3">
          <div className="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-2">
            <div className="small fw-semibold" style={{ color: NAVY }}>
              {openRow?.zoneName ?? 'Company-wide (all zones)'} — paid guards
            </div>
            <Button size="sm" variant="link" className="p-0 small" onClick={() => setOpenRunId(null)}>
              Close
            </Button>
          </div>
          {openLoading ? (
            <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
          ) : payslips.length === 0 ? (
            <div className="small text-muted">No payslips on this run.</div>
          ) : (
            <>
              <Table size="sm" className="mb-0 align-middle">
                <thead>
                  <tr className="small text-uppercase" style={{ fontSize: '0.68rem', color: NAVY }}>
                    <th>Guard</th>
                    <th className="text-end">Days</th>
                    <th className="text-end">Gross</th>
                    <th className="text-end">Deductions</th>
                    <th className="text-end">Net pay</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id}>
                      <td className="small">{p.guardName}</td>
                      <td className="small text-end text-muted">{p.daysWorked}/{p.totalDays}</td>
                      <td className="small text-end">{fmtUGX(p.grossSalary)}</td>
                      <td className="small text-end">{fmtUGX(p.totalDeductions)}</td>
                      <td className="small text-end fw-semibold">{fmtUGX(p.netSalary)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F4F7FB' }}>
                    <td className="small fw-bold" colSpan={2}>
                      {payslips.length} paid guard{payslips.length === 1 ? '' : 's'}
                    </td>
                    <td className="small fw-bold text-end">{fmtUGX(payslips.reduce((s, p) => s + p.grossSalary, 0))}</td>
                    <td className="small fw-bold text-end">{fmtUGX(payslips.reduce((s, p) => s + p.totalDeductions, 0))}</td>
                    <td className="small fw-bold text-end" style={{ color: NAVY }}>
                      {fmtUGX(payslips.reduce((s, p) => s + p.netSalary, 0))}
                    </td>
                  </tr>
                </tfoot>
              </Table>
              <div className="small text-muted mt-2">
                Sorted by net pay, highest first. These amounts foot to the zone figure above.
              </div>
            </>
          )}
        </Card.Body>
      )}
    </Card>
  );
}

function PayrollTab() {
  const now   = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  // Payroll scope: by zone, or one company-wide run that ignores zones. A period
  // is covered by one or the other, never both — the server enforces the either/or.
  const [scope, setScope]         = useState<'ZONE' | 'COMPANY'>('ZONE');
  const [confirming, setConfirming] = useState(false);
  const [hrApproving, setHrApproving] = useState(false);
  const [hrNotes, setHrNotes] = useState('');
  const [viewPayslip, setViewPayslip] = useState<PayslipResponse | null>(null);
  const [flagTarget, setFlagTarget] = useState<PayslipResponse | null>(null);
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf' | 'full'>('');
  // Two-step inline confirmation, shared by the run card and the history row.
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);
  // Rejection always needs a reason, so it goes through a modal — run card or
  // history row — instead of an inline confirm.
  const [rejectTarget, setRejectTarget] = useState<PayrollRunResponse | null>(null);

  // By zone: the roster drives the zone dropdown and the sites → employees
  // tick-list inside the confirm card. Company-wide: one flat roster of every
  // deployed guard, fetched only while that scope is active.
  const { data: rosterData } = useZonePayrollRoster(month, year);
  const zones = rosterData?.zones ?? [];
  const [zoneId, setZoneId] = useState('');
  const [shareTarget, setShareTarget] = useState<PayrollRunResponse | null>(null);
  const selectedZoneId = zones.some((z) => z.zoneId === zoneId) ? zoneId : (zones[0]?.zoneId ?? '');
  const selectedZone = zones.find((z) => z.zoneId === selectedZoneId);

  const { data: companyRosterData } = useCompanyPayrollRoster(month, year, scope === 'COMPANY');
  const companySites = companyRosterData?.sites ?? [];

  // Whether a run can be opened for the active scope. Company-wide is always
  // offered (one roster covers every zone), matching the zone path which shows
  // the button as soon as a zone exists — the confirm card handles the empty
  // case, and the server refuses a run with no guards.
  const canOpenRun = scope === 'COMPANY' || !!selectedZone;

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
  const mdApprovePayroll         = useMdApprovePayroll();
  const disbursePayroll        = useDisbursePayroll();
  const deletePayrollRun       = useDeletePayrollRun();
  const unflagPayslip          = useUnflagPayslip();
  const { showToast }          = useToast();
  const { user }               = useAuth();

  const runs    = data?.data ?? [];
  const thisRun = runs.find((r) =>
    r.month === month && r.year === year &&
    (scope === 'COMPANY' ? !r.zoneId : (r.zoneId ?? '') === selectedZoneId),
  );

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

  // A REJECTED run is not a live status, so the same calculate endpoint opens
  // a fresh DRAFT for the zone/period — straight back into the approval flow
  // while the rejected row stays on file as the trail. Jump the selectors to
  // the rejected run's period/zone, pre-tick everyone, and open the confirm
  // card; the roster is recomputed for that period before proceeding.
  const startRecalculate = (run: PayrollRunResponse) => {
    setMonth(run.month);
    setYear(run.year);
    if (run.zoneId) { setScope('ZONE'); setZoneId(run.zoneId); } else setScope('COMPANY');
    setUnpicked(new Set());
    setConfirming(true);
  };

  // Jump between the two scopes; drop any half-built confirm so the tick-list
  // and the "already run" card re-derive for the other scope.
  const switchScope = (next: 'ZONE' | 'COMPANY') => {
    if (next === scope) return;
    setScope(next);
    setConfirming(false);
    setUnpicked(new Set());
  };

  // The payable roster for the active scope, minus the manual unticks. In zone
  // mode a guard shows under every site they touched but is only selectable at
  // their majority zone; company mode offers each deployed guard exactly once.
  const selectableGuards = scope === 'COMPANY'
    ? companySites.flatMap((s) => s.guards)
    : (selectedZone?.sites.flatMap((s) => s.guards).filter((g) => g.assignedHere) ?? []);
  const selectedGuardIds = selectableGuards.filter((g) => !unpicked.has(g.guardId)).map((g) => g.guardId);

  const handleCalculate = async () => {
    if (!canOpenRun) return;
    const isRecalc = thisRun?.status === 'REJECTED';
    const payload: RunPayrollInput = scope === 'COMPANY'
      ? { month, year, scope: 'COMPANY', guardIds: selectedGuardIds }
      : { month, year, scope: 'ZONE', zoneId: selectedZoneId, guardIds: selectedGuardIds };
    const label = scope === 'COMPANY' ? 'all zones (company-wide)' : (selectedZone?.zoneName ?? '');
    try {
      await runPayroll.mutateAsync(payload);
      showToast(
        isRecalc
          ? `Payroll recalculated for ${label} — new draft is back for approval`
          : `Payroll calculated for ${label}`,
        'success',
      );
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

  // The whole month - every zone, company-wide and staff - in one workbook.
  const handleFullExport = async () => {
    setExporting('full');
    try {
      await payrollApi.downloadFullPayroll(month, year);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, 'Failed to download the full payroll'), 'danger');
    } finally {
      setExporting('');
    }
  };

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <div className="btn-group btn-group-sm" role="group" aria-label="Payroll scope">
          <Button size="sm" variant={scope === 'ZONE' ? 'primary' : 'outline-primary'}
            onClick={() => switchScope('ZONE')}>By zone</Button>
          <Button size="sm" variant={scope === 'COMPANY' ? 'primary' : 'outline-primary'}
            onClick={() => switchScope('COMPANY')}>Company-wide</Button>
        </div>
        <Form.Select size="sm" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <Button size="sm" variant="outline-primary" disabled={!!exporting} onClick={handleFullExport}
          title="Every run this month - all zones, company-wide and staff - in one file">
          {exporting === 'full'
            ? <><Spinner animation="border" size="sm" className="me-1" />Exporting...</>
            : <><i className="bi bi-file-earmark-spreadsheet me-1" />Full payroll</>}
        </Button>
        {scope === 'ZONE' && (
          <Form.Select size="sm" style={{ width: 260 }} value={selectedZoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.length === 0 && <option value="">— No active zones —</option>}
            {zones.map((z) => (
              <option key={z.zoneId} value={z.zoneId}>
                {z.zoneName} ({z.assignedCount} guard{z.assignedCount === 1 ? '' : 's'})
              </option>
            ))}
          </Form.Select>
        )}
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER]}>
          {canOpenRun && (!thisRun || thisRun.status === 'REJECTED') && (
            <Button
              size="sm"
              style={{ background: NAVY, borderColor: NAVY }}
              onClick={() => setConfirming(true)}
              disabled={runPayroll.isPending}
            >
              {thisRun?.status === 'REJECTED' ? 'Recalculate Payroll' : 'Calculate Payroll'}
            </Button>
          )}
        </RoleGuard>
      </div>

      <ZoneTotalsCard month={month} year={year} />

      {confirming && canOpenRun && (
        <Card className={`mb-3 border-${thisRun?.status === 'REJECTED' ? 'danger' : 'warning'}`}>
          <Card.Body className="small">
            <strong>Confirm:</strong>{' '}
            {thisRun?.status === 'REJECTED' ? 'Recalculate' : 'Calculate'} {MONTHS[month - 1]} {year} payroll for{' '}
            <strong>{scope === 'COMPANY' ? 'the whole company (all zones)' : selectedZone?.zoneName}</strong>.{' '}
            {scope === 'COMPANY'
              ? 'Every guard deployed anywhere this period is listed under their main site — zone is ignored. Untick anyone who should not be paid.'
              : 'Everyone deployed to this zone is listed under their main site — untick anyone who should not be paid in this run.'}
            {scope === 'COMPANY' && (
              <Alert variant="info" className="mt-2 mb-2 py-2">
                A company-wide run pays <strong>every zone at once</strong>, so it is only available while this
                period has no zone runs. Guards paid here cannot be run again by zone for the same period.
              </Alert>
            )}
            {thisRun?.status === 'REJECTED' && (
              <Alert variant="secondary" className="mt-2 mb-2 py-2">
                This creates a fresh <strong>DRAFT</strong> that re-enters the approval flow. The rejected
                run stays on file as the trail — nothing was paid from it.
              </Alert>
            )}
            {scope === 'COMPANY' ? (
              companySites.length === 0 ? (
                <div className="text-muted mt-2">No guards were deployed anywhere during the period.</div>
              ) : (
                <div className="mt-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {companySites.map((site) => (
                    <div key={site.siteName} className="mb-2">
                      <div className="fw-bold text-uppercase" style={{ fontSize: '0.72rem', color: NAVY }}>
                        {site.siteName}
                      </div>
                      {site.guards.map((g) => (
                        <div key={g.guardId} className="d-flex align-items-center justify-content-between ms-2">
                          <Form.Check
                            type="switch"
                            id={`ppc-${g.guardId}`}
                            label={`${g.name}${g.systemId ? ` (${g.systemId})` : ''}`}
                            checked={!unpicked.has(g.guardId)}
                            onChange={() => toggleGuard(g.guardId)}
                          />
                          <span className="text-muted ms-2" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                            {g.deploymentDays}d deployed · {g.attendanceDays}d present · {g.primaryZoneName ?? 'no zone'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            ) : (selectedZone?.sites.length ?? 0) === 0 ? (
              <div className="text-muted mt-2">No guards were deployed to this zone's sites during the period.</div>
            ) : (
              <>
                <div className="mt-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {selectedZone!.sites.map((site) => (
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
                {(selectedZone!.alsoElsewhereCount > 0 || (rosterData?.unZonedGuardCount ?? 0) > 0) && (
                  <div className="mt-1 text-muted" style={{ fontSize: '0.75rem' }}>
                    {selectedZone!.alsoElsewhereCount > 0 &&
                      `${selectedZone!.alsoElsewhereCount} guard(s) deployed here are paid under another zone this period. `}
                    {(rosterData?.unZonedGuardCount ?? 0) > 0 &&
                      `${rosterData!.unZonedGuardCount} guard(s) are deployed only to sites with no zone — they are not in any zone payroll.`}
                  </div>
                )}
              </>
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
                    {thisRun.zoneName ?? 'Company-wide (all zones)'}
                  </div>
                  {thisRun.status === 'REJECTED' && (
                    <Alert variant="danger" className="mt-2 mb-0 small py-2">
                      🚫 Rejected payroll — {thisRun.rejectReason || 'no reason given'}
                      {thisRun.rejectedAt && (
                        <span className="text-muted"> · {new Date(thisRun.rejectedAt).toLocaleString('en-GB')}</span>
                      )}
                      . Deductions were released back to pending — use <strong>Recalculate Payroll</strong> above to
                      build a fresh draft and restart the approval flow.
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
                  <Button size="sm" variant="outline-primary" onClick={() => setShareTarget(thisRun)}>
                    <i className="bi bi-share me-1" />Share
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
                  {/* Reject windows: a draft or an APPROVED run by either payroll
                      run role (Director / Assistant Manager) — enforced server-side. */}
                  {thisRun.status === 'DRAFT' && canDeleteRun && (
                    <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(thisRun)}>
                      🚫 Reject
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && canDeleteRun && (
                    <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(thisRun)}>
                      🚫 Reject
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && isHR && (
                    <Button size="sm" variant="success" onClick={() => setHrApproving(true)}>
                      ✅ HR Approve
                    </Button>
                  )}
                                    {thisRun.status === 'HR_APPROVED' && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                    <Button size="sm" variant="dark" onClick={() => mdApprovePayroll.mutateAsync(thisRun.id).then(() => showToast('MD final approval recorded', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                      <i className="bi bi-award me-1" />MD Approve
                    </Button>
                  )}
                  {thisRun.status === 'MD_APPROVED' && user?.role === ROLES.DIRECTOR && (
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
                  This run has been reviewed and approved by HR and now needs MD final approval before anything can be disbursed.
                  {thisRun.hrNotes ? `: "${thisRun.hrNotes}"` : '.'} You may now disburse salaries via mobile money.
                </Alert>
              )}

              {thisRun.status === 'MD_APPROVED' && (
                <Alert variant="dark" className="mt-3 mb-0 small">
                  <div className="fw-bold mb-1"><i className="bi bi-award me-1" />MD Approved - ready to disburse</div>
                  Final approval is recorded. Finance may now disburse via mobile money.
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
                    <th>Phone</th>
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
                      <td>{p.guardPhone ?? '-'}</td>
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
          {scope === 'COMPANY' ? (
            <>No company-wide payroll run for {MONTHS[month - 1]} {year} yet.
              {' '}Use "Calculate Payroll" to run every zone at once{companySites.length === 0 ? ' — but no guards were deployed this period' : ''}.</>
          ) : selectedZone ? (
            <>No payroll run for <strong>{selectedZone.zoneName}</strong> in {MONTHS[month - 1]} {year} yet.
              Use "Calculate Payroll" to generate one.</>
          ) : (
            'No active zones — payroll runs are created per zone, or company-wide from the toggle above.'
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

      {shareTarget && (
        <SharePayrollModal run={shareTarget} onClose={() => setShareTarget(null)} />
      )}
      <SharedSchedulesList runType="GUARD" />

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
                      {/* A rejected run can be re-opened as a fresh draft —
                          the same roles that may reject may calculate. A zone
                          run only if its zone still exists; a company-wide run
                          (no zone) recalculates straight back into company scope. */}
                      {r.status === 'REJECTED' && (!r.zoneId || zones.some((z) => z.zoneId === r.zoneId)) && (
                        <Button size="sm" variant="outline-primary" onClick={() => startRecalculate(r)}>
                          Recalculate
                        </Button>
                      )}
                      {r.status === 'APPROVED' && canDeleteRun && (
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
      showToast(`${(payslip.guardName || payslip.staffName)} flagged`, 'success');
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
          <div className="fw-medium">{(payslip.guardName || payslip.staffName)}</div>
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
          <span className="fw-semibold">{run.zoneName ?? 'Company-wide (all zones)'}</span>{' '}
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

// -- Staff Payroll Tab --------------------------------------------------------

function StaffPayrollTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [confirming, setConfirming] = useState(false);
  const [hrApproving, setHrApproving] = useState(false);
  const [hrNotes, setHrNotes] = useState('');
  const [viewPayslip, setViewPayslip] = useState<PayslipResponse | null>(null);
  const [flagTarget, setFlagTarget] = useState<PayslipResponse | null>(null);
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf' | 'full'>('');
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PayrollRunResponse | null>(null);
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [deducteeId, setDeducteeId] = useState('');
  const [shareTarget, setShareTarget] = useState<PayrollRunResponse | null>(null);
  const [dedType, setDedType] = useState('NSSF');
  const [dedAmount, setDedAmount] = useState('');
  const [dedDesc, setDedDesc] = useState('');
  const [dedDate, setDedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: roster } = useStaffPayrollRoster(month, year);
  const members = roster?.members ?? [];
  const { data: runsData, isLoading } = useStaffPayrollRuns();
  const runStaffPayroll = useRunStaffPayroll();
  const approvePayroll = useApprovePayroll();
  const hrApprovePayroll = useHrApprovePayroll();
  const mdApprovePayroll         = useMdApprovePayroll();
  const disbursePayroll = useDisbursePayroll();
  const deletePayrollRun = useDeletePayrollRun();
  const unflagPayslip = useUnflagPayslip();
  const createStaffDeduction = useCreateStaffDeduction();
  const cancelStaffDeduction = useCancelStaffDeduction();
  const { data: staffDeductions } = useStaffDeductions();
  const { showToast } = useToast();
  const { user } = useAuth();

  const runs = runsData?.data ?? [];
  const thisRun = runs.find((r) => r.month === month && r.year === year);
  const { data: runDetail } = usePayrollDetail(thisRun?.id ?? '');
  const payslips = runDetail?.payslips ?? [];

  const isHR = !!user && HR_ROLES.includes(user.role as any);
  const canDeleteRun = !!user && RUN_DELETE_ROLES.includes(user.role as typeof RUN_DELETE_ROLES[number]);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const toggleMember = (id: string) => setUnpicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const payable = members.filter((m) => m.salaryRate != null);
  const selectedIds = payable.filter((m) => !unpicked.has(m.userId)).map((m) => m.userId);
  const blocked = members.filter((m) => m.salaryRate == null);
  const flaggedCount = payslips.filter((p) => p.hrFlagged).length;

  const handleCalculate = async () => {
    try {
      await runStaffPayroll.mutateAsync({ month, year, userIds: selectedIds });
      showToast(`Staff payroll calculated for ${MONTHS[month - 1]} ${year}`, 'success');
      setConfirming(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to calculate staff payroll', 'danger');
      setConfirming(false);
    }
  };

  const handleHrApprove = async () => {
    if (!thisRun) return;
    try {
      await hrApprovePayroll.mutateAsync({ id: thisRun.id, notes: hrNotes.trim() || undefined });
      showToast('Staff run approved by HR - Finance may now disburse', 'success');
      setHrApproving(false);
      setHrNotes('');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to approve', 'danger');
    }
  };

  const handleDeleteRun = async (id: string) => {
    try {
      await deletePayrollRun.mutateAsync(id);
      showToast('Draft staff payroll deleted - its deductions are pending again.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Could not delete the staff payroll run.', 'danger');
    } finally {
      setConfirmDeleteRunId(null);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    if (!thisRun) return;
    setExporting(format);
    const base = `${FILE_PREFIX}_Staff_Payroll_${MONTHS[thisRun.month - 1]}${thisRun.year}`;
    try {
      if (format === 'excel') await payrollApi.downloadRunExcel(thisRun.id, `${base}.xlsx`);
      else await payrollApi.downloadRunPdf(thisRun.id, `${base}.pdf`);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, `Failed to export staff payroll to ${format.toUpperCase()}`), 'danger');
    } finally {
      setExporting('');
    }
  };

  // The whole month - every run, including the guard zones, in one workbook.
  const handleFullExport = async () => {
    setExporting('full');
    try {
      await payrollApi.downloadFullPayroll(month, year);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, 'Failed to download the full payroll'), 'danger');
    } finally {
      setExporting('');
    }
  };

  const handleAddDeduction = async () => {
    const amount = parseInt(dedAmount.replace(/[^0-9]/g, ''), 10);
    if (!deducteeId) { showToast('Pick the staff member first.', 'danger'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Enter a valid amount.', 'danger'); return; }
    if (dedDesc.trim().length < 5) { showToast('Describe the deduction (at least 5 characters).', 'danger'); return; }
    try {
      await createStaffDeduction.mutateAsync({
        userId: deducteeId,
        type: dedType.trim() || 'OTHER',
        amount,
        description: dedDesc.trim(),
        effectiveDate: new Date(dedDate).toISOString(),
      });
      showToast('Staff deduction recorded.', 'success');
      setShowDeductionForm(false);
      setDeducteeId(''); setDedType('NSSF'); setDedAmount(''); setDedDesc('');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to record deduction.', 'danger');
    }
  };

  const payeeName = (p: PayslipResponse) => p.staffName || p.guardName;
  const payeePhone = (p: PayslipResponse) => p.staffPhone ?? p.guardPhone;

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <span className="badge text-bg-primary">
          <i className="bi bi-people me-1" />Staff payroll
        </span>
        <span className="text-muted small">Fixed monthly salaries. No zones, no attendance count.</span>
        <Form.Select size="sm" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <Button size="sm" variant="outline-primary" disabled={!!exporting} onClick={handleFullExport}
          title="Every run this month - all zones, company-wide and staff - in one file">
          {exporting === 'full'
            ? <><Spinner animation="border" size="sm" className="me-1" />Exporting...</>
            : <><i className="bi bi-file-earmark-spreadsheet me-1" />Full payroll</>}
        </Button>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER]}>
          {(!thisRun || thisRun.status === 'REJECTED') && (
            <Button
              size="sm"
              style={{ background: NAVY, borderColor: NAVY }}
              onClick={() => setConfirming(true)}
              disabled={runStaffPayroll.isPending}
            >
              <i className="bi bi-calculator me-1" />
              {thisRun?.status === 'REJECTED' ? 'Recalculate Staff Payroll' : 'Calculate Staff Payroll'}
            </Button>
          )}
        </RoleGuard>
      </div>

      {confirming && (
        <Card className={`mb-3 border-${thisRun?.status === 'REJECTED' ? 'danger' : 'warning'}`}>
          <Card.Body className="small">
            <strong>Confirm:</strong> calculate {MONTHS[month - 1]} {year} staff payroll for{' '}
            <strong>{selectedIds.length} staff</strong>. Everyone with a set salary is listed - untick anyone who
            should not be paid in this run.
            {blocked.length > 0 && (
              <Alert variant="secondary" className="mt-2 mb-2 py-2">
                <i className="bi bi-exclamation-triangle me-1" />
                {blocked.length} staff have no salary set ({blocked.map((m) => m.name).join(', ')}) and are
                excluded. Set salaries on their staff profiles to include them.
              </Alert>
            )}
            {members.length === 0 ? (
              <div className="text-muted mt-2">No active staff accounts.</div>
            ) : (
              <div className="mt-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {members.map((m) => (
                  <div key={m.userId} className="d-flex align-items-center justify-content-between ms-2">
                    <Form.Check
                      type="switch"
                      id={`staff-pc-${m.userId}`}
                      label={`${m.name}${m.systemId ? ` (${m.systemId})` : ''}`}
                      checked={m.salaryRate != null && !unpicked.has(m.userId)}
                      disabled={m.salaryRate == null}
                      onChange={() => toggleMember(m.userId)}
                    />
                    <span className="text-muted ms-2" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {m.salaryRate != null ? `${m.salaryRate.toLocaleString()} UGX` : 'no salary'}
                      {m.hasPhone ? '' : ' - no payout number'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="d-flex gap-2 mt-3">
              <Button size="sm" variant="warning" onClick={handleCalculate} disabled={runStaffPayroll.isPending || selectedIds.length === 0}>
                {runStaffPayroll.isPending ? 'Calculating...' : `Confirm - pay ${selectedIds.length} staff`}
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
                  <div className="small fw-semibold" style={{ color: NAVY }}>Staff payroll</div>
                  <div className="small">
                    <strong>{thisRun.totalStaff}</strong> staff &nbsp;|&nbsp;
                    Gross: <strong>{fmtUGX(thisRun.totalGross)}</strong> &nbsp;|&nbsp;
                    Deductions: <strong>{fmtUGX(thisRun.totalDeductions)}</strong> &nbsp;|&nbsp;
                    Net: <strong>{fmtUGX(thisRun.totalNet)}</strong>
                  </div>
                  {thisRun.status === 'DISBURSED' && (
                    <div className="small mt-1">
                      <span className="text-success"><i className="bi bi-check-circle me-1" />{thisRun.successCount} paid</span>
                      {thisRun.failedCount > 0 && (
                        <span className="text-danger ms-2"><i className="bi bi-x-circle me-1" />{thisRun.failedCount} failed</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline-primary" disabled={!!exporting} onClick={() => handleExport('excel')}>
                    {exporting === 'excel'
                      ? <><Spinner animation="border" size="sm" className="me-1" />Exporting...</>
                      : <><i className="bi bi-file-earmark-excel me-1" />Excel</>}
                  </Button>
                  <Button size="sm" variant="outline-primary" disabled={!!exporting} onClick={() => handleExport('pdf')}>
                    {exporting === 'pdf'
                      ? <><Spinner animation="border" size="sm" className="me-1" />Exporting...</>
                      : <><i className="bi bi-file-earmark-pdf me-1" />PDF</>}
                  </Button>
                  <Button size="sm" variant="outline-primary" onClick={() => setShareTarget(thisRun)}>
                    <i className="bi bi-share me-1" />Share
                  </Button>
                  {thisRun.status === 'DRAFT' && (user?.role === ROLES.DIRECTOR || user?.role === ROLES.ASSISTANT_MANAGER) && (
                    <Button size="sm" variant="success"
                      onClick={() => approvePayroll.mutateAsync(thisRun.id).then(() => showToast('Staff payroll approved', 'success')).catch(() => showToast('Failed', 'danger'))}>
                      <i className="bi bi-check-lg me-1" />Approve
                    </Button>
                  )}
                  {thisRun.status === 'DRAFT' && canDeleteRun && (
                    confirmDeleteRunId === thisRun.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteRun(thisRun.id)} disabled={deletePayrollRun.isPending}>
                          {deletePayrollRun.isPending ? 'Deleting...' : 'Confirm delete?'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteRunId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline-danger" onClick={() => setConfirmDeleteRunId(thisRun.id)}>
                        <i className="bi bi-trash me-1" />Delete
                      </Button>
                    )
                  )}
                  {thisRun.status === 'APPROVED' && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                    <Button size="sm" variant="dark" onClick={() => mdApprovePayroll.mutateAsync(thisRun.id).then(() => showToast('MD final approval recorded', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                      <i className="bi bi-award me-1" />MD Approve
                    </Button>
                  )}
                  {(thisRun.status === 'DRAFT' || thisRun.status === 'APPROVED') && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                    <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(thisRun)}>
                      <i className="bi bi-arrow-counterclockwise me-1" />Reject
                    </Button>
                  )}
                  {thisRun.status === 'APPROVED' && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                    <div className="small text-muted">Awaiting final approval (approve or reject above).</div>
                  )}
                                    {thisRun.status === 'HR_APPROVED' && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                    <Button size="sm" variant="dark" onClick={() => mdApprovePayroll.mutateAsync(thisRun.id).then(() => showToast('MD final approval recorded', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                      <i className="bi bi-award me-1" />MD Approve
                    </Button>
                  )}
                  {thisRun.status === 'MD_APPROVED' && user?.role === ROLES.DIRECTOR && (
                    <Button size="sm" variant="primary"
                      onClick={() => disbursePayroll.mutateAsync(thisRun.id).then(() => showToast('Disbursement initiated', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                      <i className="bi bi-send me-1" />Disburse via Mobile Money
                    </Button>
                  )}
                </div>
              </div>

              {thisRun.status === 'APPROVED' && isHR && (
                <Alert variant="info" className="mt-3 mb-0 small">
                  <div className="fw-bold mb-1"><i className="bi bi-info-circle me-1" />Approved - awaiting final approval</div>
                  Harold has approved this run. Micheal gives the final approval (or sends it back) - there is no HR step on staff payroll.
                  {flaggedCount > 0 && <div className="mt-1">{flaggedCount} staff payslip(s) currently flagged.</div>}
                </Alert>
              )}

              {thisRun.status === 'MD_APPROVED' && (
                <Alert variant="dark" className="mt-3 mb-0 small">
                  <div className="fw-bold mb-1"><i className="bi bi-award me-1" />MD Approved - ready to disburse</div>
                  Final approval is recorded. Finance may now disburse via mobile money.
                </Alert>
              )}

              {hrApproving && (
                <div className="mt-3 border-top pt-3">
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Notes (optional)</Form.Label>
                    <Form.Control as="textarea" rows={2} size="sm" value={hrNotes}
                      onChange={(e) => setHrNotes(e.target.value)}
                      placeholder="e.g. All salaries verified, no adjustments needed." />
                  </Form.Group>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="success" onClick={handleHrApprove} disabled={hrApprovePayroll.isPending}>
                      {hrApprovePayroll.isPending ? 'Approving...' : 'Confirm HR Approval'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setHrApproving(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {payslips.length > 0 && (
            <div className="mt-3">
              <h6 className="fw-semibold small text-uppercase text-muted mb-2">Payslips</h6>
              <Table size="sm" hover responsive className="align-middle small">
                <thead className="table-light">
                  <tr>
                    <th>Staff</th>
                    <th className="text-center">Days</th>
                    <th className="text-end">Gross (UGX)</th>
                    <th className="text-end">Deductions (UGX)</th>
                    <th className="text-end">Net (UGX)</th>
                    <th>Phone</th>
                    <th>HR Flag</th>
                    {thisRun.status !== 'DRAFT' && thisRun.status !== 'APPROVED' && <th>Payment</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id} style={{ background: p.hrFlagged ? '#fff3cd' : undefined }}>
                      <td>{payeeName(p)}</td>
                      <td className="text-center">{p.daysWorked}/{p.totalDays}</td>
                      <td className="text-end">{p.grossSalary.toLocaleString()}</td>
                      <td className="text-end text-danger">
                        {p.totalDeductions > 0 ? p.totalDeductions.toLocaleString() : '-'}
                      </td>
                      <td className="text-end fw-semibold">
                        {(p.hrAdjustedAmount ?? p.netSalary).toLocaleString()}
                        {p.hrAdjustedAmount != null && p.hrAdjustedAmount !== p.netSalary && (
                          <div className="text-muted fw-normal" style={{ fontSize: '0.68rem' }}>
                            was {p.netSalary.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td>{payeePhone(p) ?? '-'}</td>
                      <td>
                        {p.hrFlagged ? (
                          <Badge bg="warning" text="dark"><i className="bi bi-flag me-1" />Flagged</Badge>
                        ) : (
                          <Badge bg="success"><i className="bi bi-check me-1" />Clear</Badge>
                        )}
                      </td>
                      {thisRun.status !== 'DRAFT' && thisRun.status !== 'APPROVED' && (
                        <td>
                          <Badge bg={
                            p.disbursementStatus === 'SUCCESS' ? 'success'
                            : p.disbursementStatus === 'FAILED' ? 'danger'
                            : p.disbursementStatus === 'SENT' ? 'info'
                            : 'secondary'
                          }>
                            {p.disbursementStatus}
                          </Badge>
                        </td>
                      )}
                      <td className="d-flex gap-1">
                        <Button size="sm" variant="outline-secondary" style={{ fontSize: '0.7rem' }}
                          onClick={() => setViewPayslip(p)}>
                          <i className="bi bi-eye me-1" />View
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
                              <i className="bi bi-flag me-1" />Flag
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
          No staff payroll run for {MONTHS[month - 1]} {year} yet. Use "Calculate Staff Payroll" to generate one.
        </div>
      )}

      <Card className="mt-4">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-semibold small text-uppercase text-muted mb-0">
              <i className="bi bi-dash-circle me-1" />Staff deductions (NSSF, PAYE, advances)
            </h6>
            <Button size="sm" variant="outline-primary" onClick={() => setShowDeductionForm((v) => !v)}>
              <i className="bi bi-plus-lg me-1" />Record deduction
            </Button>
          </div>
          {showDeductionForm && (
            <Row className="g-2 mb-3">
              <Col md={3}>
                <Form.Select size="sm" value={deducteeId} onChange={(e) => setDeducteeId(e.target.value)}>
                  <option value="">Pick staff...</option>
                  {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select size="sm" value={dedType} onChange={(e) => setDedType(e.target.value)}>
                  {['NSSF', 'PAYE', 'ADVANCE', 'UNIFORM', 'DAMAGE_LOSS', 'OTHER'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Control size="sm" type="number" min="0" placeholder="Amount UGX" value={dedAmount}
                  onChange={(e) => setDedAmount(e.target.value)} />
              </Col>
              <Col md={3}>
                <Form.Control size="sm" placeholder="Description (min 5 chars)" value={dedDesc}
                  onChange={(e) => setDedDesc(e.target.value)} />
              </Col>
              <Col md={2}>
                <Form.Control size="sm" type="date" value={dedDate} onChange={(e) => setDedDate(e.target.value)} />
              </Col>
              <Col md={12}>
                <Button size="sm" variant="primary" onClick={handleAddDeduction} disabled={createStaffDeduction.isPending}>
                  {createStaffDeduction.isPending ? 'Saving...' : 'Save deduction'}
                </Button>
              </Col>
            </Row>
          )}
          <Table size="sm" hover responsive className="align-middle small mb-0">
            <thead className="table-light">
              <tr><th>Staff</th><th>Type</th><th className="text-end">Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {(staffDeductions ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.staffName}</td>
                  <td>{d.type}</td>
                  <td className="text-end">{d.amount.toLocaleString()}</td>
                  <td><Badge bg={d.status === 'PENDING' ? 'warning' : d.status === 'APPLIED' ? 'success' : 'secondary'}>{d.status}</Badge></td>
                  <td className="text-end">
                    {d.status === 'PENDING' && (
                      <Button size="sm" variant="outline-secondary"
                        onClick={() => cancelStaffDeduction.mutateAsync(d.id).catch(() => showToast('Failed to cancel.', 'danger'))}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(staffDeductions ?? []).length === 0 && (
                <tr><td colSpan={5} className="text-muted text-center">No staff deductions recorded.</td></tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {shareTarget && (
        <SharePayrollModal run={shareTarget} onClose={() => setShareTarget(null)} />
      )}
      <SharedSchedulesList runType="STAFF" />

      {runs.length > 0 && (
        <Table striped responsive className="small mt-3">
          <thead className="table-light">
            <tr>
              <th>Period</th><th>Staff</th><th>Gross</th><th>Net</th><th>Status</th>
              {canDeleteRun && <th className="text-end">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const c = payrollStatusColor(r.status);
              return (
                <tr key={r.id}>
                  <td>{MONTHS[r.month - 1]} {r.year}</td>
                  <td>{r.totalStaff}</td>
                  <td>{fmtUGX(r.totalGross)}</td>
                  <td>{fmtUGX(r.totalNet)}</td>
                  <td>
                    <Badge bg={c.bg} text={c.dark ? 'dark' : undefined}>
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  {canDeleteRun && (
                    <td className="text-end">
                      {r.status === 'DRAFT' && (
                        confirmDeleteRunId === r.id ? (
                          <span className="d-inline-flex gap-1">
                            <Button size="sm" variant="danger" onClick={() => handleDeleteRun(r.id)} disabled={deletePayrollRun.isPending}>
                              {deletePayrollRun.isPending ? 'Deleting...' : 'Confirm delete?'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteRunId(null)}>Cancel</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline-danger" onClick={() => setConfirmDeleteRunId(r.id)}>
                            <i className="bi bi-trash me-1" />Delete
                          </Button>
                        )
                      )}
                      {r.status === 'APPROVED' && (user?.role === ROLES.MD || user?.role === ROLES.DIRECTOR) && (
                        <span className="d-inline-flex gap-1 ms-1">
                          <Button size="sm" variant="dark" onClick={() => mdApprovePayroll.mutateAsync(r.id).then(() => showToast('MD final approval recorded', 'success')).catch((err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'))}>
                            <i className="bi bi-award me-1" />MD Approve
                          </Button>
                          <Button size="sm" variant="outline-danger" onClick={() => setRejectTarget(r)}>
                            <i className="bi bi-arrow-counterclockwise me-1" />Reject
                          </Button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {viewPayslip && (
        <PayslipDetailModal payslip={viewPayslip} month={month} year={year} onClose={() => setViewPayslip(null)} />
      )}
      {flagTarget && (
        <FlagPayslipModal payslip={flagTarget} onClose={() => setFlagTarget(null)} />
      )}
      {rejectTarget && (
        <RejectPayrollModal run={rejectTarget} onClose={() => setRejectTarget(null)} />
      )}
    </>
  );
}

// -- Payroll inbox: share modal + shared list ---------------------------------

function SharePayrollModal({ run, onClose }: { run: PayrollRunResponse | null; onClose: () => void }) {
  const [formats, setFormats] = useState<Set<string>>(new Set(['EXCEL', 'PDF']));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { data: staffData } = useStaffList({ limit: 100 });
  const sharePayroll = useSharePayroll();
  const { showToast } = useToast();

  // Reset the form each time another run is shared.
  useEffect(() => {
    setFormats(new Set(['EXCEL', 'PDF']));
    setPicked(new Set());
    setSearch('');
    setNote('');
    setFormError(null);
  }, [run?.id]);

  if (!run) return null;
  const staff = (staffData?.data ?? []).filter(
    (s) => s.isActive !== false && (s.name.toLowerCase().includes(search.toLowerCase()) || search.trim() === ''),
  );
  const toggle = (set: Set<string>, id: string, apply: (n: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    apply(next);
  };

  const handleShare = async () => {
    setFormError(null);
    if (formats.size === 0) { setFormError('Pick at least one format.'); return; }
    if (picked.size === 0) { setFormError('Pick at least one staff member.'); return; }
    try {
      await sharePayroll.mutateAsync({
        runId: run.id,
        data: {
          formats: [...formats] as ('EXCEL' | 'PDF')[],
          userIds: [...picked],
          note: note.trim() || undefined,
        },
      });
      showToast(`Schedule shared with ${picked.size} staff member(s).`, 'success');
      onClose();
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? 'Failed to share the schedule.');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-share me-2" />Share payroll schedule in system
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">
          The files stay inside the system. Recipients get a bell notification and can re-download
          from Shared schedules. Nothing is emailed.
        </p>
        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Formats</Form.Label>
          <div className="d-flex gap-3">
            {(['EXCEL', 'PDF'] as const).map((f) => (
              <Form.Check
                key={f}
                type="checkbox"
                id={`share-fmt-${f}`}
                label={f === 'EXCEL' ? 'Excel' : 'PDF'}
                checked={formats.has(f)}
                onChange={() => toggle(formats, f, setFormats)}
              />
            ))}
          </div>
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label className="fw-bold small">Share with (staff accounts)</Form.Label>
          <Form.Control
            size="sm"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Form.Group>
        <div style={{ maxHeight: 240, overflowY: 'auto' }} className="mb-3 border rounded p-2">
          {staff.length === 0 && (
            <div className="text-muted small">No staff found. The directory needs Director-level access.</div>
          )}
          {staff.map((s) => (
            <Form.Check
              key={s.id}
              type="checkbox"
              id={`share-u-${s.id}`}
              label={`${s.name} (${s.role})`}
              checked={picked.has(s.id)}
              onChange={() => toggle(picked, s.id, setPicked)}
            />
          ))}
        </div>
        <Form.Group className="mb-2">
          <Form.Label className="fw-bold small">Note (optional)</Form.Label>
          <Form.Control
            size="sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. October salaries for review"
            maxLength={300}
          />
        </Form.Group>
        {formError && <Alert variant="danger" className="py-2 small">{formError}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleShare} disabled={sharePayroll.isPending}>
          {sharePayroll.isPending ? 'Sharing...' : `Share with ${picked.size} staff`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function SharedSchedulesList({ runType }: { runType: 'GUARD' | 'STAFF' }) {
  const { data: shares, isLoading } = usePayrollShares();
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  const rows = (shares ?? []).filter((s) => s.runType === runType);

  const handleDownload = async (shareId: string, filename: string) => {
    setDownloading(shareId);
    try {
      await payrollSharesApi.download(shareId, filename);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to download.', 'danger');
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h6 className="fw-semibold small text-uppercase text-muted mb-2">
        <i className="bi bi-share me-1" />Shared schedules
      </h6>
      <Table size="sm" hover responsive className="align-middle small">
        <thead className="table-light">
          <tr>
            <th>Period</th>
            <th>Format</th>
            <th>Shared with</th>
            <th>Note</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const read = s.recipients.filter((r) => r.readAt).length;
            return (
              <tr key={s.id}>
                <td>{s.period}</td>
                <td>
                  <i className={`bi ${s.format === 'PDF' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-excel'} me-1`} />
                  {s.format === 'PDF' ? 'PDF' : 'Excel'}
                </td>
                <td>
                  {s.recipients.length} staff ({read} read)
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {s.recipients.map((r) => r.staffName).join(', ')}
                  </div>
                </td>
                <td className="text-muted">{s.note ?? '-'}</td>
                <td className="text-muted">{new Date(s.createdAt).toLocaleString('en-GB')}</td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    disabled={downloading === s.id}
                    onClick={() => handleDownload(s.id, s.filename)}
                  >
                    <i className="bi bi-download me-1" />
                    {downloading === s.id ? '...' : 'Download'}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function CashbookTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  // Clicking a tile filters the table to that side of the ledger — the tile
  // doubles as the drill-down.
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  const { data, isLoading } = useCashbook({ month, year, limit: 200, type: typeFilter === 'ALL' ? undefined : typeFilter });
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
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER]}>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowAdd(true)}>
            + Add Entry
          </Button>
        </RoleGuard>
      </div>

      {summary && (
        <Row className="g-2 mb-1">
          {[
            { label: 'Total In',  value: summary.totalIn,  color: '#E9F7EF', type: 'IN'  as const },
            { label: 'Total Out', value: summary.totalOut, color: '#FDEDEC', type: 'OUT' as const },
            { label: 'Net Cash',  value: summary.netCash,  color: '#EBF5FB', type: 'ALL' as const },
          ].map(({ label, value, color, type }) => {
            const active = typeFilter === type;
            return (
              <Col xs={4} key={label}>
                <Card
                  className="border-0 shadow-sm h-100"
                  style={{ background: color, cursor: 'pointer', outline: active ? `2px solid ${NAVY}` : '2px solid transparent' }}
                  title="Click to filter the entries below"
                  onClick={() => setTypeFilter(prev => (prev === type ? 'ALL' : type))}
                >
                  <Card.Body className="p-2">
                    <div className="small text-muted">{label}</div>
                    <div className="fw-bold small" style={{ color: NAVY }}>{fmtUGX(value)}</div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <div className="text-muted mb-3" style={{ fontSize: '0.7rem' }}>
        {typeFilter === 'ALL'
          ? 'Tip: click a tile above to filter the entries below.'
          : <>Showing: {typeFilter === 'IN' ? 'money in' : 'money out'} — <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setTypeFilter('ALL')}>show all</span></>}
      </div>

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
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const { data, isLoading }   = useARAgingReport(raisedRangeQuery(filters));

  const buckets = data ? [
    { key: 'current', label: 'Current (0-30 days)', value: data.buckets.current,   color: 'success' },
    { key: '31_60',   label: '31-60 Days',          value: data.buckets.days31_60, color: 'warning' },
    { key: '61_90',   label: '61-90 Days',          value: data.buckets.days61_90, color: 'warning' },
    { key: 'over90',  label: '90+ Days',            value: data.buckets.over90,    color: 'danger' },
  ] : [];

  const agingBucketOf = (dueDate: string) => {
    const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
    if (days <= 30) return 'current';
    if (days <= 60) return '31_60';
    if (days <= 90) return '61_90';
    return 'over90';
  };

  const unpaid = (data?.invoices ?? []).filter((i) => {
    if (!['PENDING', 'ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(i.status)) return false;
    if (!activeBucket) return true;
    return agingBucketOf(i.dueDate) === activeBucket;
  });

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
            {buckets.map(({ key, label, value, color }) => {
              const active = activeBucket === key;
              return (
                <Col xs={6} lg={3} key={key}>
                  <Card
                    className="border-0 shadow-sm text-center"
                    style={{ cursor: 'pointer', border: active ? '2px solid #1B3A6B' : undefined, boxShadow: active ? '0 2px 10px #1B3A6B22' : undefined }}
                    onClick={() => setActiveBucket((prev) => (prev === key ? null : key))}
                    title="Click to filter the invoices below by this bucket"
                  >
                    <Card.Body className="py-2 px-1">
                      <div className="small text-muted mb-1" style={{ fontSize: '0.7rem' }}>{label}</div>
                      <Badge bg={color} text={color === 'warning' ? 'dark' : undefined} style={{ fontSize: '0.9rem', padding: '6px 10px' }}>
                        {fmtUGX(value)}
                      </Badge>
                      {active && <div className="small mt-1" style={{ color: '#1B3A6B', fontSize: '0.65rem' }}>filtered</div>}
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
          {activeBucket && (
            <div className="d-flex align-items-center gap-2 mb-3 small">
              <span className="text-muted">Showing {unpaid.length} invoice{unpaid.length === 1 ? '' : 's'} in {buckets.find(b => b.key === activeBucket)?.label}.</span>
              <Button size="sm" variant="outline-secondary" onClick={() => setActiveBucket(null)}>Clear filter</Button>
            </div>
          )}

          <Table striped responsive className="small">
            <thead className="table-light">
              <tr><th>Invoice #</th><th>Client</th><th>Raised</th><th>Amount</th><th>Due Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-3">
                    {activeBucket ? 'No outstanding invoice in this aging bucket' : filtersActive ? 'No outstanding invoice matches these filters' : 'No outstanding invoices'}
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

// ?? Payments Tab ???????????????????????????????????????????????????????????????

const PAYMENT_STATUS_TABS = [
  { key: 'PENDING_APPROVAL', label: 'Awaiting approval' },
  { key: 'APPROVED',         label: 'Approved' },
  { key: 'REJECTED',         label: 'Rejected' },
  { key: '',                 label: 'All' },
] as const;

function PaymentsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING_APPROVAL');
  const [monthFilter, setMonthFilter]   = useState<string>(monthStr(new Date()));
  const [rejectTarget, setRejectTarget] = useState<PaymentResponse | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId]             = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['finance-payments', statusFilter, monthFilter],
    queryFn:  () => paymentApprovalsApi.list({
      status: statusFilter || undefined,
      month:  monthFilter || undefined,
      limit:  100,
    }),
  });
  const rows = data?.data ?? [];

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await paymentApprovalsApi.approve(id);
      showToast('Payment approved - the invoice balance has moved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ar-aging'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not approve the payment.'), 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await paymentApprovalsApi.reject(rejectTarget.id, rejectReason.trim());
      showToast('Payment rejected.', 'success');
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not reject the payment.'), 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const badgeFor = (s: string) =>
    s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'danger' : 'warning';

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <span className="fw-semibold small text-muted">
          Manually recorded payments and their approval state
        </span>
        <Form.Select size="sm" style={{ width: 190 }} aria-label="Payment month"
          value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">All months</option>
          {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Form.Select>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        {PAYMENT_STATUS_TABS.map((t) => (
          <Button
            key={t.key || 'all'}
            size="sm"
            variant={statusFilter === t.key ? 'primary' : 'outline-secondary'}
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Mode</th>
              <th>Payment Date</th>
              <th>Cheque #</th>
              <th>Reference</th>
              <th>Entered by</th>
              <th>Submitted</th>
              <th>Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-muted py-4">No payments match this view</td>
              </tr>
            ) : rows.map((p) => (
              <tr key={p.id}>
                <td className="fw-medium">{p.invoiceNumber || '-'}</td>
                <td>{p.clientName || '-'}</td>
                <td className="fw-semibold">{fmtUGX(p.amountPaid)}</td>
                <td>{p.mode.replace('_', ' ')}</td>
                <td className="text-nowrap">
                  {p.paymentDate
                    ? new Date(p.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '-'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {p.chequeNumber || '-'}
                </td>
                <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {p.referenceNumber || '-'}
                </td>
                <td>{p.recordedByName ?? p.recordedBy}</td>
                <td className="text-nowrap">
                  {new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <Badge bg={badgeFor(p.status)}>{p.status.replace('_', ' ')}</Badge>
                  {p.status === 'REJECTED' && p.rejectedReason && (
                    <div className="text-muted" style={{ fontSize: '0.68rem', maxWidth: 200 }} title={p.rejectedReason}>
                      {p.rejectedReason}
                    </div>
                  )}
                </td>
                <td className="text-end text-nowrap">
                  {p.status === 'PENDING_APPROVAL' && (
                    <PermissionGuard permission="payments.approve">
                      <Button
                        size="sm" variant="outline-success" className="me-1"
                        disabled={busyId === p.id}
                        onClick={() => handleApprove(p.id)}
                      >
                        <i className="bi bi-check-lg" /> Approve
                      </Button>
                      <Button
                        size="sm" variant="outline-danger"
                        disabled={busyId === p.id}
                        onClick={() => { setRejectTarget(p); setRejectReason(''); }}
                      >
                        <i className="bi bi-x-lg" /> Reject
                      </Button>
                    </PermissionGuard>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={!!rejectTarget} onHide={() => setRejectTarget(null)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title className="small fw-bold">Reject payment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-2">
            {rejectTarget ? `${fmtUGX(rejectTarget.amountPaid)} on ${rejectTarget.invoiceNumber || 'this invoice'}` : ''}
          </p>
          <Form.Control
            as="textarea" rows={2} placeholder="Reason (kept on the payment)"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button size="sm" variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button
            size="sm" variant="danger"
            disabled={rejectReason.trim().length < 3 || busyId === rejectTarget?.id}
            onClick={handleReject}
          >
            Reject payment
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}


// ?? Deductions Tab ??????????????????????????????????????????????????????????????

function DeductionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [view, setView] = useState<'guard' | 'staff'>('guard');
  const { data: guardDeductions = [], refetch: refetchGuard } = useDeductions({ status: statusFilter || undefined });
  const { data: staffDeductions = [], refetch: refetchStaff } = useStaffDeductions({ status: statusFilter || undefined });
  const cancelDeduction = useCancelDeduction();
  const cancelStaffDeduction = useCancelStaffDeduction();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleCancelGuard = async (id: string) => {
    try {
      await cancelDeduction.mutateAsync(id);
      showToast('Deduction cancelled.', 'success');
      refetchGuard();
    } catch {
      showToast('Failed to cancel deduction.', 'danger');
    }
  };

  const handleCancelStaff = async (id: string) => {
    try {
      await cancelStaffDeduction.mutateAsync(id);
      showToast('Staff deduction cancelled.', 'success');
      refetchStaff();
    } catch {
      showToast('Failed to cancel deduction.', 'danger');
    }
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <span className="fw-semibold">Deductions History</span>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div className="btn-group btn-group-sm" role="group">
            <Button size="sm" variant={view === 'guard' ? 'primary' : 'outline-primary'} onClick={() => setView('guard')}>Guards</Button>
            <Button size="sm" variant={view === 'staff' ? 'primary' : 'outline-primary'} onClick={() => setView('staff')}>Staff</Button>
          </div>
          <Form.Select size="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 140 }}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPLIED">Applied</option>
            <option value="CANCELLED">Cancelled</option>
          </Form.Select>
          {view === 'guard' && (
            <Button size="sm" variant="outline-primary" onClick={() => navigate('/guards')}>
              <i className="bi bi-plus-lg me-1" />Add via Guard
            </Button>
          )}
        </div>
      </div>

      {view === 'guard' ? (
        guardDeductions.length === 0 ? (
          <Alert variant="light" className="small py-2">No guard deductions recorded{statusFilter ? ` with status ${statusFilter}` : ''}.</Alert>
        ) : (
          <Table size="sm" hover responsive className="align-middle small">
            <thead className="table-light">
              <tr>
                <th>Guard</th><th>Type</th><th className="text-end">Amount (UGX)</th>
                <th>Description</th><th>Effective Date</th><th>Status</th><th>Applied In</th><th></th>
              </tr>
            </thead>
            <tbody>
              {guardDeductions.map((d: any) => (
                <tr key={d.id}>
                  <td>{d.guardName}</td>
                  <td>{d.type}</td>
                  <td className="text-end">{d.amount.toLocaleString()}</td>
                  <td className="small">{d.description}</td>
                  <td className="small">{new Date(d.effectiveDate).toLocaleDateString('en-GB')}</td>
                  <td><Badge bg={d.status === 'APPLIED' ? 'success' : d.status === 'CANCELLED' ? 'secondary' : 'warning'}>{d.status}</Badge></td>
                  <td className="small">{d.appliedInPayroll ? `${d.appliedInPayroll.month}/${d.appliedInPayroll.year}` : '?'}</td>
                  <td>
                    {d.status === 'PENDING' && (
                      <Button size="sm" variant="outline-danger" onClick={() => handleCancelGuard(d.id)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : (
        (staffDeductions ?? []).length === 0 ? (
          <Alert variant="light" className="small py-2">No staff deductions recorded{statusFilter ? ` with status ${statusFilter}` : ''}.</Alert>
        ) : (
          <Table size="sm" hover responsive className="align-middle small">
            <thead className="table-light">
              <tr>
                <th>Staff</th><th>Type</th><th className="text-end">Amount (UGX)</th>
                <th>Description</th><th>Effective Date</th><th>Status</th><th>Applied In</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(staffDeductions ?? []).map((d: any) => (
                <tr key={d.id}>
                  <td>{d.staffName}</td>
                  <td>{d.type}</td>
                  <td className="text-end">{d.amount.toLocaleString()}</td>
                  <td className="small">{d.description}</td>
                  <td className="small">{new Date(d.effectiveDate).toLocaleDateString('en-GB')}</td>
                  <td><Badge bg={d.status === 'APPLIED' ? 'success' : d.status === 'CANCELLED' ? 'secondary' : 'warning'}>{d.status}</Badge></td>
                  <td className="small">{d.appliedInPayroll ? `${d.appliedInPayroll.month}/${d.appliedInPayroll.year}` : '?'}</td>
                  <td>
                    {d.status === 'PENDING' && (
                      <Button size="sm" variant="outline-danger" onClick={() => handleCancelStaff(d.id)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}
    </>
  );
}

export default function FinancePage() {
  const navigate = useNavigate();
  const agingTitle = useReportTitle('receivables_aging_report');
  const [tab, setTab] = useState('invoices');

  return (
    <div className="py-4 px-3">
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Finance</Breadcrumb.Item>
      </Breadcrumb>

      <h4 className="fw-bold mb-4" style={{ color: NAVY }}>Finance</h4>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <Tabs activeKey={tab} onSelect={(k) => setTab(k ?? 'invoices')} className="mb-3">
            <Tab eventKey="invoices" title="Invoices">
              <InvoicesTab onGoAging={() => setTab('aging')} />
            </Tab>
            <Tab eventKey="payments" title={<><i className="bi bi-credit-card me-1" />Payments</>}>
              <PaymentsTab />
            </Tab>
            <Tab eventKey="payroll" title="Payroll">
              <PayrollTab />
            </Tab>
            <Tab eventKey="staff-payroll" title={<><i className="bi bi-people me-1" />Staff Payroll</>}>
              <StaffPayrollTab />
            </Tab>
            <Tab eventKey="deductions" title={<><i className="bi bi-dash-circle me-1" />Deductions</>}>
              <DeductionsTab />
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
