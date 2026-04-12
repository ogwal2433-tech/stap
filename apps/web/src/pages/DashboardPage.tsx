import { Badge, Button, Card, Col, Container, Navbar, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RoleGuard from '../components/RoleGuard';
import {
  ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  DEPLOYMENT_ROLES,
  REPORT_ROLES,
  type UserRole,
} from '@stap/shared';

// ── Role → badge colour ────────────────────────────────────────────────────────
const ROLE_BADGE: Record<UserRole, { bg: string; text?: string; border?: boolean }> = {
  DIRECTOR: { bg: 'primary' },
  ASSISTANT_MANAGER: { bg: 'info' },
  ADMINISTRATOR: { bg: 'secondary' },
  OPERATIONS_SUPERVISOR: { bg: 'warning', text: 'dark' },
  FIELD_SUPERVISOR: { bg: 'warning', text: 'dark' },
  ACCOUNTS_OFFICER: { bg: 'success' },
  TRAINER: { bg: 'secondary' },
  MARKETING: { bg: 'info' },
  GUARD: { bg: 'light', text: 'dark', border: true },
  CLIENT: { bg: 'light', text: 'dark', border: true },
};

function greeting(name: string): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${period}, ${name}`;
}

interface QuickLinkCardProps {
  icon: string;
  title: string;
  description: string;
}

function QuickLinkCard({ icon, title, description }: QuickLinkCardProps) {
  return (
    <Card className="h-100 border-0 shadow-sm">
      <Card.Body className="d-flex flex-column align-items-start gap-2 p-4">
        <i className={`bi ${icon}`} style={{ fontSize: '2rem', color: '#1B3A6B' }} />
        <Card.Title className="mb-0 fs-6 fw-semibold">{title}</Card.Title>
        <Card.Text className="text-muted small mb-0">{description}</Card.Text>
        <Badge bg="secondary" className="mt-auto">
          Coming Soon
        </Badge>
      </Card.Body>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const badgeStyle = ROLE_BADGE[user.role as UserRole] ?? { bg: 'secondary' };

  return (
    <>
      {/* Fixed top navbar */}
      <Navbar bg="dark" variant="dark" fixed="top" className="px-3">
        <Navbar.Brand className="fw-bold">STAP Security</Navbar.Brand>
        <div className="ms-auto d-flex align-items-center gap-3">
          <span className="text-white small">
            {user.name}{' '}
            <Badge
              bg={badgeStyle.bg}
              text={badgeStyle.text}
              className={badgeStyle.border ? 'border border-secondary' : undefined}
            >
              {user.role.replace(/_/g, ' ')}
            </Badge>
          </span>
          <Button size="sm" variant="outline-light" onClick={logout}>
            Logout
          </Button>
        </div>
      </Navbar>

      {/* Main content — padded below fixed navbar */}
      <main style={{ paddingTop: '4.5rem', minHeight: '100vh', background: '#F2F4F7' }}>
        <Container className="py-4">
          {/* Welcome heading */}
          <h3 className="fw-bold mb-1" style={{ color: '#1B3A6B' }}>
            {greeting(user.name)}
          </h3>
          <p className="text-muted mb-4">Here's your workspace overview.</p>

          {/* Info banner */}
          <Card className="border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #1B3A6B' }}>
            <Card.Body className="py-3">
              <p className="mb-0 small text-muted">
                <i className="bi bi-cone-striped me-1" /> System is being set up. Modules will appear here as they are completed.
              </p>
            </Card.Body>
          </Card>

          {/* Quick-link cards — shown per role */}
          <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>
            Quick Links
          </h6>

          <Row xs={1} sm={2} lg={4} className="g-3">
            <RoleGuard allowedRoles={[...HR_ROLES, ...DEPLOYMENT_ROLES]}>
              <Col>
                <div onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>
                  <QuickLinkCard
                    icon="bi-shield-fill"
                    title="Guards"
                    description="Manage guard profiles, deployments and records."
                  />
                </div>
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={FINANCE_ROLES}>
              <Col>
                <QuickLinkCard
                  icon="bi-cash-coin"
                  title="Finance"
                  description="Invoices, payments, cashbook and payroll."
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={REPORT_ROLES}>
              <Col>
                <QuickLinkCard
                  icon="bi-bar-chart-fill"
                  title="Reports"
                  description="Attendance, AR aging, and operational reports."
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ADMINISTRATOR]}>
              <Col>
                <QuickLinkCard
                  icon="bi-box-seam-fill"
                  title="Inventory"
                  description="Issue equipment, record returns and damage."
                />
              </Col>
            </RoleGuard>
          </Row>
        </Container>
      </main>
    </>
  );
}
