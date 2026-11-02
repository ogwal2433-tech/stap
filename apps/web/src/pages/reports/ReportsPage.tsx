import { useState, type ReactNode } from 'react';
import {
  Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../../lib/reports.api';
import { invoicesApi, paymentApprovalsApi } from '../../lib/finance.api';
import { getApiErrorMessage } from '../../lib/api';
import RecordPaymentModal from '../../components/finance/RecordPaymentModal';
import { useToast } from '../../context/ToastContext';
import RoleGuard from '../../components/RoleGuard';
import { ROLES, formatUgx } from '@security360/shared';
import type { ScheduledReportInput, InvoiceResponse, BusinessAnalysisReport } from '@security360/shared';
import { useReportTitle } from '../../hooks/useReportTitles';

const NAVY = '#1B3A6B';
const LINE = '#EDF0F4';
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** A rounded icon medallion — the one decorative element, used consistently. */
function Medallion({ icon, color, bg, size = 36 }: { icon: string; color: string; bg: string; size?: number }) {
  return (
    <span
      className="d-inline-flex align-items-center justify-content-center flex-shrink-0"
      style={{ width: size, height: size, borderRadius: 10, background: bg, color }}
    >
      <i className={`bi ${icon}`} />
    </span>
  );
}

/** Section label in the app's small-caps style. */
function SectionLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>
      <i className={`bi ${icon} me-1`} style={{ color: NAVY }} />{children}
    </h6>
  );
}

// ── Income & Expenses — the page's centrepiece, straight on the page ──────────

