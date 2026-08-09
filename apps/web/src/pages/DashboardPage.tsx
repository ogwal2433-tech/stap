import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Container, ListGroup, Row, Spinner } from 'react-bootstrap';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { ROLES } from '@stap/shared';
import { reportsApi } from '../lib/reports.api';
import { dashboardApi } from '../lib/dashboard.api';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/layout/NotificationBell';
import RoleDashboard from './dashboard/RoleDashboard';

const NAVY = '#1B3A6B';

/** Roles that get the company-wide charts in addition to their stat cards. */
const CHART_ROLES: string[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

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
  const navigate         = useNavigate();
  const { user, logout } = useAuth();
  const now              = useClock();

  const isGuard   = user?.role === ROLES.GUARD;
  const showCharts = !!user && CHART_ROLES.includes(user.role);

  // Role-scoped figures — the API decides which keys each role receives.
  const { data: dash, isLoading } = useQuery({
    queryKey:        ['dashboard-stats', user?.role],
    queryFn:         dashboardApi.getStats,
    enabled:         !!user && !isGuard,
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  // Company-wide charts stay Director/Assistant Manager only.
  const { data: stats } = useQuery({
    queryKey:        ['director-dashboard'],
    queryFn:         reportsApi.getDirectorDashboard,
    enabled:         showCharts,
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!user) return null;

  const dateStr = now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) + ' EAT';

  const topBar = (
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
  );

  if (isGuard) {
    return (
      <div style={{ background: '#F2F4F7', minHeight: '100vh' }}>
        {topBar}
        <Container className="py-5">
          <Alert variant="info" className="mb-0">
            Self-service features for guards (viewing your own profile, attendance, and submitting leave
            requests) aren&apos;t available yet. Please contact your supervisor or the office for now.
          </Alert>
        </Container>
      </div>
    );
  }

  if (isLoading || !dash) {
    return (
      <div style={{ background: '#F2F4F7', minHeight: '100vh' }}>
        {topBar}
        <Container className="py-5 text-center">
          <Spinner animation="border" variant="primary" />
          <div className="text-muted small mt-2">Loading dashboard…</div>
        </Container>
      </div>
    );
  }

  const attendancePie = stats
    ? [
        { name: 'Present', value: Math.max(0, stats.operations.guardsDeployedToday - stats.operations.guardsAbsentToday) },
        { name: 'Absent',  value: stats.operations.guardsAbsentToday },
      ].filter(s => s.value > 0)
    : [];

  return (
    <div style={{ background: '#F2F4F7', minHeight: '100vh' }}>
      {topBar}

      <Container fluid className="px-4 pb-5">
        <RoleDashboard data={dash} />

        {showCharts && stats && (
          <>
            <h6 className="text-uppercase text-muted fw-semibold mb-3 mt-5" style={{ letterSpacing: '0.06em' }}>
              Trends
            </h6>
            <Row className="g-4 mb-4">
              <Col lg={8}>
                <Card className="border-0 shadow-sm">
                  <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">
                    Revenue vs Payroll — last 6 months
                  </Card.Header>
                  <Card.Body>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={stats.revenueVsPayroll}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="revenue" name="Revenue" fill="#1B3A6B" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="payroll" name="Payroll" fill="#0F7B6C" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card.Body>
                </Card>
              </Col>
              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100">
                  <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">
                    Attendance Today
                  </Card.Header>
                  <Card.Body>
                    {attendancePie.length === 0 ? (
                      <div className="text-muted small text-center py-5">No attendance marked today.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={attendancePie} dataKey="value" nameKey="name" outerRadius={80} label>
                            {attendancePie.map((s) => (
                              <Cell key={s.name} fill={PIE_COLORS[s.name]} />
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

            <Row className="g-4">
              <Col lg={7}>
                <Card className="border-0 shadow-sm">
                  <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">
                    Attendance Trend
                  </Card.Header>
                  <Card.Body>
                    <ResponsiveContainer width="100%" height={220}>
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" fontSize={11} />
                        <YAxis fontSize={11} />
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
                <Card className="border-0 shadow-sm h-100">
                  <Card.Header className="fw-semibold small bg-white border-0 pt-3 pb-0">Quick Actions</Card.Header>
                  <ListGroup variant="flush">
                    {([
                      ['📅', "Today's Roster",      '/attendance'],
                      ['👮', 'Add New Guard',        '/guards/new'],
                      ['🧾', 'Generate Invoice',     '/finance'],
                      ['📋', 'Review Requisitions',  '/requisitions'],
                      ['📊', 'Download Daily Report', null],
                      ['📧', 'Scheduled Reports',    '/reports'],
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
          </>
        )}
      </Container>
    </div>
  );
}
