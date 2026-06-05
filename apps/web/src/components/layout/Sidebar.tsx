import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Badge, Nav, Offcanvas } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useUnreadCount } from '../../hooks/useNotifications';
import RoleGuard from '../RoleGuard';
import InitialsAvatar from '../ui/InitialsAvatar';
import {
  ROLES,
  INTERNAL_ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  DEPLOYMENT_ROLES,
  REPORT_ROLES,
  GUARD_WRITE_ROLES,
  type UserRole,
} from '@stap/shared';

const ADMIN_ONLY       = [ROLES.DIRECTOR, ROLES.ADMINISTRATOR];
const NON_GUARD_INTERNAL = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD);

// ── Nav structure ──────────────────────────────────────────────────────────────

interface NavItem {
  icon:  string;
  label: string;
  to:    string;
  roles: UserRole[];
}

interface NavGroup {
  id:    string;
  icon:  string;
  label: string;
  items: NavItem[];
}

// Standalone items rendered outside of groups
const STANDALONE_ITEMS: NavItem[] = [
  {
    icon:  'bi-house-fill',
    label: 'Dashboard',
    to:    '/dashboard',
    roles: INTERNAL_ROLES as UserRole[],
  },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id:    'operations',
    icon:  'bi-shield-fill',
    label: 'Guard Operations',
    items: [
      { icon: 'bi-shield-fill',         label: 'Guards',     to: '/guards',     roles: INTERNAL_ROLES as UserRole[] },
      { icon: 'bi-calendar-check-fill', label: 'Attendance', to: '/attendance', roles: [...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER] as UserRole[] },
      { icon: 'bi-phone-fill',          label: 'Check-in',   to: '/checkin',    roles: [ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR] as UserRole[] },
    ],
  },
  {
    id:    'clients',
    icon:  'bi-building-fill',
    label: 'Clients & Sites',
    items: [
      { icon: 'bi-building-fill',      label: 'Clients',    to: '/clients',    roles: NON_GUARD_INTERNAL as UserRole[] },
      { icon: 'bi-map-fill',           label: 'Zones',      to: '/zones',      roles: [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR] as UserRole[] },
      { icon: 'bi-chat-left-text-fill', label: 'Complaints', to: '/complaints', roles: INTERNAL_ROLES.filter(r => r !== ROLES.GUARD && r !== ROLES.CLIENT) as UserRole[] },
    ],
  },
  {
    id:    'finance',
    icon:  'bi-cash-coin',
    label: 'Finance & Resources',
    items: [
      { icon: 'bi-cash-coin',      label: 'Finance',      to: '/finance',      roles: FINANCE_ROLES as UserRole[] },
      { icon: 'bi-box-seam-fill',  label: 'Inventory',    to: '/inventory',    roles: ADMIN_ONLY as UserRole[] },
      { icon: 'bi-clipboard2-fill', label: 'Requisitions', to: '/requisitions', roles: NON_GUARD_INTERNAL as UserRole[] },
    ],
  },
  {
    id:    'hr',
    icon:  'bi-people-fill',
    label: 'HR & Reporting',
    items: [
      { icon: 'bi-people-fill',   label: 'HR',      to: '/hr',      roles: HR_ROLES as UserRole[] },
      { icon: 'bi-bar-chart-fill', label: 'Reports', to: '/reports', roles: REPORT_ROLES as UserRole[] },
    ],
  },
  {
    id:    'system',
    icon:  'bi-gear-fill',
    label: 'System',
    items: [
      { icon: 'bi-gear-fill', label: 'Settings', to: '/settings', roles: [ROLES.DIRECTOR] as UserRole[] },
    ],
  },
];

const NOTIFICATION_ITEM: NavItem = {
  icon:  'bi-bell-fill',
  label: 'Notifications',
  to:    '/notifications',
  roles: INTERNAL_ROLES as UserRole[],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const ALL_NAV_PATHS = new Set([
  '/dashboard', '/guards', '/attendance', '/checkin',
  '/clients', '/zones', '/complaints',
  '/finance', '/inventory', '/requisitions',
  '/hr', '/reports', '/settings', '/notifications',
  '/guards/dashboard', '/guards/import',
  '/attendance/dashboard',
]);

const ROLE_BADGE: Record<string, string> = {
  DIRECTOR:              '#1B3A6B',
  ASSISTANT_MANAGER:     '#17a2b8',
  ADMINISTRATOR:         '#6c757d',
  OPERATIONS_SUPERVISOR: '#ffc107',
  FIELD_SUPERVISOR:      '#ffc107',
  ACCOUNTS_OFFICER:      '#28a745',
  TRAINER:               '#6c757d',
  MARKETING:             '#17a2b8',
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

const SUB_ITEM_STYLE: React.CSSProperties = {
  ...ITEM_STYLE,
  padding:     '4px 10px 4px 28px',
  fontSize:    '0.75rem',
};

const SUB_ICON_STYLE: React.CSSProperties = {
  fontSize:   '0.72rem',
  width:      13,
  flexShrink: 0,
  textAlign:  'center',
};

function NavItemLink({
  item,
  sub = false,
  onNavigate,
  unreadBadge,
}: {
  item:        NavItem;
  sub?:        boolean;
  onNavigate?: () => void;
  unreadBadge?:number;
}) {
  const { pathname } = useLocation();
  const isActive = pathname === item.to || pathname.startsWith(item.to + '/');
  const baseStyle = sub ? SUB_ITEM_STYLE : ITEM_STYLE;
  const iconStyle = sub ? SUB_ICON_STYLE : ICON_STYLE;

  if (!ALL_NAV_PATHS.has(item.to)) {
    return (
      <div style={{ ...baseStyle, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }} title="Coming soon">
        <i className={`bi ${item.icon}`} style={iconStyle} />
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
        ...baseStyle,
        color:      isActive ? '#fff' : 'rgba(255,255,255,0.68)',
        background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
        fontWeight: isActive ? 600 : 400,
      }}
    >
      <i className={`bi ${item.icon}`} style={iconStyle} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.label}</span>
      {unreadBadge != null && unreadBadge > 0 && (
        <Badge bg="danger" pill style={{ fontSize: '0.58rem', flexShrink: 0 }}>
          {unreadBadge > 99 ? '99+' : unreadBadge}
        </Badge>
      )}
    </NavLink>
  );
}

