import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Container, Row, Col, Card, Button, Form, Spinner, Badge, Table, Alert, Modal } from 'react-bootstrap';
import { useReportTitle } from '@/hooks/useReportTitles';
import { reportsApi } from '@/lib/reports.api';
import { zonesApi } from '@/lib/zones.api';
import { attendanceApi } from '@/lib/attendance.api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/context/ToastContext';

const NAVY = '#1B3A6B';
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Medallion({ icon, color, bg, size = 36 }: { icon: string; color: string; bg: string; size?: number }) {
  return (
    <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
          style={{ width: size, height: size, background: bg, color }}>
      <i className={`bi ${icon}`} style={{ fontSize: size * 0.45 }} />
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  PRESENT: 'success', LATE: 'info', SICK: 'warning', ON_LEAVE: 'secondary',
  ABSENT: 'danger', AWOL: 'danger', NOT_MARKED: 'light',
};

function statusBadge(s: string) {
  return <Badge bg={STATUS_COLOR[s] ?? 'secondary'} text={s === 'NOT_MARKED' ? 'dark' : undefined}>{s.replace(/_/g, ' ')}</Badge>;
}

export default function DeploymentReportPage() {
  const now = new Date();
  const [mode, setMode] = useState<'daily' | 'monthly'>('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [day,   setDay]   = useState(now.getDate());
  const [zoneFilter, setZoneFilter] = useState('');
  const [redeployTarget, setRedeployTarget] = useState<any>(null);
  const [availableGuards, setAvailableGuards] = useState<any[]>([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [replacementGuardId, setReplacementGuardId] = useState('');
  const [replacementReason, setReplacementReason] = useState('Absent guard replacement');
  const [replacementNote, setReplacementNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const params = mode === 'daily' ? { month, year, day } : { month, year };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deployment-report', mode, month, year, day],
    queryFn:  () => reportsApi.getDeploymentReport(params),
  });

  const { data: zonesData } = useQuery({
    queryKey: ['zones-all'],
    queryFn:  () => zonesApi.list({ isActive: true, limit: 200 }),
  });
  const allZones = (zonesData?.data ?? []).map((z: any) => z.name).filter(Boolean).sort();

  const allDeployments = data?.deployments ?? [];
  const allGuards = data?.guards ?? [];
  const allTransfers = data?.transfers ?? [];
  const derivedZones = [...new Set([...allDeployments.map((r: any) => r.zoneName), ...allGuards.map((g: any) => g.zoneName)].filter(Boolean))].sort();
  const zoneOptions = (allZones.length ? allZones : derivedZones) as string[];

  const filteredDeployments = zoneFilter
    ? allDeployments.filter((r: any) => r.zoneName === zoneFilter)
    : allDeployments;
  const filteredGuards = zoneFilter
    ? allGuards.filter((g: any) => g.zoneName === zoneFilter)
    : allGuards;
  const filteredTransfers = zoneFilter
    ? allTransfers.filter((t: any) => t.toZone === zoneFilter || t.fromZone === zoneFilter)
    : allTransfers;

  const filteredSummary = data ? (mode === 'daily'
    ? { ...data.summary, total: filteredDeployments.length,
        present: filteredDeployments.filter((r: any) => r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'LATE').length,
        absent: filteredDeployments.filter((r: any) => r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL').length,
        notMarked: filteredDeployments.filter((r: any) => !['PRESENT','LATE','ABSENT','AWOL'].includes(r.attendanceStatus)).length,
        uniqueGuards: new Set(filteredDeployments.map((r: any) => r.guardId)).size,
        uniqueSites: new Set(filteredDeployments.map((r: any) => r.siteName)).size,
      }
    : { ...data.summary,
        totalDeployments: filteredDeployments.length,
        present: filteredDeployments.filter((r: any) => r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'LATE').length,
        absent: filteredDeployments.filter((r: any) => r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL').length,
        notMarked: filteredDeployments.filter((r: any) => !['PRESENT','LATE','ABSENT','AWOL'].includes(r.attendanceStatus)).length,
        uniqueGuards: filteredGuards.length,
        uniqueSites: new Set(filteredDeployments.map((r: any) => r.siteName)).size,
        totalTransfers: filteredTransfers.length,
      }) : null;

  const handlePrint = () => {
    if (!data) { showToast('Nothing to print', 'warning'); return; }
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) { showToast('Pop-up blocked - allow pop-ups to print', 'danger'); return; }
    const monthLabel = MONTH_LABELS[month - 1];
    let body = '';
    if (mode === 'daily') {
      const rows = (filteredDeployments).map((r: any) =>
        `<tr><td>${r.guardName}</td><td>${r.siteName}</td><td>${r.zoneName}</td><td>${r.shiftType}</td><td>${r.attendanceStatus}</td></tr>`).join('');
      body = `<table><thead><tr><th>Guard</th><th>Site</th><th>Zone</th><th>Shift</th><th>Attendance</th></tr></thead><tbody>${rows}</tbody></table>
        <p><strong>Total:</strong> ${data.summary.total} deployments, ${data.summary.present} present, ${data.summary.absent} absent.</p>`;
    } else {
      const rows = (filteredGuards).map((g: any) =>
        `<tr><td>${g.guardName}</td><td>${g.siteName}</td><td>${g.zoneName}</td><td style="text-align:right">${g.daysDeployed}</td><td style="text-align:right">${g.daysPresent}</td><td style="text-align:right">${g.daysAbsent}</td></tr>`).join('');
      body = `<h2>Per-guard summary</h2><table><thead><tr><th>Guard</th><th>Site</th><th>Zone</th><th style="text-align:right">Days deployed</th><th style="text-align:right">Days present</th><th style="text-align:right">Days absent</th></tr></thead><tbody>${rows}</tbody></table>`;
      const trows = (filteredTransfers).map((t: any) =>
        `<tr><td>${t.date}</td><td>${t.guardName}</td><td>${t.fromSite}</td><td>${t.toSite}</td><td>${t.reason}</td><td>${t.authorisedBy}</td></tr>`).join('');
      if (trows) body += `<h2 style="margin-top:16px">Transfers</h2><table><thead><tr><th>Date</th><th>Guard</th><th>From</th><th>To</th><th>Reason</th><th>Authorised by</th></tr></thead><tbody>${trows}</tbody></table>`;
    }
    w.document.write(`<!doctype html><html><head><title>Deployment Report</title>
      <style>*{box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif}body{margin:24px;color:#1B3A6B}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px}th{background:#1B3A6B;color:#fff}@media print{body{margin:12px}}</style>
      </head><body><h1>Deployment Report - ${zoneFilter || 'Country-wide'} - ${mode === 'daily' ? `${day} ${monthLabel} ${year}` : `${monthLabel} ${year}`}</h1>
      <p style="color:#64748b;font-size:12px">Detailed deployment, attendance and transfers.</p>${body}
      <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
  };

  const openRedeploy = async (row: any) => {
    setRedeployTarget(row);
    setReplacementGuardId('');
    setReplacementReason('Absent guard replacement');
    setReplacementNote('');
    setAvailableGuards([]);
    setLoadingGuards(true);
    try {
      const guards = await attendanceApi.getAvailableReplacements({
        siteId: row.siteId,
        date: row.date,
        absentGuardId: row.guardId,
      });
      setAvailableGuards(guards ?? []);
    } catch (e) {
      showToast('Could not load replacement guards', 'danger');
    } finally {
      setLoadingGuards(false);
    }
  };

  const submitRedeploy = async () => {
    if (!redeployTarget || !replacementGuardId) { showToast('Select a replacement guard', 'warning'); return; }
    setSubmitting(true);
    try {
      await attendanceApi.assignReplacement({
        absentDeploymentId: redeployTarget.deploymentId,
        replacementGuardId,
        reason: replacementReason,
        note: replacementNote || undefined,
      } as any);
      showToast('Replacement guard deployed', 'success');
      setRedeployTarget(null);
      queryClient.invalidateQueries({ queryKey: ['deployment-report'] });
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Redeploy failed', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const monthLabel = MONTH_LABELS[month - 1];

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
        <Medallion icon="bi-people-fill" color="#FFFFFF" bg={NAVY} size={44} />
        <div className="flex-grow-1">
          <h4 className="fw-bold mb-0" style={{ color: NAVY }}>Deployment Report</h4>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            Detailed deployments, attendance (present/absent) and transfers - daily or monthly.
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <Form.Select size="sm" value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ width: 110 }}>
            <option value="monthly">Monthly</option>
            <option value="daily">Daily</option>
          </Form.Select>
          {mode === 'daily' ? (
            <>
              <Form.Control size="sm" type="date" value={`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) { setYear(d.getFullYear()); setMonth(d.getMonth() + 1); setDay(d.getDate()); } }}
                style={{ width: 150 }} />
            </>
          ) : (
            <>
              <Form.Select size="sm" value={month} onChange={(e) => setMonth(+e.target.value)} style={{ width: 100 }}>
                {MONTH_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Form.Select>
              <Form.Control size="sm" type="number" value={year} onChange={(e) => setYear(+e.target.value)} style={{ width: 90 }} />
            </>
          )}
          <Form.Select size="sm" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={{ width: 170 }}>
            <option value="">Country-wide (all zones)</option>
            {zoneOptions.map((z: string) => <option key={z} value={z}>{z}</option>)}
          </Form.Select>
          <Button size="sm" variant="outline-secondary" onClick={handlePrint}>
            <i className="bi bi-printer me-1" />Print
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
      ) : isError || !data ? (
        <Alert variant="danger">Could not load the deployment report.</Alert>
      ) : mode === 'daily' ? (
        <>
          <Row className="g-3 mb-4">
            {[
              { label: 'Deployments', value: filteredSummary?.total ?? 0, color: NAVY },
              { label: 'Present', value: filteredSummary?.present ?? 0, color: '#1E8449' },
              { label: 'Absent', value: filteredSummary?.absent ?? 0, color: '#C0392B' },
              { label: 'Not marked', value: filteredSummary?.notMarked ?? 0, color: '#6C757D' },
              { label: 'Guards', value: filteredSummary?.uniqueGuards ?? 0, color: '#B7770E' },
              { label: 'Sites', value: filteredSummary?.uniqueSites ?? 0, color: '#0E7490' },
            ].map((k) => (
              <Col xs={6} md={2} key={k.label}>
                <Card className="border-0 shadow-sm text-center">
                  <Card.Body className="py-2">
                    <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
                    <div className="fw-bold" style={{ color: k.color, fontSize: '1.2rem' }}>{k.value}</div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white fw-semibold py-2">Deployments - {zoneFilter || 'Country-wide'} - {day} {monthLabel} {year}</Card.Header>
            <Card.Body className="p-0">
              <Table striped responsive className="small mb-0">
                <thead className="table-light">
                  <tr><th>Guard</th><th>Site</th><th>Zone</th><th>Shift</th><th>Type</th><th>Attendance</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {(filteredDeployments).length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-3">No deployments recorded for this date / filter</td></tr>
                  ) : filteredDeployments.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.guardName}</td>
                      <td>{r.siteName}</td>
                      <td>{r.zoneName}</td>
                      <td>{r.shiftType}</td>
                      <td>{r.deploymentType}</td>
                      <td>
                      {statusBadge(r.attendanceStatus)}
                      {(r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL') && (
                        <Button size="sm" variant="outline-primary" className="ms-2 py-0" onClick={() => openRedeploy(r)}>
                          <i className="bi bi-arrow-repeat me-1" />Redeploy
                        </Button>
                      )}
                    </td>
                      <td className="text-muted">{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </>
      ) : (
        <>
          <Row className="g-3 mb-4">
            {[
              { label: 'Deployments', value: filteredSummary?.totalDeployments ?? 0, color: NAVY },
              { label: 'Present', value: filteredSummary?.present ?? 0, color: '#1E8449' },
              { label: 'Absent', value: filteredSummary?.absent ?? 0, color: '#C0392B' },
              { label: 'Not marked', value: filteredSummary?.notMarked ?? 0, color: '#6C757D' },
              { label: 'Guards', value: filteredSummary?.uniqueGuards ?? 0, color: '#B7770E' },
              { label: 'Sites', value: filteredSummary?.uniqueSites ?? 0, color: '#0E7490' },
              { label: 'Transfers', value: filteredSummary?.totalTransfers ?? 0, color: '#7C3AED' },
            ].map((k) => (
              <Col xs={6} md={2} key={k.label}>
                <Card className="border-0 shadow-sm text-center">
                  <Card.Body className="py-2">
                    <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
                    <div className="fw-bold" style={{ color: k.color, fontSize: '1.2rem' }}>{k.value}</div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          <Card className="border-0 shadow-sm mb-4">
            <Card.Header className="bg-white fw-semibold py-2">Per-guard summary - {zoneFilter || 'Country-wide'} - {monthLabel} {year}</Card.Header>
            <Card.Body className="p-0">
              <Table striped responsive className="small mb-0">
                <thead className="table-light">
                  <tr><th>Guard</th><th>Current site</th><th>Zone</th><th className="text-end">Days deployed</th><th className="text-end">Days present</th><th className="text-end">Days absent</th><th className="text-end">Not marked</th></tr>
                </thead>
                <tbody>
                  {(filteredGuards).length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-3">No deployments recorded for this period / filter</td></tr>
                  ) : filteredGuards.map((g: any, i: number) => (
                    <tr key={i}>
                      <td>{g.guardName}</td>
                      <td>{g.siteName}</td>
                      <td>{g.zoneName}</td>
                      <td className="text-end">{g.daysDeployed}</td>
                      <td className="text-end text-success">{g.daysPresent}</td>
                      <td className="text-end text-danger">{g.daysAbsent}</td>
                      <td className="text-end text-muted">{g.daysNotMarked}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-sm mb-4">
            <Card.Header className="bg-white fw-semibold py-2">Detailed deployment log - {zoneFilter || 'Country-wide'} - {monthLabel} {year}</Card.Header>
            <Card.Body className="p-0">
              <Table striped responsive className="small mb-0">
                <thead className="table-light">
                  <tr><th>Date</th><th>Guard</th><th>Site</th><th>Zone</th><th>Shift</th><th>Type</th><th>Attendance</th></tr>
                </thead>
                <tbody>
                  {(filteredDeployments).length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-3">No deployments recorded for this period / filter</td></tr>
                  ) : filteredDeployments.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="text-nowrap">{r.date}</td>
                      <td>{r.guardName}</td>
                      <td>{r.siteName}</td>
                      <td>{r.zoneName}</td>
                      <td>{r.shiftType}</td>
                      <td>{r.deploymentType}</td>
                      <td>
                      {statusBadge(r.attendanceStatus)}
                      {(r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL') && (
                        <Button size="sm" variant="outline-primary" className="ms-2 py-0" onClick={() => openRedeploy(r)}>
                          <i className="bi bi-arrow-repeat me-1" />Redeploy
                        </Button>
                      )}
                    </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {(filteredTransfers).length > 0 && (
            <Card className="border-0 shadow-sm mb-4">
              <Card.Header className="bg-white fw-semibold py-2">Deployment transfers - {zoneFilter || 'Country-wide'} - {monthLabel} {year}</Card.Header>
              <Card.Body className="p-0">
                <Table striped responsive className="small mb-0">
                  <thead className="table-light">
                    <tr><th>Date</th><th>Guard</th><th>From site</th><th>To site</th><th>Reason</th><th>Authorised by</th></tr>
                  </thead>
                  <tbody>
                    {filteredTransfers.map((t: any, i: number) => (
                      <tr key={i}>
                        <td className="text-nowrap">{t.date}</td>
                        <td>{t.guardName}</td>
                        <td>{t.fromSite}</td>
                        <td>{t.toSite}</td>
                        <td>{t.reason}</td>
                        <td>{t.authorisedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          )}
        </>
      )}

      <Modal show={!!redeployTarget} onHide={() => setRedeployTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Redeploy replacement guard</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {redeployTarget && (
            <div className="small text-muted mb-3">
              Replacing <strong>{redeployTarget.guardName}</strong> at <strong>{redeployTarget.siteName}</strong> on {redeployTarget.date}.
            </div>
          )}
          {loadingGuards ? (
            <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
          ) : availableGuards.length === 0 ? (
            <div className="text-muted small">No deployable guards available.</div>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label className="small">Replacement guard</Form.Label>
              <Form.Select value={replacementGuardId} onChange={(e) => setReplacementGuardId(e.target.value)}>
                <option value="">Select a guard?</option>
                {availableGuards.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName}{g.rank ? ` (${g.rank})` : ''}{g.alreadyDeployed ? ` ? already at ${g.deployedAt}` : ''}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="small">Reason</Form.Label>
            <Form.Control value={replacementReason} onChange={(e) => setReplacementReason(e.target.value)} />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small">Note (optional)</Form.Label>
            <Form.Control as="textarea" rows={2} value={replacementNote} onChange={(e) => setReplacementNote(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button size="sm" variant="outline-secondary" onClick={() => setRedeployTarget(null)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={submitting || !replacementGuardId} onClick={submitRedeploy}>
            {submitting ? <Spinner size="sm" animation="border" /> : 'Deploy replacement'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
