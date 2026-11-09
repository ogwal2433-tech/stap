import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Offcanvas } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useSystemErrorStats } from '../../hooks/useSystemErrors';
import { serviceRequestsApi } from '../../lib/serviceRequests.api';
import { DELETE_PERMISSIONS } from '../../lib/deletedRecords.api';
import RoleGuard from '../RoleGuard';
import PermissionGuard from '../PermissionGuard';
import InitialsAvatar from '../ui/InitialsAvatar';
import { APP_NAME, APP_TAGLINE } from '../../lib/branding';
import {
  ROLES,
  INTERNAL_ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  DEPLOYMENT_VIEW_ROLES,
  REPORT_ROLES,
  type UserRole,
} from '@security360/shared';

const ADMIN_ONLY       = [ROLES.DIRECTOR, ROLES.MD, ROLES.ADMINISTRATOR];
// Who runs the staff directory. Mirrors STAFF_MANAGER_ROLES on the API.
const STAFF_MANAGER_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const ERROR_ADMIN_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];
const NON_GUARD_INTERNAL = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD);
// Firearms are the Trainer's to issue; Operations can see what is on its sites.
const MARKETING_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING_HEAD, ROLES.SALES];
const GUN_VIEW_ROLES = [
  ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR,
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
  excludeRoles?: UserRole[];
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
      { icon: 'bi-flag-fill',          label: 'Deserters',  to: '/guards/deserters', roles: [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.HR, ROLES.OPERATIONS_SUPERVISOR] as UserRole[], permission: 'guards.view', excludeRoles: [ROLES.CONTROL_ROOM] as UserRole[]},
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
      { icon: 'bi-building-fill',      label: 'Clients',    to: '/clients',    roles: NON_GUARD_INTERNAL.filter(r => r !== ROLES.CONTROL_ROOM) as UserRole[] , permission: 'clients.view'},
      { icon: 'bi-map-fill',           label: 'Zones',      to: '/zones',      roles: [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR] as UserRole[], permission: 'roster.view', excludeRoles: [ROLES.CONTROL_ROOM] as UserRole[] },
      { icon: 'bi-graph-up-arrow',      label: 'Marketing',  to: '/marketing',  roles: MARKETING_ROLES as UserRole[] , permission: 'marketing.view', excludeRoles: [ROLES.CONTROL_ROOM] as UserRole[]},
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
      { icon: 'bi-bar-chart-fill', label: 'Reports', to: '/reports', permission: 'reports.view'},
{ icon: 'bi-file-earmark-spreadsheet', label: 'Payroll Report', to: '/payroll-report', roles: REPORT_ROLES as UserRole[] , permission: 'reports.view', excludeRoles: [ROLES.CONTROL_ROOM] as UserRole[]},
{ icon: 'bi-clipboard2-pulse', label: 'Deployment Report', to: '/deployment-report', roles: REPORT_ROLES as UserRole[] , permission: 'reports.view', excludeRoles: [ROLES.CONTROL_ROOM] as UserRole[]},
    ],
  },
  {
    id:    'system',
    icon:  'bi-gear-fill',
    label: 'System',
    items: [
      { icon: 'bi-person-badge-fill',   label: 'Staff',         to: '/staff',         roles: STAFF_MANAGER_ROLES as UserRole[] , permission: 'staff.view'},
      { icon: 'bi-gear-fill',           label: 'Settings',      to: '/settings',      roles: [ROLES.DIRECTOR, ROLES.MD] as UserRole[] , permission: 'settings.view'},
      { icon: 'bi-shield-lock-fill',    label: 'Roles & Permissions', to: '/settings/roles', roles: ADMIN_ONLY as UserRole[] , permission: 'roles.manage'},
      { icon: 'bi-clock-history',       label: 'Scheduled Jobs', to: '/settings/scheduled-jobs', permission: 'settings.view' },
      { icon: 'bi-plug-fill',           label: 'Integrations', to: '/settings/integrations', roles: [ROLES.DIRECTOR, ROLES.MD] as UserRole[], permission: 'settings.edit' },
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
  '/hr', '/reports', '/payroll-report', '/deployment-report', '/settings', '/settings/roles', '/settings/integrations', '/staff', '/notifications', '/guns', '/marketing',
  '/guards/dashboard', '/guards/import', '/guards/deserters',
  '/attendance/dashboard', '/admin/errors', '/admin/audit-log', '/admin/deleted', '/admin/security-log',
]);

const ROLE_BADGE: Record<string, string> = {
  DIRECTOR:              '#1B3A6B',
  ASSISTANT_MANAGER:     '#0E7490',
  ADMINISTRATOR:         '#475467',
  OPERATIONS_SUPERVISOR: '#B54708',
  FIELD_SUPERVISOR:      '#B54708',
  ACCOUNTS_OFFICER:      '#027A48',
  CONTROL_ROOM:          '#C4320A',
  TRAINER:               '#475467',
  MARKETING:             '#0F7B6C',
  GUARD:                 '#667085',
  CLIENT:                '#667085',
};

