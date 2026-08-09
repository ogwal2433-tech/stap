import { useNavigate } from 'react-router-dom';
import {
  Badge, Breadcrumb, Button, Card, Col, ListGroup, Row, Spinner, Table,
} from 'react-bootstrap';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { GUARD_STATUS_CONFIG, guardStatusLabel, type GuardEmploymentStatus } from '@stap/shared';
import { useGuardDashboard, useRecentGuardActivity } from '../../hooks/useGuards';

const NAVY = '#1B3A6B';

const RANKS = ['🥇', '🥈', '🥉', '4', '5'];

const STATUS_HEX: Record<string, string> = {
  ACTIVE:     '#1E8449',
  ON_LEAVE:   '#17A2B8',
  SUSPENDED:  '#E8701A',
  RESIGNED:   '#6C757D',
  TERMINATED: '#C0392B',
};

const PIE_COLORS = STATUS_HEX;

function formatDate(iso: string): string {
  const [, mm, dd] = iso.split('-');
  return `${dd}/${mm}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_DOT = STATUS_HEX;

interface StatCardProps {
  icon:     string;
  label:    string;
  value:    number;
  sub:      React.ReactNode;
  bg:       string;
  onClick?: () => void;
}

function StatCard({ icon, label, value, sub, bg, onClick }: StatCardProps) {
  return (
    <Card
      className="border-0 shadow-sm h-100"
      style={{ background: bg, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <Card.Body className="p-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span style={{ fontSize: '1.6rem' }}>{icon}</span>
          <span className="fs-1 fw-bold" style={{ color: NAVY }}>{value}</span>
        </div>
        <div className="fw-semibold small" style={{ color: NAVY }}>{label}</div>
        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{sub}</div>
      </Card.Body>
    </Card>
  );
}

export default function GuardDashboardPage() {
  const navigate  = useNavigate();
  const { data: stats, isLoading } = useGuardDashboard();
  const { data: activity = [] }    = useRecentGuardActivity();

  if (isLoading || !stats) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '60vh' }}>
        <Spinner animation="border" style={{ color: NAVY }} />
      </div>
    );
  }

  return (
    <div className="py-4 px-3">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
          Dashboard
        </Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>
          Guards
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Overview</Breadcrumb.Item>
      </Breadcrumb>

      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0" style={{ color: NAVY }}>Guard Overview</h4>
        <Button size="sm" variant="outline-secondary" onClick={() => navigate('/guards')}>
          View Guard List
        </Button>
      </div>

      {/* ── Row 1: KPI cards ──────────────────────────────────────────────────── */}
      <Row className="g-3 mb-4">
        <Col xs={6} lg={3}>
          <StatCard
            icon="👮" label="Active Guards" value={stats.totalActive}
            bg="#EBF5FB"
            sub={<>{stats.newThisMonth} joined this month</>}
            onClick={() => navigate('/guards?status=ACTIVE')}
          />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard
            icon="📅" label="Deployed Today" value={stats.deployedToday}
            bg="#E9F7EF"
            sub={
              <span style={{ color: stats.absentToday > 0 ? '#C0392B' : 'inherit' }}>
                {stats.absentToday} absent/AWOL today
              </span>
            }
            onClick={() => navigate('/attendance')}
          />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard
            icon="⚠️" label="Suspended" value={stats.totalSuspended}
            bg={stats.totalSuspended > 0 ? '#FEF9E7' : '#F4F6F7'}
            sub="Pending review"
            onClick={() => navigate('/guards?status=SUSPENDED')}
          />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard
            icon="🚫" label="Terminated" value={stats.totalTerminated}
            bg={stats.totalTerminated > 0 ? '#FDEDEC' : '#F4F6F7'}
            sub="Total terminated"
            onClick={() => navigate('/guards?status=TERMINATED')}
          />
        </Col>
      </Row>

      {/* ── Row 2: Charts ─────────────────────────────────────────────────────── */}
      <Row className="g-3 mb-4">
        {/* Attendance trend */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold border-0 pt-3 pb-0">
              Attendance Trend — Last 14 Days
            </Card.Header>
            <Card.Body>
              {stats.attendanceTrend.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center text-muted"
                  style={{ height: 220 }}>
                  No attendance data yet. Start marking attendance to see trends.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.attendanceTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="present" stackId="1" stroke="#1E8449" fill="#A9DFBF" name="present" />
                    <Area type="monotone" dataKey="late"    stackId="1" stroke="#E8701A" fill="#FAD7A0" name="late"    />
                    <Area type="monotone" dataKey="absent"  stackId="1" stroke="#C0392B" fill="#F5B7B1" name="absent"  />
                    <Area type="monotone" dataKey="awol"    stackId="1" stroke="#1A1A1A" fill="#D5D8DC" name="awol"    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Guard status donut */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold border-0 pt-3 pb-0">
              Guards by Status
            </Card.Header>
            <Card.Body className="d-flex flex-column align-items-center justify-content-center">
              {stats.totalGuards === 0 ? (
                <div className="text-muted small">No guards yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.guardsByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%" cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {stats.guardsByStatus.map((entry) => (
                        <Cell key={entry.status} fill={PIE_COLORS[entry.status] ?? '#aaa'} />
                      ))}
                    </Pie>
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: 22, fontWeight: 700, fill: NAVY }}>
                      {stats.totalGuards}
                    </text>
                    <Tooltip />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => `${value} (${stats.guardsByStatus.find(s => s.status === value)?.count ?? 0})`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ── Row 3: Tables ─────────────────────────────────────────────────────── */}
      <Row className="g-3 mb-4">
        {/* Top sites */}
        <Col lg={7}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold border-0 pt-3">
              Most Active Sites This Month
            </Card.Header>
            <Card.Body className="p-0">
              {stats.topSitesByDeployment.length === 0 ? (
                <div className="p-4 text-muted small">No deployment data yet.</div>
              ) : (
                <Table striped className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 50 }}>Rank</th>
                      <th>Site</th>
                      <th>Client</th>
                      <th className="text-end">Guards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topSitesByDeployment.map((site, i) => (
                      <tr key={i}>
                        <td className="text-center">{RANKS[i] ?? i + 1}</td>
                        <td className="fw-medium">{site.siteName}</td>
                        <td className="text-muted small">{site.clientName}</td>
                        <td className="text-end">
                          <Badge bg="primary" pill>{site.count}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
            <Card.Footer className="bg-white border-0 pt-0">
              <Button
                size="sm" variant="link" className="p-0 text-decoration-none"
                style={{ color: NAVY }}
                onClick={() => navigate('/attendance')}
              >
                View All Deployments →
              </Button>
            </Card.Footer>
          </Card>
        </Col>

        {/* Quick actions */}
        <Col lg={5}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold border-0 pt-3">
              Quick Actions
            </Card.Header>
            <Card.Body className="p-0">
              <ListGroup variant="flush">
                {[
                  { icon: '➕', label: 'Add New Guard',       path: '/guards/new'    },
                  { icon: '📥', label: 'Bulk Import Guards',   path: '/guards/import' },
                  { icon: '📅', label: "View Today's Roster", path: '/attendance'    },
                  { icon: '📊', label: 'Mark Attendance',      path: '/attendance'    },
                ].map(({ icon, label, path }) => (
                  <ListGroup.Item
                    key={label}
                    action
                    onClick={() => navigate(path)}
                    className="d-flex align-items-center justify-content-between px-3 py-2"
                  >
                    <span>{icon} {label}</span>
                    <i className="bi bi-chevron-right text-muted" style={{ fontSize: '0.75rem' }} />
                  </ListGroup.Item>
                ))}
                <ListGroup.Item className="d-flex align-items-center justify-content-between px-3 py-2 text-muted">
                  <span>📄 Generate Report</span>
                  <Badge bg="secondary" style={{ fontSize: '0.65rem' }}>Coming Soon</Badge>
                </ListGroup.Item>
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ── Row 4: Recent Activity ─────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white fw-semibold border-0 pt-3">
          Recent Guard Activity
        </Card.Header>
        <Card.Body>
          {activity.length === 0 ? (
            <div className="text-muted small">No recent guard activity.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activity.map((g) => (
                <div key={g.id} className="d-flex align-items-center gap-3">
                  <div
                    style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_DOT[g.employmentStatus] ?? '#aaa',
                    }}
                  />
                  <div className="flex-grow-1">
                    <span
                      className="fw-medium"
                      style={{ cursor: 'pointer', color: NAVY }}
                      onClick={() => navigate(`/guards/${g.id}`)}
                    >
                      {g.fullName}
                    </span>
                    {' '}
                    <Badge
                      bg={GUARD_STATUS_CONFIG[g.employmentStatus as GuardEmploymentStatus]?.colour ?? 'secondary'}
                      text={['warning', 'info'].includes(
                        GUARD_STATUS_CONFIG[g.employmentStatus as GuardEmploymentStatus]?.colour ?? '',
                      ) ? 'dark' : undefined}
                      className="ms-1"
                      style={{ fontSize: '0.65rem' }}
                    >
                      {guardStatusLabel(g.employmentStatus)}
                    </Badge>
                  </div>
                  <div className="text-muted small">{timeAgo(g.updatedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