function IncomeExpensesSection({ month, year, onMonthChange, onYearChange }: {
  month: number;
  year:  number;
  onMonthChange: (m: number) => void;
  onYearChange:  (y: number) => void;
}) {
  // Clicking a KPI filters the entries table below it — the tile is the
  // drill-down: Money In → received rows, Money Out → everything spent,
  // Paid Out → the cash that actually left, Net → back to everything.
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'IN' | 'OUT' | 'PAID'>('ALL');
  const [downloading, setDownloading] = useState(false);
  const { showToast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['income-expenses', month, year],
    queryFn:  () => reportsApi.getIncomeExpenses(month, year),
  });

  async function downloadExcel() {
    setDownloading(true);
    try { await reportsApi.downloadIncomeExpensesExcel(month, year); }
    catch { showToast('Download failed', 'danger'); }
    setDownloading(false);
  }

  const tiles = data && [
    { label: 'Money In',  value: data.totalIn,  tint: '#1E8449', icon: 'bi-box-arrow-in-down',  sub: 'Cash received',                                     filter: 'IN'   as const },
    { label: 'Money Out', value: data.totalOut, tint: '#C0392B', icon: 'bi-box-arrow-up',        sub: 'Salaries (guards + staff) + requisitions + spent',  filter: 'OUT'  as const },
    { label: 'Net Revenue', value: data.netRevenue, tint: data.netRevenue < 0 ? '#C0392B' : NAVY, icon: 'bi-balance-scale', sub: 'Money in minus money out', filter: 'ALL' as const },
    { label: 'Paid Out',  value: data.paidOut,  tint: '#B7770E', icon: 'bi-cash-stack',          sub: 'Actually left the bank',                            filter: 'PAID' as const },
  ];

  const SOURCE_LABEL: Record<string, string> = { PAYROLL: 'Payroll', REQUISITION: 'Requisitions', MANUAL: 'Manual ledger' };
  const CATEGORY_LABEL: Record<string, string> = {
    GUARDS: 'Guard salaries', STAFF: 'Staff salaries', PAYROLL: 'Payroll',
    REQUISITION: 'Requisitions handed out',
  };

  const totalOut = data?.totalOut ?? 0;

  const incomeRows = data && (data.income.length === 0
    ? <tr><td colSpan={3} className="text-center text-muted py-3">No money received this period</td></tr>
    : data.income.map(r => (
        <tr key={r.category}>
          <td>{r.category.replace(/_/g, ' ')}</td>
          <td className="text-center">{r.count}</td>
          <td className="text-end fw-medium">{formatUgx(r.amount)}</td>
        </tr>
      )));

  const expenseRows = data && (data.expenses.length === 0
    ? <tr><td colSpan={5} className="text-center text-muted py-3">Nothing spent this period</td></tr>
    : (
      <>
        {data.expenses.map(r => (
          <tr key={r.source + r.category}>
            <td>{SOURCE_LABEL[r.source] ?? r.source}</td>
            <td>{CATEGORY_LABEL[r.category] ?? r.category.replace(/_/g, ' ')}</td>
            <td className="text-center">{r.count}</td>
            <td className="text-center text-muted">{totalOut > 0 ? `${((r.amount / totalOut) * 100).toFixed(1)}%` : '—'}</td>
            <td className="text-end fw-medium">{formatUgx(r.amount)}</td>
          </tr>
        ))}
        <tr style={{ background: '#F8FAFC' }} className="fw-semibold">
          <td colSpan={3} className="text-end">Total spent this period</td>
          <td className="text-center">{totalOut > 0 ? '100%' : '—'}</td>
          <td className="text-end">{formatUgx(totalOut)}</td>
        </tr>
      </>
    ));

  const shownEntries = data?.entries.filter(e => {
    if (entryFilter === 'IN')   return e.type === 'IN';
    if (entryFilter === 'OUT')  return e.type === 'OUT';
    if (entryFilter === 'PAID') return e.type === 'OUT' && e.source === 'LEDGER';
    return true;
  }) ?? [];

  const filterChip = (key: 'ALL' | 'IN' | 'OUT' | 'PAID', label: string, solid: string) => (
    <Button
      size="sm"
      variant={entryFilter === key ? '' : 'outline-secondary'}
      active={entryFilter === key}
      style={entryFilter === key ? { background: solid, borderColor: solid } : undefined}
      onClick={() => setEntryFilter(prev => (prev === key ? 'ALL' : key))}
    >
      {label}
    </Button>
  );

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Body className="p-4">
        {/* Header: identity left, period controls right */}
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
          <div className="d-flex align-items-center gap-3">
            <Medallion icon="bi-wallet2" color={NAVY} bg="#EBF5FB" size={44} />
            <div>
              <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Income &amp; Expenses</h5>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                Cash received vs salaries, requisitions and expenses — the month at a glance.
              </div>
            </div>
          </div>
          <div className="d-flex gap-2 align-items-center">
            <Form.Select size="sm" value={month} onChange={(e) => onMonthChange(+e.target.value)} style={{ width: 100 }}>
              {MONTH_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </Form.Select>
            <Form.Control size="sm" type="number" value={year} onChange={(e) => onYearChange(+e.target.value)} style={{ width: 90 }} />
            <Button size="sm" variant="outline-primary" onClick={downloadExcel} disabled={downloading} title="Download this report as Excel">
              {downloading ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-download me-1" />Excel</>}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
        ) : isError || !data ? (
          <div className="text-center text-muted py-5">Could not load this report — finance roles only.</div>
        ) : (
          <>
            {/* KPI strip — white cards, tinted icon chips, click to filter */}
            <Row className="g-3 mb-2">
              {tiles!.map(t => {
                const active = entryFilter === t.filter;
                return (
                  <Col xs={6} md={3} key={t.label}>
                    <div
                      className="rounded-3 p-3 h-100"
                      style={{
                        background:    '#FFFFFF',
                        border:        `1px solid ${active ? t.tint : LINE}`,
                        boxShadow:     active ? `0 2px 10px ${t.tint}22` : 'none',
                        cursor:        'pointer',
                        transition:    'border-color .15s, box-shadow .15s',
                      }}
                      title="Click to filter the entries below"
                      onClick={() => setEntryFilter(prev => (prev === t.filter ? 'ALL' : t.filter))}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <Medallion icon={t.icon} color={t.tint} bg={`${t.tint}14`} />
                        {active && <i className="bi bi-check-circle-fill" style={{ color: t.tint }} />}
                      </div>
                      <div className="text-uppercase text-muted mt-2" style={{ letterSpacing: '0.05em', fontSize: '0.65rem' }}>{t.label}</div>
                      <div className="fw-bold" style={{ color: t.tint, fontSize: '1.2rem' }}>{formatUgx(t.value)}</div>
                      <div className="text-muted" style={{ fontSize: '0.68rem' }}>{t.sub}</div>
                    </div>
                  </Col>
                );
              })}
            </Row>

            {/* Two ledgers side by side */}
            <Row className="g-3 mt-2 mb-4">
              <Col md={6}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Medallion icon="bi-arrow-down-circle" color="#1E8449" bg="#E9F7EF" size={26} />
                  <span className="fw-semibold" style={{ color: '#1E8449', fontSize: '0.85rem' }}>Money In — cash received</span>
                </div>
                <Table size="sm" striped bordered responsive className="small mb-0" style={{ borderColor: LINE }}>
                  <thead className="table-light"><tr><th>Category</th><th className="text-center">Entries</th><th className="text-end">Amount (UGX)</th></tr></thead>
                  <tbody>{incomeRows}</tbody>
                </Table>
              </Col>
              <Col md={6}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Medallion icon="bi-arrow-up-circle" color="#C0392B" bg="#FDEDEC" size={26} />
                  <span className="fw-semibold" style={{ color: '#C0392B', fontSize: '0.85rem' }}>Money Out — where the money went</span>
                </div>
                <Table size="sm" striped bordered responsive className="small mb-0" style={{ borderColor: LINE }}>
                  <thead className="table-light"><tr><th>Source</th><th>Category</th><th className="text-center">Items</th><th className="text-center">% of spend</th><th className="text-end">Amount (UGX)</th></tr></thead>
                  <tbody>{expenseRows}</tbody>
                </Table>
              </Col>
            </Row>

            {/* Entries with filter chips */}
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <div className="d-flex align-items-center gap-2">
                <Medallion icon="bi-list-ul" color={NAVY} bg="#EBF5FB" size={26} />
                <span className="fw-semibold" style={{ color: NAVY, fontSize: '0.85rem' }}>
                  Entries this period <Badge bg="light" text="dark" className="ms-1">{shownEntries.length}</Badge>
                </span>
              </div>
              <div className="d-flex gap-1">
                {filterChip('ALL',  'All',   NAVY)}
                {filterChip('IN',   'In',    '#1E8449')}
                {filterChip('OUT',  'Out',   '#C0392B')}
                {filterChip('PAID', 'Paid',  '#B7770E')}
              </div>
            </div>
            <Table size="sm" striped responsive className="small" style={{ maxHeight: 340, overflowY: 'auto', display: 'block' }}>
              <thead className="table-light">
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Source</th><th className="text-end">Amount (UGX)</th></tr>
              </thead>
              <tbody>
                {shownEntries.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted py-3">Nothing recorded for this period yet</td></tr>
                ) : shownEntries.map((e, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                    <td>{e.description}</td>
                    <td>{e.category.replace(/_/g, ' ')}</td>
                    <td><Badge bg={e.type === 'IN' ? 'success' : 'danger'}>{e.type}</Badge></td>
                    <td><Badge bg={e.source === 'COMMITTED' ? 'info text-dark' : 'secondary'}>{e.source === 'COMMITTED' ? 'Committed' : 'Ledger'}</Badge></td>
                    <td className="text-end">{formatUgx(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card.Body>
    </Card>
  );
}

// ── Business Analysis — who pays us, what costs us, the six-month shape ───────

/** A thin proportional bar — the only chart primitive this page needs. */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: '#EDF0F4', borderRadius: 4, height: 6, overflow: 'hidden' }}>
      <div
        style={{
          width:     `${Math.max(1.5, pct)}%`,
          background: color,
          borderRadius: 4,
          height:      '100%',
          transition:  'width .3s',
        }}
      />
    </div>
  );
}