// ── NavGroupPanel ──────────────────────────────────────────────────────────────

function NavGroupPanel({
  group,
  defaultOpen,
  onNavigate,
  pathname,
  unreadCount,
}: {
  group:       NavGroup;
  defaultOpen: boolean;
  onNavigate?: () => void;
  pathname:    string;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActiveItem = group.items.some(
    item => pathname === item.to || pathname.startsWith(item.to + '/'),
  );
  const effectiveOpen = open || hasActiveItem;

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Group header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           6,
          width:         '100%',
          background:    'transparent',
          border:        'none',
          color:         hasActiveItem ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
          cursor:        'pointer',
          textAlign:     'left',
          fontSize:      '0.68rem',
          fontWeight:    700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          padding:       '6px 10px 4px',
          boxSizing:     'border-box',
        }}
      >
        <i className={`bi ${group.icon}`} style={{ fontSize: '0.72rem', width: 13, flexShrink: 0, textAlign: 'center' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
        <i className={`bi bi-chevron-${effectiveOpen ? 'up' : 'down'}`} style={{ fontSize: '0.6rem', opacity: 0.5, flexShrink: 0 }} />
      </button>

      {/* Group items */}
      {effectiveOpen && (
        <div>
          {group.items.map(item => (
            <RoleGuard key={item.to} allowedRoles={item.roles}>
              <NavItemLink
                item={item}
                onNavigate={onNavigate}
                unreadBadge={item.to === '/notifications' ? unreadCount : undefined}
              />
            </RoleGuard>
          ))}

          {/* Sub-nav: Guards */}
          {group.id === 'operations' && pathname.startsWith('/guards') && (
            <>
              <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR] as UserRole[]}>
                <NavLink
                  to="/guards/dashboard"
                  onClick={onNavigate}
                  style={({ isActive }) => ({ ...SUB_ITEM_STYLE, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: isActive ? 600 : 400 })}
                >
                  <i className="bi bi-bar-chart-fill" style={SUB_ICON_STYLE} />
                  <span>Overview</span>
                </NavLink>
              </RoleGuard>
              <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                <NavLink
                  to="/guards/import"
                  onClick={onNavigate}
                  style={({ isActive }) => ({ ...SUB_ITEM_STYLE, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: isActive ? 600 : 400 })}
                >
                  <i className="bi bi-file-earmark-arrow-up" style={SUB_ICON_STYLE} />
                  <span>Bulk Import</span>
                </NavLink>
              </RoleGuard>
            </>
          )}

          {/* Sub-nav: Attendance */}
          {group.id === 'operations' && pathname.startsWith('/attendance') && (
            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR] as UserRole[]}>
              <NavLink
                to="/attendance/dashboard"
                onClick={onNavigate}
                style={({ isActive }) => ({ ...SUB_ITEM_STYLE, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: isActive ? 600 : 400 })}
              >
                <i className="bi bi-bar-chart-fill" style={SUB_ICON_STYLE} />
                <span>Dashboard</span>
              </NavLink>
            </RoleGuard>
          )}
        </div>
      )}
    </div>
  );
}

// ── NavContent ─────────────────────────────────────────────────────────────────

function NavContent({ onNavigate }: NavContentProps) {
  const { user, logout } = useAuth();
  const { pathname }     = useLocation();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  // A group starts open if the current path falls inside it
  function isGroupActive(group: NavGroup) {
    return group.items.some(item => pathname === item.to || pathname.startsWith(item.to + '/'));
  }

  return (
    <div className="d-flex flex-column h-100">
      {/* Logo */}
      <div className="px-3 py-4 border-bottom border-white border-opacity-25">
        <div className="fw-bold text-white fs-5">STAP Security</div>
        <div className="text-white small" style={{ opacity: 0.6 }}>Management Platform</div>
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
        {/* Standalone: Dashboard */}
        {STANDALONE_ITEMS.map(item => (
          <RoleGuard key={item.to} allowedRoles={item.roles}>
            <NavItemLink item={item} onNavigate={onNavigate} />
          </RoleGuard>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 10px' }} />

        {/* Grouped sections */}
        {NAV_GROUPS.map(group => (
          <NavGroupPanel
            key={group.id}
            group={group}
            defaultOpen={isGroupActive(group)}
            onNavigate={onNavigate}
            pathname={pathname}
            unreadCount={unreadCount}
          />
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 10px' }} />

        {/* Standalone: Notifications */}
        <RoleGuard allowedRoles={NOTIFICATION_ITEM.roles}>
          <NavItemLink item={NOTIFICATION_ITEM} onNavigate={onNavigate} unreadBadge={unreadCount} />
        </RoleGuard>
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
