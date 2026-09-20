import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Badge, Nav, Offcanvas } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useSystemErrorStats } from '../../hooks/useSystemErrors';
import { serviceRequestsApi } from '../../lib/serviceRequests.api';
import { DELETE_PERMISSIONS } from '../../lib/deletedRecords.api';
import RoleGuard from '../RoleGuard';
import PermissionGuard from '../PermissionGuard';
import InitialsAvatar from '../ui/InitialsAvatar';
import {
  APP_NAME,
  APP_TAGLINE,
  ROLES,
  INTERNAL_ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  DEPLOYMENT_VIEW_ROLES,
  REPORT_ROLES,
  type UserRole,
} from '@stap/shared';

const ADMIN_ONLY       = [ROLES.DIRECTOR, ROLES.ADMINISTRATOR];
// Who runs the staff directory. Mirrors STAFF_MANAGER_ROLES on the API.
const STAFF_MANAGER_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const ERROR_ADMIN_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const NON_GUARD_INTERNAL = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD);
// Firearms are the Trainer's to issue; Operations can see what is on its sites.
const MARKETING_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING_HEAD, ROLES.SALES];
const GUN_VIEW_ROLES = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR,
];

// ── Nav structure ──────────────────────────────────────────────────────────────

interface NavItem {
  icon:  string;
  label: string;
  to:    string;
  /**
   * Permission that decides whether this item is shown. Where present it
   * replaces `roles`, so granting it in the Roles & Permissions page makes the
   * item appear without a code change. `roles` stays for the few items that
   * have no permission of their own (Dashboard and Notifications, which
   * everyone signed in can reach), and
   * is omitted entirely where a permission governs the item — keeping a role
   * list beside one only invites the two to drift apart.
   */
  permission?: string;
  /** Shown when the user holds any one of these — for a page gathering several modules. */
  anyPermission?: string[];
  roles?: UserRole[];
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
      { icon: 'bi-shield-fill',         label: 'Guards',     to: '/guards',     roles: INTERNAL_ROLES as UserRole[] , permission: 'guards.view'},
      { icon: 'bi-calendar-check-fill', label: 'Attendance', to: '/attendance', roles: DEPLOYMENT_VIEW_ROLES as UserRole[] , permission: 'attendance.view'},
      { icon: 'bi-crosshair',           label: 'Gun Management', to: '/guns', roles: GUN_VIEW_ROLES as UserRole[] , permission: 'guns.view'},
      { icon: 'bi-phone-fill',          label: 'Check-in',   to: '/checkin',    permission: 'checkin.perform' },
      { icon: 'bi-clipboard-check-fill', label: 'Shift Reports', to: '/control-room/shift-reports', permission: 'shift_report.view' },
    ]
  },
  {
    id:    'clients',
    icon:  'bi-building-fill',
    label: 'Clients & Sites',
    items: [
      { icon: 'bi-building-fill',      label: 'Clients',    to: '/clients',    roles: NON_GUARD_INTERNAL as UserRole[] , permission: 'clients.view'},
      { icon: 'bi-map-fill',           label: 'Zones',      to: '/zones',      roles: [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR] as UserRole[], permission: 'roster.view' },
      { icon: 'bi-graph-up-arrow',      label: 'Marketing',  to: '/marketing',  roles: MARKETING_ROLES as UserRole[] , permission: 'marketing.view'},
      { icon: 'bi-chat-left-text-fill', label: 'Complaints', to: '/complaints', roles: INTERNAL_ROLES.filter(r => r !== ROLES.GUARD && r !== ROLES.CLIENT) as UserRole[] , permission: 'complaints.view'},
      { icon: 'bi-tools',               label: 'Service Requests', to: '/service-requests', permission: 'service_requests.view'},
    ],
  },
  {
    id:    'finance',
    icon:  'bi-cash-coin',
    label: 'Finance & Resources',
    items: [
      { icon: 'bi-cash-coin',      label: 'Finance',      to: '/finance',      roles: FINANCE_ROLES as UserRole[] , permission: 'finance.view'},
      { icon: 'bi-box-seam-fill',  label: 'Inventory',    to: '/inventory',    permission: 'inventory.view' },
      { icon: 'bi-clipboard2-fill', label: 'Requisitions', to: '/requisitions', roles: NON_GUARD_INTERNAL as UserRole[] , permission: 'requisitions.view'},
    ],
  },
  {
    id:    'hr',
    icon:  'bi-people-fill',
    label: 'HR & Reporting',
    items: [
      { icon: 'bi-people-fill',   label: 'HR',      to: '/hr',      roles: [...HR_ROLES, ROLES.TRAINER] as UserRole[], permission: 'hr.view' },
      { icon: 'bi-bar-chart-fill', label: 'Reports', to: '/reports', roles: REPORT_ROLES as UserRole[] , permission: 'reports.view'},
    ],
  },
  {
    id:    'system',
    icon:  'bi-gear-fill',
    label: 'System',
    items: [
      { icon: 'bi-person-badge-fill',   label: 'Staff',         to: '/staff',         roles: STAFF_MANAGER_ROLES as UserRole[] , permission: 'staff.view'},
      { icon: 'bi-gear-fill',           label: 'Settings',      to: '/settings',      roles: [ROLES.DIRECTOR] as UserRole[] , permission: 'settings.view'},
      { icon: 'bi-shield-lock-fill',    label: 'Roles & Permissions', to: '/settings/roles', roles: ADMIN_ONLY as UserRole[] , permission: 'roles.manage'},
      { icon: 'bi-clock-history',       label: 'Scheduled Jobs', to: '/settings/scheduled-jobs', permission: 'settings.view' },
      { icon: 'bi-plug-fill',           label: 'Integrations', to: '/settings/integrations', roles: [ROLES.DIRECTOR] as UserRole[], permission: 'settings.edit' },
      { icon: 'bi-exclamation-triangle-fill', label: 'System Errors', to: '/admin/errors', roles: ERROR_ADMIN_ROLES as UserRole[] , permission: 'system.errors'},
      { icon: 'bi-search',              label: 'Audit Log',     to: '/admin/audit-log', roles: ERROR_ADMIN_ROLES as UserRole[] , permission: 'audit.log'},
      { icon: 'bi-shield-exclamation',  label: 'Security Log',  to: '/admin/security-log', permission: 'audit.log' },
      { icon: 'bi-trash3',              label: 'Deleted Records', to: '/admin/deleted', anyPermission: DELETE_PERMISSIONS },
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

// Paths that have a route behind them. A nav item missing from this set renders
// as a greyed-out "Soon" stub instead of a link, so anything added to NAV_GROUPS
// must be listed here too or the page is unreachable from the sidebar.
const ALL_NAV_PATHS = new Set([
  '/dashboard', '/guards', '/attendance', '/checkin',
  '/clients', '/zones', '/complaints', '/service-requests',
  '/control-room/shift-reports',
  '/finance', '/inventory', '/requisitions', '/settings/scheduled-jobs',
  '/hr', '/reports', '/settings', '/settings/roles', '/settings/integrations', '/staff', '/notifications', '/guns', '/marketing',
  '/guards/dashboard', '/guards/import',
  '/attendance/dashboard', '/admin/errors', '/admin/audit-log', '/admin/deleted', '/admin/security-log',
]);

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

/**
 * Shows a nav item when the user's role holds its permission, falling back to
 * the role list for the handful of items that have no permission of their own.
 *
 * Both the item and the route behind it now read the same permission, which is
 * what stops the sidebar offering a page the router then refuses.
 */
function NavGate({ item, children }: { item: NavItem; children: React.ReactNode }) {
  const { permissions, isLoading } = useAuth();
  if (item.anyPermission) {
    if (isLoading) return null;
    return item.anyPermission.some((p) => permissions.includes(p)) ? <>{children}</> : null;
  }
  if (item.permission) {
    return <PermissionGuard permission={item.permission}>{children}</PermissionGuard>;
  }
  return <RoleGuard allowedRoles={item.roles ?? []}>{children}</RoleGuard>;
}

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
  openErrorCount,
  pendingSrCount,
}: {
  group:       NavGroup;
  defaultOpen: boolean;
  onNavigate?: () => void;
  pathname:    string;
  unreadCount: number;
  openErrorCount: number;
  pendingSrCount: number;
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
            <NavGate key={item.to} item={item}>
              <NavItemLink
                item={item}
                onNavigate={onNavigate}
                unreadBadge={
                  item.to === '/notifications'    ? unreadCount
                  : item.to === '/admin/errors'     ? openErrorCount
                  : item.to === '/service-requests' ? pendingSrCount
                  : undefined
                }
              />
            </NavGate>
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
              {/* Same permission as the Import button on the guards list and the
                  /guards/import route, so the link appears exactly when the page opens. */}
              <PermissionGuard permission="guards.create">
                <NavLink
                  to="/guards/import"
                  onClick={onNavigate}
                  style={({ isActive }) => ({ ...SUB_ITEM_STYLE, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: isActive ? 600 : 400 })}
                >
                  <i className="bi bi-file-earmark-arrow-up" style={SUB_ICON_STYLE} />
                  <span>Bulk Import</span>
                </NavLink>
              </PermissionGuard>
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
              <NavLink
                to="/attendance/deployment-sheet"
                onClick={onNavigate}
                style={({ isActive }) => ({ ...SUB_ITEM_STYLE, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: isActive ? 600 : 400 })}
              >
                <i className="bi bi-table" style={SUB_ICON_STYLE} />
                <span>Deployment Sheet</span>
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

  const isErrorAdmin = !!user && (ERROR_ADMIN_ROLES as string[]).includes(user.role);
  const { data: errorStats } = useSystemErrorStats(isErrorAdmin);
  const openErrorCount = (errorStats?.openCritical ?? 0) + (errorStats?.openError ?? 0);

  // Unanswered client requests, so staff see them without opening the page.
  // The same permission the nav item and the route ask for. Reading a role
  // list here instead left the Accounts Officer seeing the page but never its
  // pending count, because the query behind the badge was switched off.
  const canSeeServiceRequests = useHasPermission('service_requests.view');
  const { data: srSummary } = useQuery({
    queryKey:        ['sr-summary'],
    queryFn:         serviceRequestsApi.getSummary,
    enabled:         canSeeServiceRequests,
    refetchInterval: 2 * 60_000,
  });
  const pendingSrCount = srSummary?.pending ?? 0;

  // A group starts open if the current path falls inside it
  function isGroupActive(group: NavGroup) {
    return group.items.some(item => pathname === item.to || pathname.startsWith(item.to + '/'));
  }

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
        {/* Standalone: Dashboard */}
        {STANDALONE_ITEMS.map(item => (
          <RoleGuard key={item.to} allowedRoles={item.roles ?? []}>
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
            openErrorCount={openErrorCount}
            pendingSrCount={pendingSrCount}
          />
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 10px' }} />

        {/* Standalone: Notifications */}
        <RoleGuard allowedRoles={NOTIFICATION_ITEM.roles ?? []}>
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
