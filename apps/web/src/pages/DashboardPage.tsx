import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Col, Container, ListGroup, Row, Spinner } from 'react-bootstrap';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../lib/reports.api';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/layout/NotificationBell';

const NAVY = '#1B3A6B';
const TEAL = '#0F7B6C';

function fmtUGX(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

interface KpiCardProps {
  icon:     string;
  title:    string;
  value:    string | number;
  sub?:     React.ReactNode;
  bg?:      string;
  onClick?: () => void;
}
function KpiCard({ icon, title, value, sub, bg = '#fff', onClick }: KpiCardProps) {
  return (
    <Card
      className="border-0 shadow-sm h-100"
      style={{ background: bg, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onClick={onClick}
    >
      <Card.Body className="d-flex flex-column gap-1 p-3">
        <div style={{ fontSize: '1.6rem' }}>{icon}</div>
        <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        <div className="fw-bold" style={{ fontSize: '1.5rem', color: NAVY }}>{value}</div>
        {sub && <div className="small">{sub}</div>}
      </Card.Body>
    </Card>
  );
}

function useClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function greeting(name: string): string {
  const h = new Date().getHours();
  return `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}, ${name}`;
}

const PIE_COLORS: Record<string, string> = {
  Present: '#16a34a', Absent: '#dc3545', Late: '#f59e0b', AWOL: '#1f2937',
};

export default function DashboardPage() {
  const navigate      = useNavigate();
  const { user, logout } = useAuth();
  const now           = useClock();

  const { data: stats, isLoading } = useQuery({
    queryKey:        ['director-dashboard'],
    queryFn:         reportsApi.getDirectorDashboard,
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!user) return null;

  const dateStr = now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) + ' EAT';

  if (isLoading || !stats) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
        <div className="text-muted small mt-2">Loading dashboard…</div>
      </Container>
    );
  }

  const { operations: ops, finance: fin, hr } = stats;

  const attendancePie = [
    { name: 'Present', value: Math.max(0, ops.guardsDeployedToday - ops.guardsAbsentToday) },
    { name: 'Absent',  value: ops.guardsAbsentToday },
  ].filter(s => s.value > 0);

  return (
    <div style={{ background: '#F2F4F7', minHeight: '100vh' }}>
      {/* Top bar */}
      <div className="d-flex align-items-center justify-content-between px-4 py-3 bg-white shadow-sm mb-4">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: NAVY }}>{greeting(user.name)}</h5>
          <div className="text-muted small">{dateStr}</div>
        </div>
        <div className="d-flex align-items-center gap-3">
          <div className="fw-semibold small" style={{ color: NAVY }}>{timeStr}</div>
          <NotificationBell />
          <Badge bg="primary">{user.role.replace(/_/g, ' ')}</Badge>
          <Button size="sm" variant="outline-secondary" onClick={logout}>Logout</Button>
        </div>
      </div>

      <Container fluid className="px-4">
        {/* Row 1: Operations KPIs */}
        <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>Operations</h6>
        <Row xs={2} md={3} lg={6} className="g-3 mb-4">
          <Col>
            <KpiCard icon="👮" title="Deployed Today" value={ops.guardsDeployedToday}
              sub={ops.guardsAbsentToday > 0 ? <span className="text-danger">{ops.guardsAbsentToday} absent</span> : undefined}
              onClick={() => navigate('/attendance')} />
          </Col>
          <Col>
            <KpiCard icon="📋" title="Open Complaints" value={ops.openComplaints}
              bg={ops.openComplaints > 0 ? '#fff7ed' : undefined}
              sub={ops.openComplaints > 0 ? <span className="text-warning">Requires attention</span> : undefined}
              onClick={() => navigate('/complaints')} />
          </Col>
          <Col>
            <KpiCard icon="✅" title="Pending Approvals" value={ops.pendingApprovals}
              bg={ops.pendingApprovals > 0 ? '#fefce8' : undefined}
              sub="Requisitions awaiting sign-off"
              onClick={() => navigate('/requisitions')} />
          </Col>
          <Col>
            <KpiCard icon="💰" title="Monthly Revenue" value={`UGX ${fmtUGX(fin.monthlyRevenue)}`}
              bg="#f0fdf4" sub="This month" onClick={() => navigate('/finance')} />
          </Col>
          <Col>
            <KpiCard icon="📄" title="Outstanding AR" value={`UGX ${fmtUGX(fin.outstandingAR)}`}
              bg={fin.outstandingAR > 0 ? '#fef2f2' : undefined}
              sub={fin.overdueInvoices > 0 ? <span className="text-danger">{fin.overdueInvoices} overdue</span> : undefined}
              onClick={() => navigate('/finance')} />
          </Col>
          <Col>
            <KpiCard icon="⚠️" title="Expiring Contracts" value={hr.expiringContracts}
              bg={hr.expiringContracts > 0 ? '#fefce8' : undefined}
              sub="Within 30 days" onClick={() => navigate('/clients')} />
          </Col>
        </Row>

        {/* Row 2: Charts */}
        <Row className="g-4 mb-4">
          <Col lg={8}>
            <Card className="border-0 shadow-sm">
              <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">Revenue vs Payroll Cost (6 months)</Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.revenueVsPayroll}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => fmtUGX(v as number)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => `UGX ${v.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue"      fill={NAVY} radius={[4,4,0,0]} />
                    <Bar dataKey="payroll" name="Payroll Cost" fill={TEAL} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={4}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">Attendance Today</Card.Header>
              <Card.Body className="d-flex align-items-center justify-content-center">
                {attendancePie.length === 0 ? (
                  <div className="text-center text-muted small">No attendance marked today</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={attendancePie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {attendancePie.map(entry => (
                          <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#8884d8'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v} guards`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Row 3: Trend + Quick Actions */}
        <Row className="g-4 mb-4">
          <Col lg={7}>
            <Card className="border-0 shadow-sm">
              <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">Attendance Trend (14 days)</Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.attendanceTrend}>
                    <defs>
                      <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gAbsent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#dc3545" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#dc3545" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={d => (d as string).slice(5)} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="present" name="Present" stroke="#16a34a" fill="url(#gPresent)" strokeWidth={2} />
                    <Area type="monotone" dataKey="absent"  name="Absent"  stroke="#dc3545" fill="url(#gAbsent)"  strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={5}>
            <Card className="border-0 shadow-sm">
              <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">Quick Actions</Card.Header>
              <ListGroup variant="flush">
                {([
                  ['📅', "Today's Roster",        '/attendance'],
                  ['👮', 'Add New Guard',          '/guards/new'],
                  ['🧾', 'Generate Invoice',        '/finance'],
                  ['📋', 'Review Requisitions',     '/requisitions'],
                  ['📊', 'Download Daily Report',   null],
                  ['📧', 'Scheduled Reports',       '/reports'],
                ] as [string, string, string | null][]).map(([icon, label, path]) => (
                  <ListGroup.Item
                    key={label}
                    action
                    className="small d-flex align-items-center gap-2 py-2"
                    onClick={() => {
                      if (path) navigate(path);
                      else reportsApi.downloadDailyOps().catch(() => {});
                    }}
                  >
                    <span>{icon}</span> {label}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Col>
        </Row>

        {/* Row 4: HR Snapshot */}
        <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>HR Snapshot</h6>
        <Row xs={2} md={4} className="g-3 mb-5">
          <Col><KpiCard icon="👮" title="Active Guards"             value={hr.totalActiveGuards}         bg="#eff6ff" /></Col>
          <Col><KpiCard icon="🆕" title="New This Month"            value={hr.newThisMonth}              bg="#f0fdf4" /></Col>
          <Col><KpiCard icon="⚠️" title="Open Disciplinary"         value={hr.openDisciplinary}          bg={hr.openDisciplinary > 0 ? '#fef2f2' : undefined} /></Col>
          <Col><KpiCard icon="✅" title="Supervisor Check-ins Today" value={ops.supervisorCheckinsToday} bg="#f0fdf4" /></Col>
        </Row>
      </Container>
    </div>
  );
}
