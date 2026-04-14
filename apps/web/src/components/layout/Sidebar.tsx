import { NavLink, useLocation } from 'react-router-dom';
import { Nav, Offcanvas } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../RoleGuard';
import InitialsAvatar from '../ui/InitialsAvatar';
import {
  ROLES,
  INTERNAL_ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  DEPLOYMENT_ROLES,
  REPORT_ROLES,
  type UserRole,
} from '@stap/shared';

const ADMIN_ONLY = [ROLES.DIRECTOR, ROLES.ADMINISTRATOR];
const NON_GUARD_INTERNAL = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD);

const NAV_ITEMS = [
  { icon: 'bi-house-fill',          label: 'Dashboard',     to: '/dashboard',     roles: INTERNAL_ROLES },
  { icon: 'bi-shield-fill',         label: 'Guards',        to: '/guards',        roles: INTERNAL_ROLES },
  { icon: 'bi-calendar-check-fill', label: 'Attendance',    to: '/attendance',    roles: [...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER] },
  { icon: 'bi-phone-fill',          label: 'Check-in',      to: '/checkin',       roles: [ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR] },
  { icon: 'bi-building-fill',       label: 'Clients',       to: '/clients',       roles: NON_GUARD_INTERNAL },
  { icon: 'bi-cash-coin',           label: 'Finance',       to: '/finance',       roles: FINANCE_ROLES },
  { icon: 'bi-box-seam-fill',       label: 'Inventory',     to: '/inventory',     roles: ADMIN_ONLY },
  { icon: 'bi-clipboard2-fill',     label: 'Requisitions',  to: '/requisitions',  roles: NON_GUARD_INTERNAL },
  { icon: 'bi-people-fill',         label: 'HR',            to: '/hr',            roles: HR_ROLES },
  { icon: 'bi-bar-chart-fill',      label: 'Reports',       to: '/reports',       roles: REPORT_ROLES },
  { icon: 'bi-bell-fill',           label: 'Notifications', to: '/notifications', roles: INTERNAL_ROLES },
  { icon: 'bi-gear-fill',           label: 'Settings',      to: '/settings',      roles: [ROLES.DIRECTOR] },
];

const ROLE_BADGE: Record<string, string> = {
  DIRECTOR: '#1B3A6B',
  ASSISTANT_MANAGER: '#17a2b8',
  ADMINISTRATOR: '#6c757d',
  OPERATIONS_SUPERVISOR: '#ffc107',
  FIELD_SUPERVISOR: '#ffc107',
  ACCOUNTS_OFFICER: '#28a745',
  TRAINER: '#6c757d',
  MARKETING: '#17a2b8',
  GUARD: '#f8f9fa',
  CLIENT: '#f8f9fa',
};

interface NavContentProps {
  onNavigate?: () => void;
}

// Active nav items (all others are "coming soon")
const ACTIVE_PATHS = new Set(['/dashboard', '/guards', '/clients', '/attendance', '/checkin']);

function NavContent({ onNavigate }: NavContentProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="d-flex flex-column h-100">
      {/* Logo */}
      <div className="px-3 py-4 border-bottom border-white border-opacity-25">
        <div className="fw-bold text-white fs-5">STAP Security</div>
        <div className="text-white small" style={{ opacity: 0.6 }}>
          Management Platform
        </div>
      </div>

      {/* Nav items */}
      <Nav className="flex-column flex-grow-1 py-2 overflow-auto">
        {NAV_ITEMS.map((item) => (
          <RoleGuard key={item.to} allowedRoles={item.roles as UserRole[]}>
            <Nav.Item>
              {ACTIVE_PATHS.has(item.to) ? (
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `nav-link d-flex align-items-center gap-2 px-3 py-2 rounded mx-2 mb-1 ${
                      isActive || pathname.startsWith(item.to + '/') ? 'bg-white bg-opacity-10 text-white fw-medium' : ''
                    }`
                  }
                  style={({ isActive }) => ({
                    color: isActive || pathname.startsWith(item.to + '/') ? '#fff' : 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                  })}
                >
                  <i className={`bi ${item.icon}`} style={{ fontSize: '1rem', width: 18, textAlign: 'center' }} />
                  <span className="small">{item.label}</span>
                </NavLink>
              ) : (
                <div
                  className="nav-link d-flex align-items-center gap-2 px-3 py-2 rounded mx-2 mb-1"
                  style={{ color: 'rgba(255,255,255,0.35)', cursor: 'not-allowed' }}
                  title="Coming soon"
                >
                  <i className={`bi ${item.icon}`} style={{ fontSize: '1rem', width: 18, textAlign: 'center' }} />
                  <span className="small">{item.label}</span>
                  <span className="ms-auto badge" style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>Soon</span>
                </div>
              )}
            </Nav.Item>
          </RoleGuard>
        ))}
      </Nav>

      {/* User footer */}
      {user && (
        <div className="px-3 py-3 border-top border-white border-opacity-25">
          <div className="d-flex align-items-center gap-2 mb-2">
            <InitialsAvatar name={user.name} size={32} />
            <div className="overflow-hidden">
              <div className="text-white small fw-medium text-truncate">{user.name}</div>
              <div
                className="small text-truncate"
                style={{
                  color: ROLE_BADGE[user.role] ?? '#aaa',
                  fontSize: '0.7rem',
                  opacity: 0.9,
                }}
              >
                {user.role.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-sm w-100"
            style={{
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'transparent',
              fontSize: '0.8rem',
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const SIDEBAR_BG = '#1B3A6B';

  return (
    <>
      {/* Desktop sidebar — fixed left column */}
      <div
        className="d-none d-md-flex flex-column"
        style={{
          width: 220,
          minHeight: '100vh',
          backgroundColor: SIDEBAR_BG,
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        <NavContent />
      </div>

      {/* Mobile offcanvas */}
      <Offcanvas
        show={mobileOpen}
        onHide={onMobileClose}
        style={{ backgroundColor: SIDEBAR_BG, width: 240 }}
      >
        <Offcanvas.Header
          closeButton
          closeVariant="white"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}
        />
        <Offcanvas.Body className="p-0">
          <NavContent onNavigate={onMobileClose} />
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
