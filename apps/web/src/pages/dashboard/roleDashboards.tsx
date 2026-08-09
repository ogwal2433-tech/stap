import type { DashboardData, DashboardFeedItem, DashboardRole } from '@stap/shared';
import type { StatColour } from './StatCard';

/**
 * Per-role dashboard layout.
 *
 * Each role's cards and feeds are described as data rather than as seven
 * near-identical components — they only ever differ in which keys they read,
 * which labels they show and where they link, so a table keeps them in step
 * and makes adding a role a single entry.
 */

export interface StatSpec {
  key:      string;
  label:    string;
  icon:     string;
  colour:   StatColour | ((v: number) => StatColour);
  linkTo?:  string;
  /** Renders the raw number — used for money, percentages, etc. */
  format?:  (v: number) => string;
  subtext?: string;
}

export interface FeedSpec {
  key:       string;
  title:     string;
  icon:      string;
  emptyText: string;
  linkTo:    string;
  itemLink?: (item: DashboardFeedItem) => string;
}

export interface RoleDashboardSpec {
  /** Shown under the greeting so the user knows what this view is scoped to. */
  caption: string;
  stats:   StatSpec[];
  feeds:   FeedSpec[];
}

const ugxCompact = (n: number): string => {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `UGX ${(n / 1_000).toFixed(0)}K`;
  return `UGX ${n.toLocaleString()}`;
};

/** Amber once there is something outstanding, green when the queue is clear. */
const alertWhenAny = (v: number): StatColour => (v > 0 ? 'amber' : 'green');
const dangerWhenAny = (v: number): StatColour => (v > 0 ? 'red' : 'green');

