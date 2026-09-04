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
      { key: 'pendingServiceRequests', label: 'Service Requests', icon: '🛠️', colour: alertWhenAny, linkTo: '/service-requests' },
      { key: 'activeStaff',     label: 'Active Staff',     icon: '👥', colour: 'teal',  linkTo: '/staff' },
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
      { key: 'pendingServiceRequests', label: 'Service Requests', icon: '🛠️', colour: alertWhenAny, linkTo: '/service-requests' },
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
      { key: 'activeStaff',      label: 'Active Staff',       icon: '👥', colour: 'teal', linkTo: '/staff' },
      { key: 'totalGuards',      label: 'Total Guards',       icon: '👮', colour: 'navy', linkTo: '/guards' },
      { key: 'totalClients',     label: 'Active Clients',     icon: '🏢', colour: 'teal', linkTo: '/clients' },
    ],
    feeds: [
      { key: 'recentErrors', title: 'Recent System Errors', icon: '🐛', emptyText: 'No open errors', linkTo: '/admin/errors' },
      { key: 'recentUsers',  title: 'Recently Added Users', icon: '👤', emptyText: 'No users yet', linkTo: '/staff' },
    ],
  },

  HR: {
    caption: 'Headcount, leave and discipline',
    stats: [
      { key: 'activeGuards',       label: 'Active Guards',       icon: '👮', colour: 'navy',  linkTo: '/guards' },
      { key: 'onLeaveToday',       label: 'On Leave Today',      icon: '🏖️', colour: 'teal',  linkTo: '/hr' },
      { key: 'pendingLeave',       label: 'Leave to Approve',    icon: '⏳', colour: alertWhenAny, linkTo: '/hr' },
      { key: 'recentDisciplinary', label: 'Disciplinary (30d)',  icon: '⚠️', colour: alertWhenAny, linkTo: '/hr' },
      { key: 'lettersThisMonth',   label: 'Letters This Month',  icon: '📝', colour: 'navy',  linkTo: '/hr' },
    ],
    feeds: [
      { key: 'pendingLeave', title: 'Leave awaiting approval', icon: '🏖️', emptyText: 'No leave requests waiting', linkTo: '/hr' },
      { key: 'guardsByRank', title: 'Active guards by rank',   icon: '👮', emptyText: 'No active guards',          linkTo: '/guards' },
    ],
  },

  CONTROL_ROOM: {
    caption: 'Complaints desk and live operations',
    stats: [
      { key: 'openComplaints',      label: 'Open Complaints',    icon: '📋', colour: dangerWhenAny, linkTo: '/complaints' },
      { key: 'unassignedCount',     label: 'Needs Assignment',   icon: '⚠️', colour: dangerWhenAny, linkTo: '/complaints' },
      { key: 'underInvestigation',  label: 'Under Investigation', icon: '🔍', colour: 'amber', linkTo: '/complaints' },
      { key: 'resolvedToday',       label: 'Resolved Today',     icon: '✅', colour: 'green', linkTo: '/complaints' },
      { key: 'deployedToday',       label: 'Guards Deployed',    icon: '📍', colour: 'navy',  linkTo: '/attendance' },
      { key: 'activeGuards',        label: 'Active Guards',      icon: '👮', colour: 'teal',  linkTo: '/guards' },
      { key: 'activeClients',       label: 'Active Clients',     icon: '🏢', colour: 'navy',  linkTo: '/clients' },
      { key: 'pendingRequisitions', label: 'Pending Requisitions', icon: '📝', colour: alertWhenAny, linkTo: '/requisitions' },
      { key: 'shiftReportsToday', label: 'Shift Reports Today', icon: '📑', colour: 'navy', linkTo: '/control-room/shift-reports' },
      { key: 'shiftReportsAwaitingAck', label: 'Awaiting Acknowledgement', icon: '⏳', colour: alertWhenAny, linkTo: '/control-room/shift-reports?status=SUBMITTED' },
    ],
    feeds: [
      { key: 'unassignedComplaints', title: 'Needs Assignment', icon: '⚠️', emptyText: 'Everything is assigned', linkTo: '/complaints' },
      { key: 'activeComplaints',     title: 'Active Complaints', icon: '📋', emptyText: 'No open complaints', linkTo: '/complaints' },
    ],
  },

  MARKETING: {
    caption: 'Sales pipeline and targets',
    stats: [
      { key: 'totalProspects',   label: 'Total Prospects',   icon: '👥', colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',       icon: '🔄', colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',      icon: '✅', colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',        icon: '❌', colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate',   icon: '📈', colour: 'navy',  linkTo: '/marketing/reports', format: v => `${v}%` },
      { key: 'activeBids',       label: 'Active Bids',       icon: '📋', colour: 'amber', linkTo: '/marketing/bids' },
      { key: 'upcomingExpiries', label: 'Expiring Contracts', icon: '📅', colour: alertWhenAny, linkTo: '/clients' },
      { key: 'targetProgress',   label: 'Target Progress',   icon: '🎯', colour: 'green', linkTo: '/marketing/targets', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'Pipeline', icon: '🔄', emptyText: 'No prospects yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: '🕓', emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
    ],
  },

  // Full pipeline: targets and bids are this role's to run.
  MARKETING_HEAD: {
    caption: 'Sales pipeline and targets — all sales staff',
    stats: [
      { key: 'totalProspects',   label: 'Total Prospects',   icon: '👥', colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',       icon: '🔄', colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',      icon: '✅', colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',        icon: '❌', colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate',   icon: '📈', colour: 'navy',  linkTo: '/marketing/reports', format: v => `${v}%` },
      { key: 'activeBids',       label: 'Active Bids',       icon: '📋', colour: 'amber', linkTo: '/marketing/bids' },
      { key: 'upcomingExpiries', label: 'Expiring Contracts', icon: '📅', colour: alertWhenAny, linkTo: '/clients' },
      { key: 'targetProgress',   label: 'Target Progress',   icon: '🎯', colour: 'green', linkTo: '/marketing/targets', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'Pipeline', icon: '🔄', emptyText: 'No prospects yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: '🕓', emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
    ],
  },

  // Own leads only. No bids or targets tiles — the API scopes the figures, and
  // linking to pages this role cannot open would only produce a 403.
  SALES: {
    caption: 'Your leads and targets',
    stats: [
      { key: 'totalProspects',   label: 'My Leads',        icon: '👥', colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',     icon: '🔄', colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',    icon: '✅', colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',      icon: '❌', colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate', icon: '📈', colour: 'navy',  format: v => `${v}%` },
      { key: 'targetProgress',   label: 'My Target',       icon: '🎯', colour: 'green', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'My Pipeline', icon: '🔄', emptyText: 'No leads assigned to you yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: '🕓', emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
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
