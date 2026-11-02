import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Container, Row, Col, Card, Button, Form, Spinner, Badge, Table, Alert } from 'react-bootstrap';
import { useReportTitle } from '@/hooks/useReportTitles';
import { reportsApi } from '@/lib/reports.api';
import { useToast } from '@/context/ToastContext';

const NAVY = '#1B3A6B';
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LINE = '#E2E8F0';

function fmtUGX(n: number) { return (n ?? 0).toLocaleString(); }

function Medallion({ icon, color, bg, size = 36 }: { icon: string; color: string; bg: string; size?: number }) {
  return (
    <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
          style={{ width: size, height: size, background: bg, color }}>
      <i className={`bi ${icon}`} style={{ fontSize: size * 0.45 }} />
    </span>
  );
}

export default function PayrollReportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [scope, setScope] = useState<'ALL' | 'GUARD' | 'STAFF'>('ALL');
  const [zoneFilter, setZoneFilter] = useState('');
  const { showToast } = useToast();
  const payrollTitle = useReportTitle('monthly_payroll_report');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payroll-report', month, year],
    queryFn:  () => reportsApi.getPayroll(month, year),
  });

  const allRuns = data?.runs ?? [];
  const guardZones = [...new Set(allRuns.filter((r) => r.runType === 'GUARD').map((r) => r.zoneName))].sort();
  const filteredRuns = allRuns.filter((r) => {
    if (scope === 'GUARD' && r.runType !== 'GUARD') return false;
    if (scope === 'STAFF' && r.runType !== 'STAFF') return false;
    if (zoneFilter && r.zoneName !== zoneFilter) return false;
    return true;
  });
  const filteredTotals = {
    runs: filteredRuns.length,
    payslips: filteredRuns.reduce((a, r) => a + r.payslips.length, 0),
    gross: filteredRuns.reduce((a, r) => a + r.totalGross, 0),
    deductions: filteredRuns.reduce((a, r) => a + r.totalDeductions, 0),
    net: filteredRuns.reduce((a, r) => a + r.totalNet, 0),
  };
  const filtersActive = scope !== 'ALL' || !!zoneFilter;

  const handleExcel = async () => {
    try { await reportsApi.downloadPayrollExcel(month, year); }
    catch { showToast('Download failed', 'danger'); }
  };

  const handlePrint = () => {
    if (!data?.hasPayroll) { showToast('No payroll to print for this period', 'warning'); return; }
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { showToast('Pop-up blocked - allow pop-ups to print', 'danger'); return; }
    const rows = data.runs.map((r) =>
      `<tr>
        <td>${r.zoneName}</td>
        <td>${r.runType}</td>
        <td>${r.status.replace(/_/g, ' ')}</td>
        <td style="text-align:right">${r.payslips.length}</td>
        <td style="text-align:right">${r.totalGross.toLocaleString()}</td>
        <td style="text-align:right">${r.totalDeductions.toLocaleString()}</td>
        <td style="text-align:right;font-weight:700">${r.totalNet.toLocaleString()}</td>
      </tr>`).join('');
    const monthLabel = MONTH_LABELS[month - 1];
    w.document.write(`<!doctype html><html><head><title>Payroll Report ${monthLabel} ${year}</title>
      <style>
        *{box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif}
        body{margin:24px;color:#1B3A6B}
        h1{font-size:18px;margin:0 0 4px}
        .sub{color:#64748b;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px}
        th{background:#1B3A6B;color:#fff;text-align:left}
        tfoot td{font-weight:700;background:#f1f5f9}
        .totalbox{margin-top:16px;padding:12px;border:2px solid #1B3A6B;border-radius:8px;display:inline-block}
        @media print{body{margin:12px}}
      </style></head><body>
      <h1>${payrollTitle.title} - ${monthLabel} ${year}</h1>
      <div class="sub">Country-wide payment summary (all zones, company-wide and staff). Printed ${new Date().toLocaleString('en-GB')}.</div>
      <table>
        <thead><tr><th>Run</th><th>Type</th><th>Status</th><th style="text-align:right">Payslips</th><th style="text-align:right">Gross (UGX)</th><th style="text-align:right">Deductions (UGX)</th><th style="text-align:right">Net (UGX)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTAL (${data.totals.runs} run${data.totals.runs === 1 ? '' : 's'})</td>
          <td style="text-align:right">${data.totals.payslips}</td>
          <td style="text-align:right">${data.totals.gross.toLocaleString()}</td>
          <td style="text-align:right">${data.totals.deductions.toLocaleString()}</td>
          <td style="text-align:right">${data.totals.net.toLocaleString()}</td>
        </tr></tfoot>
      </table>
      <div class="totalbox">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Overall total to be paid</div>
        <div style="font-size:20px;font-weight:800">${data.totals.net.toLocaleString()} UGX</div>
        <div style="font-size:11px;color:#64748b">${data.totals.payslips} payslips across ${data.totals.runs} run${data.totals.runs === 1 ? '' : 's'}</div>
      </div>
      <script>window.onload=function(){window.print();};</script>
      </body></html>`);
    w.document.close();
  };

  const monthLabel = MONTH_LABELS[month - 1];

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
        <Medallion icon="bi-file-earmark-spreadsheet" color="#FFFFFF" bg={NAVY} size={44} />
        <div className="flex-grow-1">
          <h4 className="fw-bold mb-0" style={{ color: NAVY }}>Payroll Report</h4>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            Country-wide payment summary and per-guard payment details for any period.
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <Form.Select size="sm" value={month} onChange={(e) => setMonth(+e.target.value)} style={{ width: 100 }}>
            {MONTH_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Form.Select>
          <Form.Control size="sm" type="number" value={year} onChange={(e) => setYear(+e.target.value)} style={{ width: 90 }} />
          <Form.Select size="sm" value={scope} onChange={(e) => { setScope(e.target.value as any); if (e.target.value === 'STAFF') setZoneFilter(''); }} style={{ width: 110 }}>
            <option value="ALL">All (guards + staff)</option>
            <option value="GUARD">Guards only</option>
            <option value="STAFF">Staff only</option>
          </Form.Select>
          {scope !== 'STAFF' && guardZones.length > 0 && (
            <Form.Select size="sm" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={{ width: 180 }}>
              <option value="">All zones</option>
              {guardZones.map((z) => <option key={z} value={z}>{z}</option>)}
            </Form.Select>
          )}
          <Button size="sm" variant="outline-secondary" onClick={handlePrint} title="Print the country-wide summary">
            <i className="bi bi-printer me-1" />Print
          </Button>
          <Button size="sm" variant="outline-primary" onClick={handleExcel} title="Download the full payroll as Excel">
            <i className="bi bi-download me-1" />Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
      ) : isError || !data ? (
        <Alert variant="danger">Could not load the payroll report.</Alert>
      ) : !data.hasPayroll ? (
        <Alert variant="warning">
          <i className="bi bi-info-circle me-2" />
          No payroll run found for {monthLabel} {year}. Calculate payroll for this period first.
        </Alert>
      ) : (
        <>
          {/* Country-wide summary */}
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-4">
              <div className="d-flex align-items-center gap-2 mb-3">
                <Medallion icon="bi-globe2" color={NAVY} bg="#EBF5FB" size={26} />
                <span className="fw-semibold" style={{ color: NAVY, fontSize: '0.9rem' }}>Country-wide payment summary</span>
                <Badge bg="light" text="dark" className="ms-2">{filteredTotals.runs} run{filteredTotals.runs === 1 ? '' : 's'}{filtersActive ? ' (filtered)' : ''}</Badge>
              </div>
              <Table striped bordered responsive className="small mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Run</th><th>Type</th><th>Status</th>
                    <th className="text-end">Payslips</th>
                    <th className="text-end">Gross (UGX)</th>
                    <th className="text-end">Deductions (UGX)</th>
                    <th className="text-end">Net (UGX)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="fw-semibold">{r.zoneName}</td>
                      <td>{r.runType}</td>
                      <td>{r.status.replace(/_/g, ' ')}</td>
                      <td className="text-end">{r.payslips.length}</td>
                      <td className="text-end">{fmtUGX(r.totalGross)}</td>
                      <td className="text-end">{fmtUGX(r.totalDeductions)}</td>
                      <td className="text-end fw-bold">{fmtUGX(r.totalNet)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fw-bold" style={{ background: '#F1F5F9' }}>
                    <td colSpan={3}>TOTAL</td>
                    <td className="text-end">{filteredTotals.payslips}</td>
                    <td className="text-end">{fmtUGX(filteredTotals.gross)}</td>
                    <td className="text-end">{fmtUGX(filteredTotals.deductions)}</td>
                    <td className="text-end">{fmtUGX(filteredTotals.net)}</td>
                  </tr>
                </tfoot>
              </Table>

              <Row className="g-3 mt-3">
                <Col xs={6} md={3}>
                  <Card className="border-0" style={{ background: '#EBF5FB' }}>
                    <Card.Body className="py-2 px-3">
                      <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Payslips</div>
                      <div className="fw-bold" style={{ color: NAVY, fontSize: '1.2rem' }}>{filteredTotals.payslips}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="border-0" style={{ background: '#E9F7EF' }}>
                    <Card.Body className="py-2 px-3">
                      <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Gross</div>
                      <div className="fw-bold" style={{ color: '#1E8449', fontSize: '1.1rem' }}>{fmtUGX(filteredTotals.gross)}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="border-0" style={{ background: '#FDEDEC' }}>
                    <Card.Body className="py-2 px-3">
                      <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Deductions</div>
                      <div className="fw-bold" style={{ color: '#C0392B', fontSize: '1.1rem' }}>{fmtUGX(filteredTotals.deductions)}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="border-0" style={{ background: '#FFFDF4', border: '1px solid #F3E3B3' }}>
                    <Card.Body className="py-2 px-3">
                      <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Net to pay</div>
                      <div className="fw-bold" style={{ color: '#B7770E', fontSize: '1.1rem' }}>{fmtUGX(filteredTotals.net)}</div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {filteredRuns.length === 0 && filtersActive ? (
            <Alert variant="info">
              <i className="bi bi-info-circle me-2" />
              No runs match the selected filter. Clear the filter to see all.
            </Alert>
          ) : null}

          {/* Per-run payment details */}
          <div className="d-flex align-items-center gap-2 mb-3">
            <Medallion icon="bi-list-check" color={NAVY} bg="#EBF5FB" size={26} />
            <span className="fw-semibold" style={{ color: NAVY, fontSize: '0.9rem' }}>Payment details per guard / staff</span>
          </div>

          {filteredRuns.map((r) => (
            <Card className="border-0 shadow-sm mb-3" key={r.id}>
              <Card.Header className="bg-white d-flex align-items-center justify-content-between py-2">
                <div className="d-flex align-items-center gap-2">
                  <Medallion icon={r.runType === 'STAFF' ? 'bi-person-badge' : 'bi-shield-fill'} color="#1E8449" bg="#E9F7EF" size={24} />
                  <span className="fw-semibold" style={{ fontSize: '0.9rem' }}>{r.zoneName}</span>
                  <Badge bg="light" text="dark">{r.runType}</Badge>
                  <Badge bg={r.status === 'MD_APPROVED' ? 'success' : r.status === 'HR_APPROVED' ? 'info' : 'secondary'}>{r.status.replace(/_/g, ' ')}</Badge>
                </div>
                <span className="text-muted small">{r.payslips.length} payslip{r.payslips.length === 1 ? '' : 's'} · Net {fmtUGX(r.totalNet)}</span>
              </Card.Header>
              <Card.Body className="p-0">
                <Table striped responsive className="small mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th><th>Phone</th><th className="text-end">Gross</th>
                      <th className="text-end">Deductions</th><th className="text-end">Net</th>
                      <th className="text-center">Days</th><th>Disbursement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.payslips.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted py-3">No payslips in this run</td></tr>
                    ) : r.payslips.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name || '—'}</td>
                        <td className="text-muted">{p.phone || '—'}</td>
                        <td className="text-end">{fmtUGX(p.grossSalary)}</td>
                        <td className="text-end">{fmtUGX(p.totalDeductions)}</td>
                        <td className="text-end fw-semibold">{fmtUGX(p.netSalary)}</td>
                        <td className="text-center">{p.daysWorked}</td>
                        <td>{r.status === 'MD_APPROVED' ? 'Cleared' : (p.disbursementStatus || 'Pending')}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          ))}

          <div className="text-muted small mt-2">
            <i className="bi bi-info-circle me-1" />
            Print exports the country-wide summary only; use Excel for the full per-guard detail.
          </div>
        </>
      )}
    </Container>
  );
}