export const ROLE_DASHBOARDS: Record<DashboardRole, RoleDashboardSpec> = {
  DIRECTOR: {
    caption: 'Company-wide overview',
    stats: [
      { key: 'totalGuards',     label: 'Total Guards',     icon: '👮', colour: 'navy',  linkTo: '/guards' },
      { key: 'activeGuards',    label: 'Active Guards',    icon: '✅', colour: 'green', linkTo: '/guards?status=ACTIVE' },
      { key: 'guardsOnLeave',   label: 'Guards on Leave',  icon: '🌴', colour: 'grey',  linkTo: '/guards?status=ON_LEAVE' },
      { key: 'activeClients',   label: 'Active Clients',   icon: '🏢', colour: 'teal',  linkTo: '/clients' },
      { key: 'openComplaints',  label: 'Open Complaints',  icon: '📋', colour: alertWhenAny, linkTo: '/complaints' },
      { key: 'pendingInvoices', label: 'Unpaid Invoices',  icon: '📄', colour: alertWhenAny, linkTo: '/finance' },
      { key: 'monthlyRevenue',  label: 'Revenue This Month', icon: '💰', colour: 'green', linkTo: '/finance', format: ugxCompact },
    ],
    feeds: [
      { key: 'recentComplaints',       title: 'Open Complaints',   icon: '📋', emptyText: 'No open complaints', linkTo: '/complaints' },
      { key: 'recentInvoices',         title: 'Unpaid Invoices',   icon: '📄', emptyText: 'Nothing outstanding', linkTo: '/finance' },
      { key: 'guardsNeedingAttention', title: 'Needs Attention',   icon: '⚠️', emptyText: 'All guards accounted for', linkTo: '/guards', itemLink: g => `/guards/${g.id}` },
    ],
  },

  OPERATIONS_SUPERVISOR: {
    caption: 'Deployment and roster overview',
    stats: [
      { key: 'activeGuards',      label: 'Active Guards',    icon: '👮', colour: 'navy',  linkTo: '/guards?status=ACTIVE' },
      { key: 'deployedToday',     label: 'Deployed Today',   icon: '📍', colour: 'teal',  linkTo: '/attendance' },
      { key: 'undeployedGuards',  label: 'Not Deployed',     icon: '🕓', colour: alertWhenAny, linkTo: '/guards?status=ACTIVE' },
      { key: 'absentToday',       label: 'Absent Today',     icon: '🚫', colour: dangerWhenAny, linkTo: '/attendance' },
      { key: 'sitesCoveredToday', label: 'Sites Covered',    icon: '🏭', colour: 'navy',  linkTo: '/zones' },
      { key: 'openComplaints',    label: 'Open Complaints',  icon: '📋', colour: alertWhenAny, linkTo: '/complaints' },
    ],
    feeds: [
      { key: 'undeployedGuards', title: 'Awaiting Deployment', icon: '🕓', emptyText: 'Everyone is deployed', linkTo: '/attendance', itemLink: g => `/guards/${g.id}` },
      { key: 'recentTransfers',  title: 'Recent Transfers',    icon: '🔄', emptyText: 'No recent transfers', linkTo: '/guards' },
    ],
  },

  FIELD_SUPERVISOR: {
    caption: 'Attendance in your zones',
    stats: [
      { key: 'zonesCovered',   label: 'My Zones',        icon: '🗺️', colour: 'navy',  linkTo: '/zones' },
      { key: 'sitesInZones',   label: 'Sites in Zones',  icon: '🏭', colour: 'navy',  linkTo: '/zones' },
      { key: 'guardsOnDuty',   label: 'Guards on Duty',  icon: '👮', colour: 'teal',  linkTo: '/attendance' },
      { key: 'absentToday',    label: 'Absent Today',    icon: '🚫', colour: dangerWhenAny, linkTo: '/attendance' },
      { key: 'attendanceRate', label: 'Attendance Rate', icon: '📊', colour: 'green', linkTo: '/attendance', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'todaysAttendance', title: "Today's Attendance", icon: '🗓️', emptyText: 'Nothing marked yet today', linkTo: '/attendance' },
      { key: 'myZones',          title: 'My Zones',           icon: '🗺️', emptyText: 'No zones assigned to you', linkTo: '/zones', itemLink: z => `/zones/${z.id}` },
    ],
  },

  ACCOUNTS_OFFICER: {
    caption: 'Billing and payments',
    stats: [
      { key: 'totalOutstanding',    label: 'Total Outstanding', icon: '💸', colour: dangerWhenAny, linkTo: '/finance', format: ugxCompact },
      { key: 'paidThisMonth',       label: 'Paid This Month',   icon: '💰', colour: 'green', linkTo: '/finance', format: ugxCompact },
      { key: 'unpaidInvoices',      label: 'Unpaid Invoices',   icon: '📄', colour: alertWhenAny, linkTo: '/finance' },
      { key: 'overdueInvoices',     label: 'Overdue',           icon: '⏰', colour: dangerWhenAny, linkTo: '/finance' },
      { key: 'pendingRequisitions', label: 'Requisitions',      icon: '🧾', colour: alertWhenAny, linkTo: '/requisitions', subtext: 'Awaiting sign-off' },
      { key: 'payrollRunsPending',  label: 'Payroll Runs Open', icon: '📑', colour: alertWhenAny, linkTo: '/finance' },
    ],
    feeds: [
      { key: 'overdueInvoices', title: 'Overdue Invoices', icon: '⏰', emptyText: 'Nothing overdue', linkTo: '/finance' },
      { key: 'recentInvoices',  title: 'Recent Invoices',  icon: '📄', emptyText: 'No invoices yet', linkTo: '/finance' },
    ],
  },

  ADMINISTRATOR: {
    caption: 'System health and accounts',
    stats: [
      { key: 'openSystemErrors', label: 'Open System Errors', icon: '🐛', colour: dangerWhenAny, linkTo: '/admin/errors' },
      { key: 'totalUsers',       label: 'User Accounts',      icon: '👤', colour: 'navy', linkTo: '/settings' },
      { key: 'totalGuards',      label: 'Total Guards',       icon: '👮', colour: 'navy', linkTo: '/guards' },
      { key: 'totalClients',     label: 'Active Clients',     icon: '🏢', colour: 'teal', linkTo: '/clients' },
    ],
    feeds: [
      { key: 'recentErrors', title: 'Recent System Errors', icon: '🐛', emptyText: 'No open errors', linkTo: '/admin/errors' },
      { key: 'recentUsers',  title: 'Recently Added Users', icon: '👤', emptyText: 'No users yet', linkTo: '/settings' },
    ],
  },

  HR: {
    caption: 'People and records',
    stats: [
      { key: 'totalGuards',        label: 'Guards on Books',  icon: '👮', colour: 'navy',  linkTo: '/guards' },
      { key: 'newGuardsThisMonth', label: 'New This Month',   icon: '🆕', colour: 'teal',  linkTo: '/guards' },
      { key: 'guardsOnLeave',      label: 'On Leave',         icon: '🌴', colour: 'grey',  linkTo: '/guards?status=ON_LEAVE' },
      { key: 'openDisciplinary',   label: 'Suspended',        icon: '⚠️', colour: alertWhenAny, linkTo: '/guards?status=SUSPENDED' },
      { key: 'pendingLetters',     label: 'Letters to Approve', icon: '✉️', colour: alertWhenAny, linkTo: '/hr' },
    ],
    feeds: [
      { key: 'recentGuards',   title: 'Recently Added',     icon: '🆕', emptyText: 'No new guards this month', linkTo: '/guards', itemLink: g => `/guards/${g.id}` },
      { key: 'pendingLetters', title: 'Letters to Approve', icon: '✉️', emptyText: 'Nothing awaiting approval', linkTo: '/hr' },
    ],
  },

  CLIENT: {
    caption: 'Your account with STAP Security',
    stats: [
      { key: 'activeSites',         label: 'Your Sites',        icon: '🏭', colour: 'navy',  linkTo: '/portal' },
      { key: 'activeContracts',     label: 'Active Contracts',  icon: '📝', colour: 'teal',  linkTo: '/portal' },
      { key: 'unpaidInvoices',      label: 'Unpaid Invoices',   icon: '📄', colour: alertWhenAny, linkTo: '/portal' },
      { key: 'openComplaints',      label: 'Open Complaints',   icon: '📋', colour: alertWhenAny, linkTo: '/portal' },
      { key: 'openServiceRequests', label: 'Service Requests',  icon: '🛠️', colour: alertWhenAny, linkTo: '/portal' },
    ],
    feeds: [
      { key: 'recentInvoices',   title: 'Recent Invoices',   icon: '📄', emptyText: 'No invoices yet', linkTo: '/portal' },
      { key: 'recentComplaints', title: 'Recent Complaints', icon: '📋', emptyText: 'No complaints raised', linkTo: '/portal' },
    ],
  },
};

export function specForRole(data: DashboardData): RoleDashboardSpec {
  return ROLE_DASHBOARDS[data.role] ?? ROLE_DASHBOARDS.HR;
}