const COST_LABEL: Record<string, string> = {
  GUARDS: 'Guard salaries', STAFF: 'Staff salaries', PAYROLL: 'Payroll',
  REQUISITION: 'Requisitions handed out',
};

type PendingPayment = BusinessAnalysisReport['actions']['pendingPayments'][number];

/** Slice colours for the money-out pie — one per cost line, biggest first. */
const PIE_COLORS = ['#1B3A6B', '#C0392B', '#B7770E', '#1E8449', '#7D3C98', '#17A2B8', '#E67E22', '#5D6D7E'];

function BusinessAnalysisSection({ month, year }: { month: number; year: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['business-analysis', month, year],
    queryFn:  () => reportsApi.getBusinessAnalysis(month, year),
  });
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const monthLabel = MONTH_LABELS[month - 1];
  const trendMax   = data ? Math.max(1, ...data.trend.flatMap(t => [t.moneyIn, t.moneyOut])) : 1;

  // ── Action state ──
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingPayment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [payInvoice, setPayInvoice]  = useState<InvoiceResponse | null>(null);

  /**
   * Approving a payment posts the receipt to the cashbook, so every money
   * view on this page and on the dashboard has to move together.
   */
  const refreshMoneyViews = () => {
    queryClient.invalidateQueries({ queryKey: ['business-analysis'] });
    queryClient.invalidateQueries({ queryKey: ['income-expenses'] });
    queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoice-summary'] });
    queryClient.invalidateQueries({ queryKey: ['ar-aging'] });
    queryClient.invalidateQueries({ queryKey: ['cashbook'] });
    queryClient.invalidateQueries({ queryKey: ['cashbook-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  async function downloadExcel() {
    setDownloading(true);
    try { await reportsApi.downloadBusinessAnalysisExcel(month, year); }
    catch { showToast('Download failed', 'danger'); }
    setDownloading(false);
  }

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await paymentApprovalsApi.approve(id);
      showToast('Payment approved — the receipt is in the cashbook and the invoice balance has moved.', 'success');
      refreshMoneyViews();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not approve the payment.'), 'danger');
    } finally { setBusyId(null); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await paymentApprovalsApi.reject(rejectTarget.id, rejectReason.trim());
      showToast('Payment rejected.', 'success');
      setRejectTarget(null);
      setRejectReason('');
      refreshMoneyViews();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not reject the payment.'), 'danger');
    } finally { setBusyId(null); }
  };

  const openRecordPayment = async (invoiceId: string) => {
    if (busyId) return;
    setBusyId(invoiceId);
    try {
      setPayInvoice(await invoicesApi.getById(invoiceId));
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not open the invoice.'), 'danger');
    } finally { setBusyId(null); }
  };

  const sendInvoiceEmail = async (inv: Pick<InvoiceResponse, 'id' | 'invoiceNumber' | 'clientName'>) => {
    if (busyId) return;
    setBusyId(inv.id);
    try {
      await invoicesApi.sendEmail(inv.id);
      showToast(`Invoice ${inv.invoiceNumber} emailed to ${inv.clientName}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to send invoice email.'), 'danger');
    } finally { setBusyId(null); }
  };

  const openPdf = async (inv: Pick<InvoiceResponse, 'id' | 'invoiceNumber'>) => {
    try { await invoicesApi.openInvoicePdf(inv.id, inv.invoiceNumber); }
    catch (err) { showToast(getApiErrorMessage(err, 'Could not open the PDF.'), 'danger'); }
  };

  // ── Money-out pie: one slice per cost line, conic-gradient (no chart lib) ──
  const hasSpend = !!data && data.totalOut > 0 && data.costs.length > 0;
  let pieGradient: string | undefined;
  if (hasSpend && data) {
    const stops: string[] = [];
    let from = 0;
    const last = data.costs.length - 1;
    data.costs.forEach((c, i) => {
      const to = i === last ? 360 : from + (c.amount / data.totalOut) * 360;
      stops.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${from}deg ${to}deg`);
      from = to;
    });
    pieGradient = `conic-gradient(${stops.join(', ')})`;
  }

  const iconBtn = (icon: string, title: string, onClick: () => void, disabled = false) => (
    <Button size="sm" variant="outline-secondary" className="p-1 px-2" title={title} onClick={onClick} disabled={disabled}>
      <i className={`bi ${icon}`} />
    </Button>
  );

  const actions = data?.actions;

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Body className="p-4">
        {/* Header: identity left, export right */}
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
          <div className="d-flex align-items-center gap-3">
            <Medallion icon="bi-bar-chart-line" color={NAVY} bg="#EBF5FB" size={44} />
            <div>
              <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Business Analysis</h5>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                Who pays us most, what costs us most, and what needs doing — for {monthLabel} {year}.
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline-primary" onClick={downloadExcel} disabled={downloading} title="Download this analysis as Excel">
            {downloading ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-download me-1" />Excel</>}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
        ) : isError || !data || !actions ? (
          <div className="text-center text-muted py-5">Could not load the analysis — finance roles only.</div>
        ) : (
          <>
            {/* ── Needs your action — live, deliberately not month-scoped ──── */}
            {actions.pendingPayments.length === 0 && actions.overdueInvoices.length === 0 ? (
              <div className="rounded-3 d-flex align-items-center gap-2 p-3 mb-4 small fw-semibold"
                   style={{ background: '#E9F7EF', color: '#1E8449' }}>
                <i className="bi bi-check2-circle" />
                All clear — nothing awaiting approval and no overdue invoices.
              </div>
            ) : (
              <Row className="g-4 mb-4">
                {/* Payments awaiting the MD's approval */}
                <Col md={6}>
                  <div className="rounded-3 p-3 h-100" style={{ background: '#FFFDF4', border: '1px solid #F3E3B3' }}>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <Medallion icon="bi-hourglass-split" color="#B7770E" bg="#FBF2DC" size={26} />
                      <span className="fw-semibold" style={{ color: '#B7770E', fontSize: '0.85rem' }}>Awaiting your approval</span>
                      <Badge bg="warning" text="dark" className="ms-auto">{actions.pendingCount}</Badge>
                    </div>
                    <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
                      Approving posts the receipt to the cashbook and moves the invoice balance.
                    </div>
                    {actions.pendingPayments.length === 0 ? (
                      <div className="small text-muted py-2">Nothing waiting — every recorded payment is signed off.</div>
                    ) : (
                      <>
                        {actions.pendingPayments.map(p => (
                          <div key={p.id} className="d-flex align-items-center gap-2 py-2" style={{ borderTop: `1px solid ${LINE}` }}>
                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                              <div className="fw-semibold text-truncate" style={{ fontSize: '0.8rem' }}>{p.clientName}</div>
                              <div className="text-muted text-truncate" style={{ fontSize: '0.65rem' }}>
                                {p.invoiceNumber} · {p.mode.replace(/_/g, ' ')} · recorded {new Date(p.createdAt).toLocaleDateString('en-GB')}
                              </div>
                            </div>
                            <span className="fw-bold flex-shrink-0" style={{ fontSize: '0.78rem' }}>{formatUgx(p.amount)}</span>
                            <Button size="sm" style={{ background: '#1E8449', borderColor: '#1E8449' }}
                                    disabled={busyId !== null} onClick={() => handleApprove(p.id)}
                                    title="Approve — posts the receipt to the cashbook">
                              {busyId === p.id ? <Spinner size="sm" animation="border" /> : 'Approve'}
                            </Button>
                            <Button size="sm" variant="outline-danger" className="text-nowrap"
                                    disabled={busyId !== null}
                                    onClick={() => { setRejectTarget(p); setRejectReason(''); }}>
                              Reject
                            </Button>
                          </div>
                        ))}
                        {actions.pendingCount > actions.pendingPayments.length && (
                          <div className="text-muted pt-2" style={{ fontSize: '0.65rem', borderTop: `1px solid ${LINE}` }}>
                            Showing {actions.pendingPayments.length} of {actions.pendingCount} · {formatUgx(actions.pendingTotal)} awaiting in total
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Col>

                {/* Overdue invoices to chase */}
                <Col md={6}>
                  <div className="rounded-3 p-3 h-100" style={{ background: '#FFF6F4', border: '1px solid #F5C6C0' }}>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <Medallion icon="bi-exclamation-triangle" color="#C0392B" bg="#FDEDEC" size={26} />
                      <span className="fw-semibold" style={{ color: '#C0392B', fontSize: '0.85rem' }}>Overdue — chase these</span>
                      <Badge bg="danger" className="ms-auto">{actions.overdueCount}</Badge>
                    </div>
                    <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
                      {formatUgx(actions.overdueTotal)} owed across {actions.overdueCount} invoice{actions.overdueCount === 1 ? '' : 's'} — record a payment, email the client, or open the PDF.
                    </div>
                    {actions.overdueInvoices.length === 0 ? (
                      <div className="small text-muted py-2">Nothing overdue — receivables are clean.</div>
                    ) : (
                      <>
                        {actions.overdueInvoices.map(d => (
                          <div key={d.id} className="d-flex align-items-center gap-2 py-2" style={{ borderTop: `1px solid ${LINE}` }}>
                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                              <div className="d-flex align-items-baseline gap-2">
                                <span className="fw-semibold text-truncate" style={{ fontSize: '0.8rem' }}>{d.clientName}</span>
                                <span className="fw-bold flex-shrink-0" style={{ fontSize: '0.65rem', color: '#C0392B' }}>{d.daysOverdue}d late</span>
                              </div>
                              <div className="text-muted text-truncate" style={{ fontSize: '0.65rem' }} title={`Due ${new Date(d.dueDate).toLocaleDateString('en-GB')}`}>
                                {d.invoiceNumber} · due {new Date(d.dueDate).toLocaleDateString('en-GB')}
                              </div>
                            </div>
                            <span className="fw-bold flex-shrink-0" style={{ fontSize: '0.78rem', color: '#C0392B' }}>{formatUgx(d.outstanding)}</span>
                            <div className="d-flex gap-1 flex-shrink-0">
                              {iconBtn('bi-cash-coin', 'Record a payment against this invoice', () => openRecordPayment(d.id), busyId !== null)}
                              {iconBtn('bi-envelope', 'Email this invoice to the client', () => sendInvoiceEmail(d), busyId !== null)}
                              {iconBtn('bi-file-earmark-pdf', 'Open the invoice PDF', () => openPdf(d))}
                            </div>
                          </div>
                        ))}
                        {actions.overdueCount > actions.overdueInvoices.length && (
                          <div className="text-muted pt-2" style={{ fontSize: '0.65rem', borderTop: `1px solid ${LINE}` }}>
                            Showing the worst {actions.overdueInvoices.length} of {actions.overdueCount} overdue invoices
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Col>
              </Row>
            )}

            {/* Top clients | money-out pie */}
            <Row className="g-4 mb-4">
              <Col md={6}>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <Medallion icon="bi-people" color="#1E8449" bg="#E9F7EF" size={26} />
                  <span className="fw-semibold" style={{ color: '#1E8449', fontSize: '0.85rem' }}>Top clients — who pays us most</span>
                </div>
                {data.topClients.length === 0 ? (
                  <div className="text-muted small py-3">No client payments recorded for {monthLabel} yet.</div>
                ) : (
                  data.topClients.map((c, i) => (
                    <div
                      key={c.clientId}
                      className="d-flex align-items-center gap-3 py-2"
                      style={{ borderBottom: i === data.topClients.length - 1 ? 'none' : `1px solid ${LINE}` }}
                    >
                      <span className="fw-bold flex-shrink-0" style={{ color: NAVY, fontSize: '0.8rem', width: 16, textAlign: 'right' }}>{i + 1}</span>
                      <span
                        className="d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold"
                        style={{ width: 30, height: 30, borderRadius: 8, background: '#EBF5FB', color: NAVY, fontSize: '0.7rem' }}
                      >
                        {c.clientName.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="d-flex justify-content-between align-items-baseline gap-2">
                          <span className="fw-semibold text-truncate" style={{ fontSize: '0.82rem' }}>{c.clientName}</span>
                          <span className="fw-bold flex-shrink-0" style={{ color: '#1E8449', fontSize: '0.8rem' }}>{formatUgx(c.amount)}</span>
                        </div>
                        <div className="mt-1"><Bar pct={c.share} color="#1E8449" /></div>
                        <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>
                          {c.invoices} invoice{c.invoices === 1 ? '' : 's'} · {c.share.toFixed(1)}% of money in
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </Col>
              <Col md={6}>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <Medallion icon="bi-pie-chart" color={NAVY} bg="#EBF5FB" size={26} />
                  <span className="fw-semibold" style={{ color: NAVY, fontSize: '0.85rem' }}>Expense breakdown — every shilling of money out</span>
                </div>
                {!hasSpend ? (
                  <div className="text-muted small py-3">No expenses recorded for {monthLabel} yet.</div>
                ) : (
                  <div className="d-flex align-items-center gap-4 flex-wrap">
                    {/* Donut: conic-gradient slices + white hole carrying the total */}
                    <div style={{ position: 'relative', width: 156, height: 156, flexShrink: 0 }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: pieGradient }} />
                      <div
                        style={{
                          position: 'absolute', inset: 28, borderRadius: '50%', background: '#FFFFFF',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          textAlign: 'center', padding: 4,
                        }}
                      >
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: NAVY, lineHeight: 1.05 }}>
                          {(data.totalOut ?? 0).toLocaleString()}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', marginTop: 2 }}>MONEY OUT</div>
                      </div>
                    </div>
                    {/* Legend: colour, cost line, share, amount */}
                    <div className="flex-grow-1" style={{ minWidth: 200 }}>
                      {data.costs.map((c, i) => {
                        const pct = (c.amount / data.totalOut) * 100;
                        return (
                          <div
                            key={c.source + c.category}
                            className="d-flex align-items-center gap-2 py-1"
                            style={{ borderBottom: i === data.costs.length - 1 ? 'none' : `1px solid ${LINE}` }}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span className="text-truncate flex-grow-1" style={{ fontSize: '0.75rem' }}>
                              {COST_LABEL[c.category] ?? c.category.replace(/_/g, ' ')}
                            </span>
                            <span className="fw-semibold flex-shrink-0" style={{ fontSize: '0.72rem', color: '#6C757D' }}>{pct.toFixed(1)}%</span>
                            <span className="fw-bold text-end flex-shrink-0" style={{ fontSize: '0.74rem', color: NAVY, minWidth: 76 }}>{formatUgx(c.amount)}</span>
                          </div>
                        );
                      })}
                      <div className="d-flex align-items-center gap-2 pt-2 fw-bold" style={{ fontSize: '0.74rem' }}>
                        <span className="flex-grow-1 text-muted text-uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.06em' }}>Total spent</span>
                        <span style={{ color: NAVY }}>{formatUgx(data.totalOut)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Col>
            </Row>

            {/* Cost bars — full width, biggest first */}
            <div className="d-flex align-items-center gap-2 mb-3">
              <Medallion icon="bi-cash-coin" color="#C0392B" bg="#FDEDEC" size={26} />
              <span className="fw-semibold" style={{ color: '#C0392B', fontSize: '0.85rem' }}>Where the money went — biggest costs first</span>
            </div>
            <div className="mb-4">
              {data.costs.length === 0 ? (
                <div className="text-muted small py-3">Nothing spent recorded for {monthLabel} yet.</div>
              ) : (
                data.costs.map(c => {
                  const share = data.totalOut > 0 ? (c.amount / data.totalOut) * 100 : 0;
                  return (
                    <div key={c.source + c.category} className="d-flex align-items-center gap-3 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="d-flex justify-content-between align-items-baseline gap-2">
                          <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>
                            {COST_LABEL[c.category] ?? c.category.replace(/_/g, ' ')}
                          </span>
                          <span className="fw-bold flex-shrink-0" style={{ color: '#C0392B', fontSize: '0.8rem' }}>
                            {formatUgx(c.amount)} <span className="text-muted fw-normal" style={{ fontSize: '0.68rem' }}>· {share.toFixed(1)}%</span>
                          </span>
                        </div>
                        <div className="mt-1"><Bar pct={share} color="#C0392B" /></div>
                        <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>
                          {c.count} {c.source === 'PAYROLL' ? (c.count === 1 ? 'run' : 'runs')
                            : c.source === 'REQUISITION' ? (c.count === 1 ? 'requisition' : 'requisitions')
                            : (c.count === 1 ? 'entry' : 'entries')} from {c.source === 'MANUAL' ? 'the manual ledger' : c.source.toLowerCase()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Six-month trend — grouped CSS bars, no chart library needed */}
            <div className="d-flex align-items-center gap-2 mb-3">
              <Medallion icon="bi-graph-up-arrow" color={NAVY} bg="#EBF5FB" size={26} />
              <span className="fw-semibold" style={{ color: NAVY, fontSize: '0.85rem' }}>Money in vs out — last six months</span>
              <div className="ms-auto d-flex gap-3 text-muted" style={{ fontSize: '0.68rem' }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#1E8449', marginRight: 4 }} />In</span>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#C0392B', marginRight: 4 }} />Out</span>
              </div>
            </div>
            <div className="d-flex gap-2" style={{ overflowX: 'auto' }}>
              {data.trend.map(m => (
                <div key={m.key} className="flex-fill d-flex flex-column align-items-center" style={{ minWidth: 64 }}>
                  <div className="d-flex align-items-end justify-content-center gap-1 w-100" style={{ height: 120 }}>
                    <div
                      title={`Money in ${formatUgx(m.moneyIn)}`}
                      style={{
                        width:      '26%', maxWidth: 24,
                        height:     `${m.moneyIn > 0 ? Math.max((m.moneyIn / trendMax) * 100, 2) : 0}%`,
                        background: '#1E8449', borderRadius: '3px 3px 0 0',
                      }}
                    />
                    <div
                      title={`Money out ${formatUgx(m.moneyOut)}`}
                      style={{
                        width:      '26%', maxWidth: 24,
                        height:     `${m.moneyOut > 0 ? Math.max((m.moneyOut / trendMax) * 100, 2) : 0}%`,
                        background: '#C0392B', borderRadius: '3px 3px 0 0',
                      }}
                    />
                  </div>
                  <div className="text-muted mt-1" style={{ fontSize: '0.68rem' }}>{m.label}</div>
                  <div className="fw-semibold text-nowrap" style={{ fontSize: '0.6rem', color: m.net < 0 ? '#C0392B' : '#1E8449' }}>
                    {m.net < 0 ? '-' : '+'}{formatUgx(Math.abs(m.net))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Reject a payment — the reason is required by the API */}
        {rejectTarget && (
          <Modal show centered onHide={() => setRejectTarget(null)} size="sm">
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: '1rem' }}>Reject payment</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="small mb-3">
                Rejecting <strong>{formatUgx(rejectTarget.amount)}</strong> from{' '}
                <strong>{rejectTarget.clientName}</strong> ({rejectTarget.invoiceNumber}).
              </p>
              <Form.Label className="small text-muted">Reason (required)</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. wrong amount, duplicate entry, needs correcting…"
              />
            </Modal.Body>
            <Modal.Footer>
              <Button size="sm" variant="outline-secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button size="sm" variant="danger" disabled={!rejectReason.trim() || busyId !== null} onClick={handleReject}>
                {busyId === rejectTarget.id ? <Spinner size="sm" animation="border" /> : 'Reject payment'}
              </Button>
            </Modal.Footer>
          </Modal>
        )}

        {/* Record a payment straight from the overdue list */}
        {payInvoice && (
          <RecordPaymentModal
            invoice={payInvoice}
            onClose={() => {
              setPayInvoice(null);
              // A recorded payment joins the approval queue immediately.
              queryClient.invalidateQueries({ queryKey: ['business-analysis'] });
            }}
          />
        )}
      </Card.Body>
    </Card>
  );
}

// ── Excel downloads — the secondary shelf, compact and icon-led ───────────────

function ExcelDownloadsSection() {
  const dailyOpsTitle = useReportTitle('daily_operations_report');
  const payrollTitle  = useReportTitle('monthly_payroll_report');
  const agingTitle    = useReportTitle('receivables_aging_report');
  const { showToast } = useToast();

  const today = new Date().toISOString().split('T')[0];
  const [opsDate, setOpsDate] = useState(today);
  const [prMonth, setPrMonth] = useState(new Date().getMonth() + 1);
  const [prYear,  setPrYear]  = useState(new Date().getFullYear());
  const [loading, setLoading] = useState<string | null>(null);

  async function download(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } catch { showToast('Download failed', 'danger'); }
    setLoading(null);
  }

  const downloads = [
    {
      key: 'ops', icon: 'bi-journal-text', title: dailyOpsTitle.title,
      desc: 'Guard deployments, attendance, incidents and check-ins for any day.',
      control: (
        <Form.Control type="date" size="sm" value={opsDate} onChange={(e) => setOpsDate(e.target.value)} style={{ maxWidth: 170 }} />
      ),
      run: () => reportsApi.downloadDailyOps(opsDate),
    },
    {
      key: 'ar', icon: 'bi-clipboard-data', title: agingTitle.title,
      desc: 'Outstanding invoices grouped by overdue period.',
      control: null,
      run: () => reportsApi.downloadARAgingExcel(),
    },
    {
      key: 'payroll', icon: 'bi-person-badge', title: payrollTitle.title,
      desc: 'Full payroll breakdown with guard-level salary and deductions.',
      control: (
        <>
          <Form.Select size="sm" value={prMonth} onChange={(e) => setPrMonth(+e.target.value)} style={{ width: 95 }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('en', { month: 'short' })}</option>)}
          </Form.Select>
          <Form.Control size="sm" type="number" value={prYear} onChange={(e) => setPrYear(+e.target.value)} style={{ width: 85 }} />
        </>
      ),
      run: () => reportsApi.downloadPayrollExcel(prMonth, prYear),
    },
    {
      key: 'inv', icon: 'bi-box-seam', title: 'Inventory Ledger',
      desc: 'All inventory transactions with running stock balance.',
      control: null,
      run: () => reportsApi.downloadInventoryLedger(),
    },
  ];

  return (
    <>
      <SectionLabel icon="bi-file-earmark-excel">Excel Downloads</SectionLabel>
      <Row className="g-3 mb-5">
        {downloads.map((d) => (
          <Col md={6} key={d.key}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="d-flex flex-column gap-2 p-3">
                <div className="d-flex align-items-center gap-2">
                  <Medallion icon={d.icon} color="#1E8449" bg="#E9F7EF" />
                  <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{d.title}</div>
                </div>
                <div className="text-muted small flex-grow-1">{d.desc}</div>
                <div className="d-flex gap-2 align-items-center pt-2 flex-wrap" style={{ borderTop: `1px solid ${LINE}` }}>
                  {d.control}
                  {d.key === 'payroll' && (
                    <Button size="sm" variant="outline-secondary" as="a" href="/payroll-report">
                      <i className="bi bi-box-arrow-up-right me-1" />Open report
                    </Button>
                  )}
                  <Button size="sm" variant="outline-primary" className="ms-auto" disabled={loading === d.key} onClick={() => download(d.key, d.run)}>
                    {loading === d.key ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-download me-1" />Download</>}
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}

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
            <Form.Control className="mt-2" placeholder="Cron expression e.g. 0 8 * * *" value={form.customCron} onChange={e => setForm(f => ({ ...f, customCron: e.target.value }))} />
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
                {email} X
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

// ── Scheduled reports ──────────────────────────────────────────────────────────

function ScheduledReportsSection() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);

  const { data: scheduled } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn:  reportsApi.getScheduledReports,
  });

  const deleteSchedule = useMutation({
    mutationFn: reportsApi.deleteScheduledReport,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['scheduled-reports'] }),
    onError:    () => showToast('Failed to delete', 'danger'),
  });

  return (
    <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER]}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <SectionLabel icon="bi-clock-history">Scheduled Reports</SectionLabel>
        <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowSchedule(true)}>
          <i className="bi bi-plus-lg me-1" />Add Schedule
        </Button>
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
      {showSchedule && <ScheduleFormModal onClose={() => setShowSchedule(false)} />}
    </RoleGuard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  // One period drives the whole financial block: the picker sits in the
  // Income & Expenses header and the Business Analysis below follows it.
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center gap-3 mb-4">
        <Medallion icon="bi-graph-up" color="#FFFFFF" bg={NAVY} size={44} />
        <div>
          <h4 className="fw-bold mb-0" style={{ color: NAVY }}>Reports</h4>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Finance and operations — the month at a glance.</div>
        </div>
      </div>

      {/* The priority: straight on the page, no modal to open. */}
      <IncomeExpensesSection
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      <BusinessAnalysisSection month={month} year={year} />

      <ExcelDownloadsSection />

      <ScheduledReportsSection />
    </Container>
  );
}
