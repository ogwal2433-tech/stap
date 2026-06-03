import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Col, Row, Spinner, Table,
} from 'react-bootstrap';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useAttendanceDashboard } from '../../hooks/useAttendance';
import InitialsAvatar from '../../components/ui/InitialsAvatar';

// ── Stat card ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:   string;
  value:   string | number;
  subtext?: string;
  color:   string;
  icon:    string;
  pulse?:  boolean;
  loading: boolean;
}

function StatCard({ label, value, subtext, color, icon, pulse, loading }: StatCardProps) {
  return (
    <Col xs={6} md={4} lg={2}>
      <Card className="h-100 border-0 shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
        <Card.Body className="py-3 px-3">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <small style={{ color: '#6c757d', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {label}
            </small>
            <span style={{ fontSize: '1.2rem' }}>{icon}</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>
            {loading ? '—' : value}
          </div>
          {subtext && (
            <small style={{ color: '#6c757d', fontSize: '0.72rem' }}>{subtext}</small>
          )}
          {pulse && !loading && Number(value) > 0 && (
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%', background: color,
              marginTop: '4px', animation: 'pulse 2s infinite',
            }} />
          )}
        </Card.Body>
      </Card>
    </Col>
  );
}

// ── Bar chart data ─────────────────────────────────────────────────────────────

