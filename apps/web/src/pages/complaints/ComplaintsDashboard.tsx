import { Container, Row, Col, Card, Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { complaintsApi } from '../../lib/complaints.api';

export default function ComplaintsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['complaints-dashboard'],
    queryFn:  complaintsApi.getDashboard,
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;
  if (!data) return null;

  const catData = data.openByCategory.map(b => ({ name: b.category.replace(/_/g,' '), count: b.count }));

  return (
    <Container className="py-4">
      <h4 className="fw-bold mb-4" style={{ color: '#1B3A6B' }}>Complaints Dashboard</h4>

      {/* KPI Cards */}
      <Row className="g-3 mb-4">
        {[
          { label: 'Total Open',          value: data.totalOpen,         bg: '#fef2f2', color: '#dc3545' },
          { label: 'Total Resolved',      value: data.totalResolved,     bg: '#f0fdf4', color: '#16a34a' },
          { label: 'Avg Resolution Days', value: data.avgResolutionDays, bg: '#eff6ff', color: '#2563eb' },
        ].map(({ label, value, bg, color }) => (
          <Col key={label} md={4}>
            <Card className="border-0 shadow-sm h-100" style={{ background: bg }}>
              <Card.Body className="text-center">
                <div style={{ fontSize: '2rem', fontWeight: 700, color }}>{value}</div>
                <div className="text-muted small">{label}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts */}
      <Row className="g-4 mb-4">
        <Col lg={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="fw-semibold small bg-white border-0 pt-3">Open Complaints by Category</Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1B3A6B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="fw-semibold small bg-white border-0 pt-3">Monthly Trend (6 months)</Card.Header>
            <Card.Body>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="opened"   stroke="#dc3545" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="resolved" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Top clients */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="fw-semibold small bg-white border-0 pt-3">Top Clients by Open Complaints</Card.Header>
        <Card.Body className="p-0">
          <table className="table table-sm table-hover mb-0 small">
            <thead className="table-light">
              <tr><th>Client</th><th className="text-end">Open Complaints</th></tr>
            </thead>
            <tbody>
              {data.openByClient.map(c => (
                <tr key={c.clientName}>
                  <td>{c.clientName}</td>
                  <td className="text-end">{c.count}</td>
                </tr>
              ))}
              {data.openByClient.length === 0 && (
                <tr><td colSpan={2} className="text-center text-muted py-3">No open complaints</td></tr>
              )}
            </tbody>
          </table>
        </Card.Body>
      </Card>
    </Container>
  );
}
