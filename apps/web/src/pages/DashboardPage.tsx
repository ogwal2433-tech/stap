import { useEffect, useState } from 'react';
import { Badge, Button, Card, Col, Container, Navbar, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RoleGuard from '../components/RoleGuard';
import { useClientSummary } from '../hooks/useClients';
import { useGuardDashboard } from '../hooks/useGuards';
import { useTodaysDeployments } from '../hooks/useAttendance';
import { useExpiringContracts } from '../hooks/useContracts';
import { useARAgingReport } from '../hooks/useFinance';
import { useRequisitionDashboard } from '../hooks/useRequisitions';
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
  stat?: React.ReactNode;
  onClick?: () => void;
  comingSoon?: boolean;
}

function QuickLinkCard({ icon, title, description, stat, onClick, comingSoon }: QuickLinkCardProps) {
  return (
    <Card
      className="h-100 border-0 shadow-sm"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
    >
      <Card.Body className="d-flex flex-column align-items-start gap-2 p-4">
        <i className={`bi ${icon}`} style={{ fontSize: '2rem', color: '#1B3A6B' }} />
        <Card.Title className="mb-0 fs-6 fw-semibold">{title}</Card.Title>
        <Card.Text className="text-muted small mb-0">{description}</Card.Text>
        <div className="mt-auto">
          {comingSoon
            ? <Badge bg="secondary">Coming Soon</Badge>
            : stat}
        </div>
      </Card.Body>
    </Card>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useClock();

  const { data: guardStats } = useGuardDashboard();
  const { data: clientSummary } = useClientSummary();
  const { data: todayDeployments } = useTodaysDeployments({ page: 1, limit: 1 });
  const { data: expiringContracts } = useExpiringContracts();
  const { data: arAging } = useARAgingReport();
  const { data: reqDashboard } = useRequisitionDashboard();

  if (!user) return null;

  const badgeStyle    = ROLE_BADGE[user.role as UserRole] ?? { bg: 'secondary' };
  const expiringCount = expiringContracts?.length ?? 0;
  const dateStr       = now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr       = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) + ' EAT';

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
          <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>{greeting(user.name)}</h3>
              <div className="text-muted small">Here's your workspace overview.</div>
            </div>
            <div className="text-end small text-muted">
              <div>{dateStr}</div>
              <div className="fw-semibold" style={{ color: '#1B3A6B' }}>{timeStr}</div>
            </div>
          </div>

          {/* Quick-link cards — shown per role */}
          <h6 className="text-uppercase text-muted fw-semibold mb-3" style={{ letterSpacing: '0.06em' }}>
            Quick Links
          </h6>

          <Row xs={1} sm={2} lg={4} className="g-3">
            <RoleGuard allowedRoles={[...HR_ROLES, ...DEPLOYMENT_ROLES]}>
              <Col>
                <QuickLinkCard
                  icon="bi-shield-fill"
                  title="Guards"
                  description="Manage guard profiles, deployments and records."
                  stat={
                    <Badge bg="primary" pill>
                      {guardStats?.totalActive ?? '—'} active
                    </Badge>
                  }
                  onClick={() => navigate('/guards/dashboard')}
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={DEPLOYMENT_ROLES}>
              <Col>
                <QuickLinkCard
                  icon="bi-calendar-check-fill"
                  title="Attendance"
                  description="Today's deployment sheet and roster management."
                  stat={
                    <Badge bg="success" pill>
                      {todayDeployments?.pagination.total ?? '—'} deployed today
                    </Badge>
                  }
                  onClick={() => navigate('/attendance')}
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={[...FINANCE_ROLES, ROLES.ASSISTANT_MANAGER]}>
              <Col>
                <QuickLinkCard
                  icon="bi-building-fill"
                  title="Clients"
                  description="Manage client accounts and contracts."
                  stat={
                    <>
                      <Badge bg="primary" pill className="me-1">
                        {clientSummary ? clientSummary.totalActive + clientSummary.totalInactive : '—'} clients
                      </Badge>
                      {expiringCount > 0 && (
                        <Badge bg="danger" pill>
                          {expiringCount} expiring
                        </Badge>
                      )}
                    </>
                  }
                  onClick={() => navigate('/clients')}
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={FINANCE_ROLES}>
              <Col>
                <QuickLinkCard
                  icon="bi-cash-coin"
                  title="Finance"
                  description="Invoices, payments, cashbook and payroll."
                  stat={
                    <>
                      {arAging && (
                        <Badge bg={arAging.buckets.over90 > 0 ? 'danger' : 'success'} pill className="me-1">
                          UGX {arAging.buckets.total.toLocaleString()} outstanding
                        </Badge>
                      )}
                    </>
                  }
                  onClick={() => navigate('/finance')}
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR]}>
              <Col>
                <QuickLinkCard
                  icon="bi-clipboard2-fill"
                  title="Requisitions"
                  description="Submit and manage procurement requisitions."
                  stat={
                    reqDashboard?.pendingApprovals ? (
                      <Badge bg="warning" text="dark" pill>
                        {reqDashboard.pendingApprovals} pending approvals
                      </Badge>
                    ) : (
                      <Badge bg="secondary" pill>No pending</Badge>
                    )
                  }
                  onClick={() => navigate('/requisitions')}
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={REPORT_ROLES}>
              <Col>
                <QuickLinkCard
                  icon="bi-bar-chart-fill"
                  title="Reports"
                  description="Attendance, AR aging, and operational reports."
                  comingSoon
                />
              </Col>
            </RoleGuard>

            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ADMINISTRATOR]}>
              <Col>
                <QuickLinkCard
                  icon="bi-box-seam-fill"
                  title="Inventory"
                  description="Issue equipment, record returns and damage."
                  comingSoon
                />
              </Col>
            </RoleGuard>
          </Row>
        </Container>
      </main>
    </>
  );
}