const BAR_COLORS = ['#1E8449', '#E8701A', '#C0392B', '#922B21', '#95A5A6'];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AttendanceDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useAttendanceDashboard();

  if (isError) {
    return (
      <Alert variant="danger">
        <Alert.Heading>Failed to load attendance dashboard</Alert.Heading>
        <p>{(error as Error)?.message ?? 'An unexpected error occurred.'}</p>
        <Button variant="outline-danger" onClick={() => refetch()}>Try Again</Button>
      </Alert>
    );
  }

  const barData = [
    { name: 'Present',  count: data?.presentCount  ?? 0 },
    { name: 'Late',     count: data?.lateCount      ?? 0 },
    { name: 'Absent',   count: data?.absentCount    ?? 0 },
    { name: 'AWOL',     count: data?.awolCount      ?? 0 },
    { name: 'Unmarked', count: data?.unmarkedCount  ?? 0 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: '#1B3A6B' }}>Attendance Dashboard</h4>
          <small className="text-muted">
            📅{' '}
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}
            Auto-refreshes every 2 minutes
          </small>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" onClick={() => refetch()}>
            🔄 Refresh
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => navigate('/attendance')}>
            📋 View Sheet
          </Button>
        </div>
      </div>

      {/* Row 1: Stat cards */}
      <Row className="g-3 mb-4">
        <StatCard
          label="Deployed Today"
          value={data?.totalDeployed ?? 0}
          subtext="active deployments"
          color="#1B3A6B"
          icon="👮"
          loading={isLoading}
        />
        <StatCard
          label="Present"
          value={(data?.presentCount ?? 0) + (data?.lateCount ?? 0)}
          subtext={`${data?.attendanceRate ?? 0}% attendance rate`}
          color="#1E8449"
          icon="✅"
          loading={isLoading}
        />
        <StatCard
          label="Absent"
          value={data?.absentCount ?? 0}
          subtext="marked absent"
          color="#C0392B"
          icon="❌"
          pulse
          loading={isLoading}
        />
        <StatCard
          label="AWOL"
          value={data?.awolCount ?? 0}
          subtext="without notice"
          color="#922B21"
          icon="🚨"
          pulse={(data?.awolCount ?? 0) > 0}
          loading={isLoading}
        />
        <StatCard
          label="Unmarked"
          value={data?.unmarkedCount ?? 0}
          subtext="not yet recorded"
          color="#E8701A"
          icon="⏳"
          pulse={(data?.unmarkedCount ?? 0) > 0}
          loading={isLoading}
        />
        <StatCard
          label="Weekly Avg"
          value={`${data?.weeklyAvgRate ?? 0}%`}
          subtext="7-day attendance rate"
          color="#0F7B6C"
          icon="📊"
          loading={isLoading}
        />
      </Row>

      {/* Row 2: Charts */}
      <Row className="g-3 mb-4">
        {/* Line chart — 7-day rate */}
        <Col lg={7}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom-0 pt-3 pb-0">
              <div className="fw-bold" style={{ color: '#1B3A6B' }}>📈 Attendance Rate — Last 7 Days</div>
              <small className="text-muted">Percentage of deployed guards marked present or late</small>
            </Card.Header>
            <Card.Body>
              {isLoading ? (
                <div className="d-flex align-items-center justify-content-center" style={{ height: 220 }}>
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data?.weeklyTrend ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#6c757d' }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#6c757d' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Attendance Rate']}
                      labelStyle={{ fontWeight: 600 }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '0.82rem' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#1B3A6B"
                      strokeWidth={2.5}
                      dot={(props: { cx?: number; cy?: number; payload?: { date?: string; isToday?: boolean } }) => {
                        const { cx = 0, cy = 0, payload = {} } = props;
                        return (
                          <circle
                            key={`dot-${payload.date ?? ''}`}
                            cx={cx} cy={cy} r={4}
                            fill={payload.isToday ? '#0F7B6C' : '#1B3A6B'}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ r: 6, fill: '#0F7B6C' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Bar chart — today's breakdown */}
        <Col lg={5}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom-0 pt-3 pb-0">
              <div className="fw-bold" style={{ color: '#1B3A6B' }}>📊 Today's Breakdown</div>
              <small className="text-muted">Status distribution across all deployments</small>
            </Card.Header>
            <Card.Body>
              {isLoading ? (
                <div className="d-flex align-items-center justify-content-center" style={{ height: 220 }}>
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6c757d' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [value, 'Guards']}
                      contentStyle={{ borderRadius: '8px', fontSize: '0.82rem' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {barData.map((_, index) => (
                        <Cell key={index} fill={BAR_COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Row 3: Sites with missing attendance */}
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Header className="bg-white d-flex align-items-center justify-content-between pt-3 pb-2">
          <div>
            <div className="fw-bold" style={{ color: '#1B3A6B' }}>⏳ Sites With Missing Attendance</div>
            <small className="text-muted">Sites where not all guards have been marked yet today</small>
          </div>
          {(data?.sitesWithMissingAttendance.length ?? 0) > 0 && (
            <Badge bg="warning" text="dark" style={{ fontSize: '0.8rem' }}>
              {data?.sitesWithMissingAttendance.length} site{data?.sitesWithMissingAttendance.length !== 1 ? 's' : ''} pending
            </Badge>
          )}
        </Card.Header>
        <Card.Body className="p-0">
          {isLoading ? (
            <div className="p-4 text-center">
              <Spinner size="sm" animation="border" /> Loading...
            </div>
          ) : (data?.sitesWithMissingAttendance.length ?? 0) === 0 ? (
            <div className="p-4 text-center">
              <div style={{ fontSize: '2rem' }}>✅</div>
              <div className="fw-bold text-success mt-1">All attendance marked for today</div>
              <small className="text-muted">Every deployed guard has been recorded.</small>
            </div>
          ) : (
            <Table responsive hover className="mb-0" size="sm">
              <thead style={{ background: '#F2F4F7', fontSize: '0.75rem', color: '#6c757d', fontWeight: 600 }}>
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="py-2">Zone</th>
                  <th className="py-2 text-center">Total</th>
                  <th className="py-2 text-center">Marked</th>
                  <th className="py-2 text-center">Unmarked</th>
                  <th className="py-2 text-center">Progress</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data?.sitesWithMissingAttendance.map((site, i) => {
                  const pct = site.totalGuards > 0 ? Math.round((site.markedCount / site.totalGuards) * 100) : 0;
                  return (
                    <tr key={site.siteId} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td className="px-3 py-2 align-middle">
                        <div className="fw-bold" style={{ fontSize: '0.85rem' }}>{site.siteName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>{site.clientName}</div>
                      </td>
                      <td className="py-2 align-middle">
                        <small className="text-muted">{site.zoneName ?? '—'}</small>
                      </td>
                      <td className="py-2 align-middle text-center">
                        <Badge bg="secondary" style={{ fontSize: '0.75rem' }}>{site.totalGuards}</Badge>
                      </td>
                      <td className="py-2 align-middle text-center">
                        <Badge bg="success" style={{ fontSize: '0.75rem' }}>{site.markedCount}</Badge>
                      </td>
                      <td className="py-2 align-middle text-center">
                        <Badge bg="warning" text="dark" style={{ fontSize: '0.75rem' }}>{site.unmarkedCount}</Badge>
                      </td>
                      <td className="py-2 align-middle" style={{ minWidth: 110 }}>
                        <div className="d-flex align-items-center gap-1">
                          <div style={{ flex: 1, height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%',
                              background: pct === 100 ? '#1E8449' : pct >= 50 ? '#E8701A' : '#C0392B',
                              borderRadius: '3px', transition: 'width 0.3s',
                            }} />
                          </div>
                          <small style={{ fontSize: '0.72rem', color: '#6c757d', minWidth: '32px' }}>{pct}%</small>
                        </div>
                      </td>
                      <td className="py-2 align-middle">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                          onClick={() => navigate(`/attendance?site=${site.siteId}`)}
                        >
                          Mark →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Row 4: Supervisor check-ins */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white pt-3 pb-2">
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>👤 Supervisor Check-ins Today</div>
          <small className="text-muted">Field supervisors who have checked in at sites today</small>
        </Card.Header>
        <Card.Body className="p-0">
          {isLoading ? (
            <div className="p-4 text-center">
              <Spinner size="sm" animation="border" /> Loading...
            </div>
          ) : (data?.supervisorCheckins.length ?? 0) === 0 ? (
            <div className="p-4 text-center">
              <div style={{ fontSize: '2rem' }}>👤</div>
              <div className="text-muted mt-1" style={{ fontSize: '0.9rem' }}>
                No supervisor check-ins recorded today
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {data?.supervisorCheckins.map((checkin) => (
                <div
                  key={checkin.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}
                >
                  <InitialsAvatar name={checkin.supervisor.name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{checkin.supervisor.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                      {checkin.supervisor.role.replace(/_/g, ' ')} · {checkin.site.siteName} · {checkin.site.clientName}
                    </div>
                    {checkin.notes && (
                      <div style={{ fontSize: '0.75rem', color: '#4A5568', marginTop: '2px', fontStyle: 'italic' }}>
                        "{checkin.notes}"
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                    🕐{' '}
                    {new Date(checkin.checkinTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>

      <style>{`
        @keyframes pulse {
          0%   { opacity: 1;   transform: scale(1); }
          50%  { opacity: 0.5; transform: scale(1.4); }
          100% { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
