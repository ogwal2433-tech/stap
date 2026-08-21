import { NavLink, useLocation } from 'react-router-dom';
import { Offcanvas } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../RoleGuard';
import InitialsAvatar from '../ui/InitialsAvatar';
import { APP_NAME, APP_TAGLINE, ROLES, type UserRole } from '@stap/shared';

// Who runs the staff directory. Mirrors STAFF_MANAGER_ROLES on the API.
const STAFF_MANAGER_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

// ── Nav structure ──────────────────────────────────────────────────────────────

interface NavItem {
  icon:  string;
  label: string;
  to:    string;
  roles: UserRole[];
}

/**
 * The sidebar is deliberately down to these two entries.
 *
 * Every other module — guards, clients, finance, complaints, deployments,
 * requisitions, marketing, guns, reports, notifications, audit log, system
 * errors — still has its route, its page and its role guard in App.tsx, and is
 * still reachable by URL. Only the sidebar links were withdrawn; restoring one
 * means adding its entry back here and its path to ALL_NAV_PATHS.
 */
const NAV_ITEMS: NavItem[] = [
  {
    icon:  'bi-people-fill',
    label: 'Users',
    to:    '/staff',
    roles: STAFF_MANAGER_ROLES as UserRole[],
  },
  {
    icon:  'bi-gear-fill',
    label: 'Settings',
    to:    '/settings',
    roles: [ROLES.DIRECTOR] as UserRole[],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

// Paths that have a route behind them. A nav item missing from this set renders
// as a greyed-out "Soon" stub instead of a link, so anything added to NAV_ITEMS
// must be listed here too or the page is unreachable from the sidebar.
const ALL_NAV_PATHS = new Set(['/staff', '/settings']);

const ROLE_BADGE: Record<string, string> = {
  DIRECTOR:              '#1B3A6B',
  ASSISTANT_MANAGER:     '#17a2b8',
  ADMINISTRATOR:         '#6c757d',
  OPERATIONS_SUPERVISOR: '#ffc107',
  FIELD_SUPERVISOR:      '#ffc107',
  ACCOUNTS_OFFICER:      '#28a745',
  CONTROL_ROOM:          '#E8701A',
  TRAINER:               '#6c757d',
  MARKETING:             '#0F7B6C',
  GUARD:                 '#f8f9fa',
  CLIENT:                '#f8f9fa',
};

interface NavContentProps {
  onNavigate?: () => void;
}

// ── NavItemLink ────────────────────────────────────────────────────────────────

const ITEM_STYLE: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            6,
  padding:        '5px 10px',
  borderRadius:   6,
  margin:         '1px 6px',
  textDecoration: 'none',
  whiteSpace:     'nowrap',
  overflow:       'hidden',
  textOverflow:   'ellipsis',
  fontSize:       '0.8rem',
  transition:     'color 0.15s',
  width:          'calc(100% - 12px)',
  boxSizing:      'border-box',
};

const ICON_STYLE: React.CSSProperties = {
  fontSize:   '0.82rem',
  width:      15,
  flexShrink: 0,
  textAlign:  'center',
};

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const isActive = pathname === item.to || pathname.startsWith(item.to + '/');

  if (!ALL_NAV_PATHS.has(item.to)) {
    return (
      <div style={{ ...ITEM_STYLE, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }} title="Coming soon">
        <i className={`bi ${item.icon}`} style={ICON_STYLE} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.58rem', background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>Soon</span>
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      style={{
        ...ITEM_STYLE,
        color:      isActive ? '#fff' : 'rgba(255,255,255,0.68)',
        background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
        fontWeight: isActive ? 600 : 400,
      }}
    >
      <i className={`bi ${item.icon}`} style={ICON_STYLE} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.label}</span>
    </NavLink>
  );
}

// ── NavContent ─────────────────────────────────────────────────────────────────

function NavContent({ onNavigate }: NavContentProps) {
  const { user, logout } = useAuth();

  return (
    <div className="d-flex flex-column h-100">
      {/* Logo */}
      <div className="px-3 py-4 border-bottom border-white border-opacity-25">
        <div className="fw-bold text-white fs-5">{APP_NAME}</div>
        <div className="text-white small" style={{ opacity: 0.6 }}>{APP_TAGLINE}</div>
      </div>

      {/* Nav — vertical only, clip horizontal overflow */}
      <div style={{
        display:    'flex',
        flexDirection: 'column',
        flexGrow:   1,
        overflowY:  'auto',
        overflowX:  'hidden',
        paddingTop: 6,
        paddingBottom: 6,
      }}>
        {NAV_ITEMS.map(item => (
          <RoleGuard key={item.to} allowedRoles={item.roles}>
            <NavItemLink item={item} onNavigate={onNavigate} />
          </RoleGuard>
        ))}
      </div>

      {/* User footer */}
      {user && (
        <div className="px-3 py-3 border-top border-white border-opacity-25">
          <div className="d-flex align-items-center gap-2 mb-2">
            <InitialsAvatar name={user.name} size={32} />
            <div className="overflow-hidden">
              <div className="text-white small fw-medium text-truncate">{user.name}</div>
              <div
                className="small text-truncate"
                style={{ color: ROLE_BADGE[user.role] ?? '#aaa', fontSize: '0.7rem', opacity: 0.9 }}
              >
                {user.role.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-sm w-100"
            style={{
              color:           'rgba(255,255,255,0.7)',
              border:          '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'transparent',
              fontSize:        '0.8rem',
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sidebar wrapper ────────────────────────────────────────────────────────────

interface SidebarProps {
  mobileOpen:    boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const SIDEBAR_BG = '#1B3A6B';

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="d-none d-md-flex flex-column"
        style={{
          width:           220,
          minHeight:       '100vh',
          backgroundColor: SIDEBAR_BG,
          position:        'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex:          100,
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