/**
 * Shows a nav item when the user's role holds its permission, falling back to
 * the role list for the handful of items that have no permission of their own.
 *
 * Both the item and the route behind it now read the same permission, which is
 * what stops the sidebar offering a page the router then refuses.
 */
function NavGate({ item, children }: { item: NavItem; children: React.ReactNode }) {
  const { permissions, isLoading, user } = useAuth();
  if (item.excludeRoles?.includes(user?.role as UserRole)) return null;
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

/**
 * Sidebar nav styling lives in one scoped stylesheet (SIDEBAR_CSS in NavContent)
 * rather than inline styles: hover, focus-visible and the active tab need
 * pseudo-classes, which inline styles cannot express without !important hacks.
 * Layout stays inline so sub-items can adjust padding without new classes.
 */

const ITEM_STYLE: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            9,
  padding:        '7px 12px',
  borderRadius:   8,
  margin:         '1px 8px',
  textDecoration: 'none',
  whiteSpace:     'nowrap',
  overflow:       'hidden',
  textOverflow:   'ellipsis',
  fontSize:       '0.815rem',
  width:          'calc(100% - 16px)',
  boxSizing:      'border-box',
  position:       'relative',
};

const ICON_STYLE: React.CSSProperties = {
  fontSize:   '0.9rem',
  width:      18,
  flexShrink: 0,
  textAlign:  'center',
};

const SUB_ITEM_STYLE: React.CSSProperties = {
  ...ITEM_STYLE,
  padding:     '5px 12px 5px 30px',
  fontSize:    '0.775rem',
};

