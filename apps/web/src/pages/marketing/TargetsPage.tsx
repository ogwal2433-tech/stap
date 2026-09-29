import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { TARGET_PERIOD_TYPES, type TargetPeriodType, MARKETING_MANAGER_ROLES } from '@security360/shared';
import { useTargets, useCreateTarget, useMarketingDashboard } from '../../hooks/useMarketing';
import { marketingApi } from '../../lib/marketing.api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';
const PIE_COLOURS = ['#1E8449', '#dc3545', '#F2AA20', '#1B3A6B', '#0F7B6C', '#6c757d', '#E8701A'];

const ugxM = (n: number) => `UGX ${(n / 1_000_000).toFixed(1)}M`;

/** Current month as the API's period key, e.g. "2026-08". */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function AssignTargetModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const create = useCreateTarget();
  // Sales officers, from the marketing module rather than the user directory:
  // /users is gated on roles a marketing head does not hold, so the dropdown
  // came back empty for the very role that assigns targets. This also narrows
  // it to the people a marketing target is actually for — it previously
  // offered every internal staff member, trainers and accountants included.
  const { data: staff = [] } = useQuery({
    queryKey: ['marketing', 'sales-staff'],
    queryFn:  marketingApi.salesStaff,
  });

  const [assignedToId, setAssignedToId] = useState('');
  const [periodType, setPeriodType]     = useState<TargetPeriodType>('MONTHLY');
  const [period, setPeriod]             = useState(currentMonth());
  const [targetLabel, setTargetLabel]   = useState('');
  const [targetValue, setTargetValue]   = useState<number | ''>('');
  const [targetClients, setClients]     = useState<number | ''>('');
  const [targetBids, setBids]           = useState<number | ''>('');
  const [error, setError]               = useState('');

  const submit = () => {
    if (!assignedToId)  { setError('Select the officer this target belongs to.'); return; }
    if (!period.trim()) { setError('Enter the period, e.g. 2026-08 or 2026-Q3.'); return; }
    if (!targetValue || Number(targetValue) <= 0) { setError('Enter a target value.'); return; }
    setError('');

    create.mutate(
      {
        assignedToId,
        period:        period.trim(),
        periodType,
        targetLabel:   targetLabel.trim() || period.trim(),
        targetValue:   Number(targetValue),
        targetClients: targetClients === '' ? null : Number(targetClients),
        targetBids:    targetBids === '' ? null : Number(targetBids),
      } as any,
      {
        onSuccess: () => { showToast('Target set', 'success'); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not set the target.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton><Modal.Title style={{ fontSize: '1.05rem' }}>Assign a target</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Officer <span className="text-danger">*</span></Form.Label>
          <SearchableSelect
            options={staff.map(u => ({ value: u.id, label: u.name, sublabel: u.email }))}
            value={assignedToId}
            onChange={(id) => { setAssignedToId(id); setError(''); }}
            placeholder="Select an officer…"
          />
        </Form.Group>

        <Row className="g-2 mb-3">
          <Col sm={5}>
            <Form.Label className="fw-bold small">Period type</Form.Label>
            <Form.Select value={periodType} onChange={(e) => setPeriodType(e.target.value as TargetPeriodType)}>
              {TARGET_PERIOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Form.Select>
          </Col>
          <Col sm={7}>
            <Form.Label className="fw-bold small">Period <span className="text-danger">*</span></Form.Label>
            <Form.Control value={period} placeholder="2026-08 · 2026-Q3 · 2026"
              onChange={(e) => { setPeriod(e.target.value); setError(''); }} />
            <Form.Text className="text-muted">
              Month as YYYY-MM, quarter as YYYY-Qn, year as YYYY.
            </Form.Text>
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Label</Form.Label>
          <Form.Control value={targetLabel} maxLength={60} placeholder="e.g. August 2026"
            onChange={(e) => setTargetLabel(e.target.value)} />
        </Form.Group>

        <Row className="g-2">
          <Col sm={5}>
            <Form.Label className="fw-bold small">Revenue target (UGX) <span className="text-danger">*</span></Form.Label>
            <Form.Control type="number" min={1} value={targetValue}
              onChange={(e) => { setTargetValue(e.target.value === '' ? '' : Number(e.target.value)); setError(''); }} />
          </Col>
          <Col sm={3}>
            <Form.Label className="fw-bold small">New clients</Form.Label>
            <Form.Control type="number" min={0} value={targetClients}
              onChange={(e) => setClients(e.target.value === '' ? '' : Number(e.target.value))} />
          </Col>
          <Col sm={4}>
            <Form.Label className="fw-bold small">Bids to submit</Form.Label>
            <Form.Control type="number" min={0} value={targetBids}
              onChange={(e) => setBids(e.target.value === '' ? '' : Number(e.target.value))} />
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Set target'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function TargetsPage() {
  const { user } = useAuth();
  const [showAssign, setShowAssign] = useState(false);

  const { data: targets = [], isLoading } = useTargets();
  const { data: dashboard }               = useMarketingDashboard();

  // Mirrors MARKETING_HEAD_ROLES on the route. Read from the shared constant
  // rather than spelled out again: the two drifted apart when the marketing
  // role was split, and the button vanished for the role that had just been
  // given the job.
  const canAssign = (MARKETING_MANAGER_ROLES as string[]).includes(user?.role ?? '');

  const mine = useMemo(
    () => targets.filter(t => t.assignedTo.id === user?.id),
    [targets, user?.id],
  );
  const current = dashboard?.currentTarget ?? mine[0] ?? targets[0] ?? null;

  // Monthly targets, oldest first, so the bars read left to right in time.
  const monthlyData = useMemo(
    () => targets
      .filter(t => t.periodType === 'MONTHLY')
      .slice()
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-6)
      .map(t => ({ month: t.targetLabel || t.period, target: t.targetValue, achieved: t.achievedValue })),
    [targets],
  );

  const conversionData = useMemo(
    () => (dashboard?.prospectsByStatus ?? [])
      .filter(s => s.count > 0)
      .map(s => ({ name: s.label.replace(/^\S+\s/, ''), value: s.count })),
    [dashboard],
  );

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Targets</h5>
        {canAssign && (
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowAssign(true)}>
            + Assign target
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          {current ? (
            <div style={{
              background: 'linear-gradient(135deg, #1B3A6B, #0F7B6C)',
              borderRadius: '0.75rem', padding: '24px', color: 'white', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '0.82rem', opacity: 0.8, marginBottom: '8px' }}>
                {current.periodType} target — {current.targetLabel} · {current.assignedTo.name}
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1 }}>
                {current.progressPct}%
              </div>
              <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.2)',
                            borderRadius: '10rem', height: '8px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, current.progressPct)}%`, height: '100%',
                  background: AMBER, borderRadius: '10rem', transition: 'width 0.3s',
                }} />
              </div>
              <Row className="mt-3 g-3">
                <Col xs={4}>
                  <div style={{ opacity: 0.8, fontSize: '0.72rem' }}>Target</div>
                  <div style={{ fontWeight: 700 }}>{ugxM(current.targetValue)}</div>
                </Col>
                <Col xs={4}>
                  <div style={{ opacity: 0.8, fontSize: '0.72rem' }}>Achieved</div>
                  <div style={{ fontWeight: 700, color: AMBER }}>{ugxM(current.achievedValue)}</div>
                </Col>
                <Col xs={4}>
                  <div style={{ opacity: 0.8, fontSize: '0.72rem' }}>Remaining</div>
                  <div style={{ fontWeight: 700 }}>
                    {ugxM(Math.max(0, current.targetValue - current.achievedValue))}
                  </div>
                </Col>
              </Row>
            </div>
          ) : (
            <Alert variant="secondary" className="py-2 small">
              No targets set yet.{canAssign ? ' Use “Assign target” to set one.' : ''}
            </Alert>
          )}

          <Row className="g-3 mb-4">
            <Col lg={7}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body>
                  <div className="fw-bold mb-2" style={{ color: NAVY }}>Target vs achievement</div>
                  {monthlyData.length === 0 ? (
                    <div className="text-muted small py-4 text-center">No monthly targets yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} fontSize={11} />
                        <Tooltip formatter={(value) => `UGX ${Number(value).toLocaleString()}`} />
                        <Legend />
                        <Bar dataKey="target"   name="Target"   fill={NAVY} />
                        <Bar dataKey="achieved" name="Achieved" fill={AMBER} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col lg={5}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body>
                  <div className="fw-bold mb-2" style={{ color: NAVY }}>Prospects by stage</div>
                  {conversionData.length === 0 ? (
                    <div className="text-muted small py-4 text-center">No prospects yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={conversionData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                          {conversionData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <div className="fw-bold mb-2" style={{ color: NAVY }}>All targets</div>
          <div style={{ overflowX: 'auto' }}>
            <Table striped size="sm" className="small">
              <thead className="table-light">
                <tr>
                  <th>Officer</th><th>Period</th><th>Type</th>
                  <th className="text-end">Target</th><th className="text-end">Achieved</th>
                  <th className="text-center">Progress</th>
                  <th className="text-center">Clients</th><th className="text-center">Bids</th>
                </tr>
              </thead>
              <tbody>
                {targets.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted py-4">No targets set.</td></tr>
                ) : targets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.assignedTo.name}</td>
                    <td>{t.targetLabel}</td>
                    <td>{t.periodType}</td>
                    <td className="text-end">{t.targetValue.toLocaleString()}</td>
                    <td className="text-end">{t.achievedValue.toLocaleString()}</td>
                    <td className="text-center fw-bold"
                      style={{ color: t.progressPct >= 100 ? '#1E8449' : t.progressPct >= 50 ? '#E8701A' : '#C0392B' }}>
                      {t.progressPct}%
                    </td>
                    <td className="text-center">{t.achievedClients}{t.targetClients != null ? ` / ${t.targetClients}` : ''}</td>
                    <td className="text-center">{t.achievedBids}{t.targetBids != null ? ` / ${t.targetBids}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      {showAssign && <AssignTargetModal onClose={() => setShowAssign(false)} />}
    </div>
  );
}