const SUB_ICON_STYLE: React.CSSProperties = {
  fontSize:   '0.78rem',
  width:      15,
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
      <div className="nav-link nav-soon" style={baseStyle} title="Coming soon">
        <i className={`bi ${item.icon}`} style={iconStyle} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
        <span className="nav-soon-chip">Soon</span>
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={isActive ? 'nav-link active' : 'nav-link'}
      style={baseStyle}
    >
      <i className={`bi ${item.icon}`} style={iconStyle} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.label}</span>
      {unreadBadge != null && unreadBadge > 0 && (
        <span className="nav-badge">{unreadBadge > 99 ? '99+' : unreadBadge}</span>
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
    <div style={{ marginBottom: 3 }}>
      {/* Group header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={hasActiveItem ? 'nav-group-btn active' : 'nav-group-btn'}
        aria-expanded={effectiveOpen}
      >
        <i className={`bi ${group.icon}`} style={{ fontSize: '0.78rem', width: 16, flexShrink: 0, textAlign: 'center' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
        <i
          className="bi bi-chevron-down nav-group-chevron"
          style={{ transform: effectiveOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
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
              <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR] as UserRole[]}>
                <NavLink
                  to="/guards/dashboard"
                  onClick={onNavigate}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  style={SUB_ITEM_STYLE}
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
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  style={SUB_ITEM_STYLE}
                >
                  <i className="bi bi-file-earmark-arrow-up" style={SUB_ICON_STYLE} />
                  <span>Bulk Import</span>
                </NavLink>
              </PermissionGuard>
            </>
          )}

          {/* Sub-nav: Attendance */}
          {group.id === 'operations' && pathname.startsWith('/attendance') && (
            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.ADMINISTRATOR] as UserRole[]}>
              <NavLink
                to="/attendance/dashboard"
                onClick={onNavigate}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                style={SUB_ITEM_STYLE}
              >
                <i className="bi bi-bar-chart-fill" style={SUB_ICON_STYLE} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/attendance/deployment-sheet"
                onClick={onNavigate}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                style={SUB_ITEM_STYLE}
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

/**
 * Sidebar nav stylesheet. Scoped class names (nav-link, nav-group-btn, …)
 * rather than inline styles because hover, focus-visible and the active tab
 * are pseudo-classes — inline styles cannot express them without !important
 * overrides that then beat each other unpredictably.
 */
const SIDEBAR_CSS = `
  .nav-link {
    color: #344054;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    outline: none;
    transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .nav-link:hover {
    background: #F2F4F7;
    color: #1B3A6B;
  }
  .nav-link:focus-visible {
    background: #F2F4F7;
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(27, 58, 107, 0.35);
  }
  .nav-link.active {
    background: #EEF3FA;
    color: #1B3A6B;
    font-weight: 600;
    font-size: 0.85rem;
    box-shadow: inset 3px 0 0 0 #1B3A6B;
  }
  .nav-link.active:hover {
    background: #E8EEF8;
    color: #1B3A6B;
  }
  .nav-link .bi { transition: color 140ms ease; }
  .nav-link:not(.active):hover .bi { color: #1B3A6B; }
  .nav-link.active .bi { color: #1B3A6B; }

  .nav-soon {
    color: #98A2B3;
    cursor: not-allowed;
  }
  .nav-soon-chip {
    margin-left: auto;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    background: #EAECF0;
    color: #667085;
    border-radius: 4px;
    padding: 1px 5px;
    flex-shrink: 0;
  }

  .nav-badge {
    margin-left: auto;
    flex-shrink: 0;
    min-width: 18px;
    text-align: center;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1.35rem;
    padding: 0 5px;
    border-radius: 999px;
    background: #D92D20;
    color: #fff;
  }

  .nav-group-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    color: #667085;
    cursor: pointer;
    text-align: left;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 12px 5px;
    box-sizing: border-box;
    border-radius: 6px;
    margin: 0 8px;
    width: calc(100% - 16px);
    transition: color 140ms ease;
    outline: none;
  }
  .nav-group-btn:hover { color: #1B3A6B; }
  .nav-group-btn:focus-visible {
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(27, 58, 107, 0.35);
  }
  .nav-group-btn.active { color: #1B3A6B; }
  .nav-group-chevron {
    font-size: 0.62rem;
    opacity: 0.55;
    flex-shrink: 0;
    transition: transform 180ms ease, opacity 140ms ease;
  }
  .nav-group-btn:hover .nav-group-chevron { opacity: 0.9; }

  .s360-side-scroll { scrollbar-width: thin; scrollbar-color: #D0D5DD transparent; }
  .s360-side-scroll::-webkit-scrollbar { width: 5px; }
  .s360-side-scroll::-webkit-scrollbar-track { background: transparent; }
  .s360-side-scroll::-webkit-scrollbar-thumb { background: #D0D5DD; border-radius: 999px; }
  .s360-side-scroll::-webkit-scrollbar-thumb:hover { background: #98A2B3; }

  @media (prefers-reduced-motion: reduce) {
    .nav-link, .nav-group-btn, .nav-group-chevron, .nav-link .bi { transition: none; }
  }
`;

function NavContent({ onNavigate }: NavContentProps) {
  const { user } = useAuth();
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
      {/* One scoped stylesheet for the nav: hover/focus/active need
          pseudo-classes, which inline styles cannot express cleanly. */}
      <style>{SIDEBAR_CSS}</style>
      {/* Logo */}
      <div className="px-3 py-4" style={{ borderBottom: '1px solid #E4E7EC' }}>
        <div className="fw-bold fs-5" style={{ color: '#1B3A6B' }}>{APP_NAME}</div>
        <div className="small" style={{ color: '#667085' }}>{APP_TAGLINE}</div>
      </div>

      {/* Nav — vertical only, clip horizontal overflow */}
      <div className="s360-side-scroll" style={{
        display:    'flex',
        flexDirection: 'column',
        flexGrow:   1,
        overflowY:  'auto',
        overflowX:  'hidden',
        paddingTop: 8,
        paddingBottom: 8,
      }}>
        {/* Standalone: Dashboard */}
        {STANDALONE_ITEMS.map(item => (
          <RoleGuard key={item.to} allowedRoles={item.roles ?? []}>
            <NavItemLink item={item} onNavigate={onNavigate} />
          </RoleGuard>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: '#EAECF0', margin: '6px 10px' }} />

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
        <div style={{ height: 1, background: '#EAECF0', margin: '6px 10px' }} />

        {/* Standalone: Notifications */}
        <RoleGuard allowedRoles={NOTIFICATION_ITEM.roles ?? []}>
          <NavItemLink item={NOTIFICATION_ITEM} onNavigate={onNavigate} unreadBadge={unreadCount} />
        </RoleGuard>
      </div>

      {/* User footer */}
      {user && (
        <div className="px-3 py-3" style={{ borderTop: '1px solid #E4E7EC' }}>
          <div className="d-flex align-items-center gap-2">
            <InitialsAvatar name={user.name} size={32} />
            <div className="overflow-hidden">
              <div className="small fw-medium text-truncate" style={{ color: '#101828' }}>{user.name}</div>
              <div
                className="small text-truncate"
                style={{ color: ROLE_BADGE[user.role] ?? '#667085', fontSize: '0.7rem' }}
              >
                {user.role.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
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
  const SIDEBAR_BG = '#FFFFFF';

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="d-none d-md-flex flex-column"
        style={{
          width:           220,
          minHeight:       '100vh',
          backgroundColor: SIDEBAR_BG,
          borderRight:     '1px solid #E4E7EC',
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
          closeVariant="dark"
          style={{ borderBottom: '1px solid #E4E7EC' }}
        />
        <Offcanvas.Body className="p-0">
          <NavContent onNavigate={onMobileClose} />
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
