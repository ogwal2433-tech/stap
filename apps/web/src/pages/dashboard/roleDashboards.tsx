import type { DashboardData, DashboardFeedItem, DashboardRole } from '@security360/shared';
import { DEFAULT_COMPANY_NAME } from '@security360/shared';
import type { ReactNode } from 'react';
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
  icon:     string | ReactNode;
  colour:   StatColour | ((v: number) => StatColour);
  linkTo?:  string;
  /** Renders the raw number — used for money, percentages, etc. */
  format?:  (v: number) => string;
  subtext?: string;
}

export interface FeedSpec {
  key:       string;
  title:     string;
  icon:      string | ReactNode;
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
/** Red while the month is in the red, green once it earns. */
const redWhenNegative = (v: number): StatColour => (v < 0 ? 'red' : 'green');

export const ROLE_DASHBOARDS: Record<DashboardRole, RoleDashboardSpec> = {
  DIRECTOR: {
    caption: 'Company-wide overview',
    stats: [
      { key: 'totalGuards',     label: 'Total Guards',     icon: <i className="bi bi-person-badge" />, colour: 'navy',  linkTo: '/guards' },
      { key: 'activeGuards',    label: 'Active Guards',    icon: <i className="bi bi-check-circle" />, colour: 'green', linkTo: '/guards?status=ACTIVE' },
      { key: 'desertedGuards', label: 'Deserted', icon: <i className="bi bi-flag" />, colour: dangerWhenAny, linkTo: '/guards/deserters', subtext: 'Needs review' },
      { key: 'guardsOnLeave',   label: 'Guards on Leave',  icon: <i className="bi bi-tree" />, colour: 'grey',  linkTo: '/guards?status=ON_LEAVE' },
      { key: 'activeClients',   label: 'Active Clients',   icon: <i className="bi bi-building" />, colour: 'teal',  linkTo: '/clients' },
      { key: 'openComplaints',  label: 'Open Complaints',  icon: <i className="bi bi-clipboard-check" />, colour: alertWhenAny, linkTo: '/complaints' },
      { key: 'pendingServiceRequests', label: 'Service Requests', icon: <i className="bi bi-tools" />, colour: alertWhenAny, linkTo: '/service-requests' },
      { key: 'activeStaff',     label: 'Active Staff',     icon: <i className="bi bi-people" />, colour: 'teal',  linkTo: '/staff' },
      { key: 'pendingInvoices', label: 'Unpaid Invoices',  icon: <i className="bi bi-file-earmark-text" />, colour: alertWhenAny, linkTo: '/finance' },
      // Money In / Money Out / Revenue tiles removed per MD request — the
      // Income & Expenses report carries those figures (and the drill-down).
      { key: 'netRevenueThisMonth', label: 'Net Revenue',          icon: <i className="bi bi-balance-scale" />, colour: redWhenNegative, linkTo: '/reports', format: ugxCompact, subtext: 'Money in minus money out' },
    ],
    feeds: [
      { key: 'recentComplaints',       title: 'Open Complaints',   icon: <i className="bi bi-clipboard-check" />, emptyText: 'No open complaints', linkTo: '/complaints' },
      { key: 'recentInvoices',         title: 'Unpaid Invoices',   icon: <i className="bi bi-file-earmark-text" />, emptyText: 'Nothing outstanding', linkTo: '/finance' },
      { key: 'guardsNeedingAttention', title: 'Needs Attention',   icon: <i className="bi bi-exclamation-triangle" />, emptyText: 'All guards accounted for', linkTo: '/guards', itemLink: g => `/guards/${g.id}` },
    ],
  },

  OPERATIONS_SUPERVISOR: {
    caption: 'Deployment and roster overview',
    stats: [
      { key: 'activeGuards',      label: 'Active Guards',    icon: <i className="bi bi-person-badge" />, colour: 'navy',  linkTo: '/guards?status=ACTIVE' },
      { key: 'deployedToday',     label: 'Deployed Today',   icon: <i className="bi bi-geo-alt" />, colour: 'teal',  linkTo: '/attendance' },
      { key: 'undeployedGuards',  label: 'Not Deployed',     icon: <i className="bi bi-clock" />, colour: alertWhenAny, linkTo: '/guards?status=ACTIVE' },
      { key: 'absentToday',       label: 'Absent Today',     icon: <i className="bi bi-slash-circle" />, colour: dangerWhenAny, linkTo: '/attendance' },
      { key: 'sitesCoveredToday', label: 'Sites Covered',    icon: <i className="bi bi-diagram-3" />, colour: 'navy',  linkTo: '/zones' },
      { key: 'openComplaints',    label: 'Open Complaints',  icon: <i className="bi bi-clipboard-check" />, colour: alertWhenAny, linkTo: '/complaints' },
      { key: 'pendingServiceRequests', label: 'Service Requests', icon: <i className="bi bi-tools" />, colour: alertWhenAny, linkTo: '/service-requests' },
    ],
    feeds: [
      { key: 'undeployedGuards', title: 'Awaiting Deployment', icon: <i className="bi bi-clock" />, emptyText: 'Everyone is deployed', linkTo: '/attendance', itemLink: g => `/guards/${g.id}` },
      { key: 'recentTransfers',  title: 'Recent Transfers',    icon: <i className="bi bi-arrow-repeat" />, emptyText: 'No recent transfers', linkTo: '/guards' },
    ],
  },

  FIELD_SUPERVISOR: {
    caption: 'Attendance in your zones',
    stats: [
      { key: 'zonesCovered',   label: 'My Zones',        icon: <i className="bi bi-map" />, colour: 'navy',  linkTo: '/zones' },
      { key: 'sitesInZones',   label: 'Sites in Zones',  icon: <i className="bi bi-diagram-3" />, colour: 'navy',  linkTo: '/zones' },
      { key: 'guardsOnDuty',   label: 'Guards on Duty',  icon: <i className="bi bi-person-badge" />, colour: 'teal',  linkTo: '/attendance' },
      { key: 'absentToday',    label: 'Absent Today',    icon: <i className="bi bi-slash-circle" />, colour: dangerWhenAny, linkTo: '/attendance' },
      { key: 'attendanceRate', label: 'Attendance Rate', icon: <i className="bi bi-bar-chart" />, colour: 'green', linkTo: '/attendance', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'todaysAttendance', title: "Today's Attendance", icon: <i className="bi bi-calendar-month" />, emptyText: 'Nothing marked yet today', linkTo: '/attendance' },
      { key: 'myZones',          title: 'My Zones',           icon: <i className="bi bi-map" />, emptyText: 'No zones assigned to you', linkTo: '/zones', itemLink: z => `/zones/${z.id}` },
    ],
  },

  ACCOUNTS_OFFICER: {
    caption: 'Billing and payments',
    stats: [
      { key: 'totalOutstanding',    label: 'Total Outstanding', icon: <i className="bi bi-cash-coin" />, colour: dangerWhenAny, linkTo: '/finance', format: ugxCompact },
      { key: 'paidThisMonth',       label: 'Paid This Month',   icon: <i className="bi bi-cash-stack" />, colour: 'green', linkTo: '/finance', format: ugxCompact },
      { key: 'unpaidInvoices',      label: 'Unpaid Invoices',   icon: <i className="bi bi-file-earmark-text" />, colour: alertWhenAny, linkTo: '/finance' },
      { key: 'overdueInvoices',     label: 'Overdue',           icon: <i className="bi bi-alarm" />, colour: dangerWhenAny, linkTo: '/finance' },
      { key: 'pendingRequisitions', label: 'Requisitions',      icon: <i className="bi bi-receipt" />, colour: alertWhenAny, linkTo: '/requisitions', subtext: 'Awaiting sign-off' },
      { key: 'payrollRunsPending',  label: 'Payroll Runs Open', icon: <i className="bi bi-files" />, colour: alertWhenAny, linkTo: '/finance' },
    ],
    feeds: [
      { key: 'overdueInvoices', title: 'Overdue Invoices', icon: <i className="bi bi-alarm" />, emptyText: 'Nothing overdue', linkTo: '/finance' },
      { key: 'recentInvoices',  title: 'Recent Invoices',  icon: <i className="bi bi-file-earmark-text" />, emptyText: 'No invoices yet', linkTo: '/finance' },
    ],
  },

  ADMINISTRATOR: {
    caption: 'System health and accounts',
    stats: [
      { key: 'openSystemErrors', label: 'Open System Errors', icon: <i className="bi bi-bug" />, colour: dangerWhenAny, linkTo: '/admin/errors' },
      { key: 'totalUsers',       label: 'User Accounts',      icon: <i className="bi bi-person" />, colour: 'navy', linkTo: '/settings' },
      { key: 'activeStaff',      label: 'Active Staff',       icon: <i className="bi bi-people" />, colour: 'teal', linkTo: '/staff' },
      { key: 'totalGuards',      label: 'Total Guards',       icon: <i className="bi bi-person-badge" />, colour: 'navy', linkTo: '/guards' },
      { key: 'totalClients',     label: 'Active Clients',     icon: <i className="bi bi-building" />, colour: 'teal', linkTo: '/clients' },
    ],
    feeds: [
      { key: 'recentErrors', title: 'Recent System Errors', icon: <i className="bi bi-bug" />, emptyText: 'No open errors', linkTo: '/admin/errors' },
      { key: 'recentUsers',  title: 'Recently Added Users', icon: <i className="bi bi-person" />, emptyText: 'No users yet', linkTo: '/staff' },
    ],
  },

  HR: {
    caption: 'Headcount, leave and discipline',
    stats: [
      { key: 'activeGuards',       label: 'Active Guards',       icon: <i className="bi bi-person-badge" />, colour: 'navy',  linkTo: '/guards' },
      { key: 'desertedGuards', label: 'Deserted', icon: <i className="bi bi-flag" />, colour: dangerWhenAny, linkTo: '/guards/deserters', subtext: 'Needs review' },
      { key: 'onLeaveToday',       label: 'On Leave Today',      icon: <i className="bi bi-umbrella" />, colour: 'teal',  linkTo: '/hr' },
      { key: 'pendingLeave',       label: 'Leave to Approve',    icon: <i className="bi bi-hourglass-split" />, colour: alertWhenAny, linkTo: '/hr' },
      { key: 'recentDisciplinary', label: 'Disciplinary (30d)',  icon: <i className="bi bi-exclamation-triangle" />, colour: alertWhenAny, linkTo: '/hr' },
      { key: 'lettersThisMonth',   label: 'Letters This Month',  icon: <i className="bi bi-pencil-square" />, colour: 'navy',  linkTo: '/hr' },
      { key: 'guardsOwnId',      label: 'On Own National ID', icon: <i className="bi bi-person-vcard" />, colour: 'navy',  linkTo: '/guards?idType=OWN_ID' },
      { key: 'guardsRelativeId', label: "On a Relative's ID",  icon: <i className="bi bi-people" />, colour: 'teal',  linkTo: '/guards?idType=RELATIVE_ID' },
      { key: 'guardsOtherDoc',   label: 'On Other Documents', icon: <i className="bi bi-file-earmark-text" />, colour: 'navy',  linkTo: '/guards?idType=OTHER_DOCUMENT' },
      { key: 'guardsNoId',       label: 'No ID Document',     icon: <i className="bi bi-square" />, colour: alertWhenAny, linkTo: '/guards?idType=NONE' },
    ],
    feeds: [
      { key: 'pendingLeave', title: 'Leave awaiting approval', icon: <i className="bi bi-umbrella" />, emptyText: 'No leave requests waiting', linkTo: '/hr' },
      { key: 'guardsByRank', title: 'Active guards by rank',   icon: <i className="bi bi-person-badge" />, emptyText: 'No active guards',          linkTo: '/guards' },
    ],
  },

  CONTROL_ROOM: {
    caption: 'Complaints desk and live operations',
    stats: [
      { key: 'openComplaints',      label: 'Open Complaints',    icon: <i className="bi bi-clipboard-check" />, colour: dangerWhenAny, linkTo: '/complaints' },
      { key: 'unassignedCount',     label: 'Needs Assignment',   icon: <i className="bi bi-exclamation-triangle" />, colour: dangerWhenAny, linkTo: '/complaints' },
      { key: 'underInvestigation',  label: 'Under Investigation', icon: <i className="bi bi-search" />, colour: 'amber', linkTo: '/complaints' },
      { key: 'resolvedToday',       label: 'Resolved Today',     icon: <i className="bi bi-check-circle" />, colour: 'green', linkTo: '/complaints' },
      { key: 'deployedToday',       label: 'Guards Deployed',    icon: <i className="bi bi-geo-alt" />, colour: 'navy',  linkTo: '/attendance' },
      { key: 'activeGuards',        label: 'Active Guards',      icon: <i className="bi bi-person-badge" />, colour: 'teal',  linkTo: '/guards' },
      { key: 'activeClients',       label: 'Active Clients',     icon: <i className="bi bi-building" />, colour: 'navy',  linkTo: '/clients' },
      { key: 'pendingRequisitions', label: 'Pending Requisitions', icon: <i className="bi bi-pencil-square" />, colour: alertWhenAny, linkTo: '/requisitions' },
      { key: 'shiftReportsToday', label: 'Shift Reports Today', icon: <i className="bi bi-files" />, colour: 'navy', linkTo: '/control-room/shift-reports' },
      { key: 'shiftReportsAwaitingAck', label: 'Awaiting Acknowledgement', icon: <i className="bi bi-hourglass-split" />, colour: alertWhenAny, linkTo: '/control-room/shift-reports?status=SUBMITTED' },
    ],
    feeds: [
      { key: 'unassignedComplaints', title: 'Needs Assignment', icon: <i className="bi bi-exclamation-triangle" />, emptyText: 'Everything is assigned', linkTo: '/complaints' },
      { key: 'activeComplaints',     title: 'Active Complaints', icon: <i className="bi bi-clipboard-check" />, emptyText: 'No open complaints', linkTo: '/complaints' },
    ],
  },

  MARKETING: {
    caption: 'Sales pipeline and targets',
    stats: [
      { key: 'totalProspects',   label: 'Total Prospects',   icon: <i className="bi bi-people" />, colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',       icon: <i className="bi bi-arrow-repeat" />, colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',      icon: <i className="bi bi-check-circle" />, colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',        icon: <i className="bi bi-x-circle" />, colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate',   icon: <i className="bi bi-graph-up" />, colour: 'navy',  linkTo: '/marketing/reports', format: v => `${v}%` },
      { key: 'activeBids',       label: 'Active Bids',       icon: <i className="bi bi-clipboard-check" />, colour: 'amber', linkTo: '/marketing/bids' },
      { key: 'upcomingExpiries', label: 'Expiring Contracts', icon: <i className="bi bi-calendar3" />, colour: alertWhenAny, linkTo: '/clients' },
      { key: 'targetProgress',   label: 'Target Progress',   icon: <i className="bi bi-bullseye" />, colour: 'green', linkTo: '/marketing/targets', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'Pipeline', icon: <i className="bi bi-arrow-repeat" />, emptyText: 'No prospects yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: <i className="bi bi-clock" />, emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
    ],
  },

  // Full pipeline: targets and bids are this role's to run.
  MARKETING_HEAD: {
    caption: 'Sales pipeline and targets — all sales staff',
    stats: [
      { key: 'totalProspects',   label: 'Total Prospects',   icon: <i className="bi bi-people" />, colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',       icon: <i className="bi bi-arrow-repeat" />, colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',      icon: <i className="bi bi-check-circle" />, colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',        icon: <i className="bi bi-x-circle" />, colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate',   icon: <i className="bi bi-graph-up" />, colour: 'navy',  linkTo: '/marketing/reports', format: v => `${v}%` },
      { key: 'activeBids',       label: 'Active Bids',       icon: <i className="bi bi-clipboard-check" />, colour: 'amber', linkTo: '/marketing/bids' },
      { key: 'upcomingExpiries', label: 'Expiring Contracts', icon: <i className="bi bi-calendar3" />, colour: alertWhenAny, linkTo: '/clients' },
      { key: 'targetProgress',   label: 'Target Progress',   icon: <i className="bi bi-bullseye" />, colour: 'green', linkTo: '/marketing/targets', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'Pipeline', icon: <i className="bi bi-arrow-repeat" />, emptyText: 'No prospects yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: <i className="bi bi-clock" />, emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
    ],
  },

  // Own leads only. No bids or targets tiles — the API scopes the figures, and
  // linking to pages this role cannot open would only produce a 403.
  SALES: {
    caption: 'Your leads and targets',
    stats: [
      { key: 'totalProspects',   label: 'My Leads',        icon: <i className="bi bi-people" />, colour: 'navy',  linkTo: '/marketing/prospects' },
      { key: 'inPipeline',       label: 'In Pipeline',     icon: <i className="bi bi-arrow-repeat" />, colour: 'teal',  linkTo: '/marketing/prospects' },
      { key: 'won',              label: 'Business Won',    icon: <i className="bi bi-check-circle" />, colour: 'green', linkTo: '/marketing/closed' },
      { key: 'lost',             label: 'Lost Leads',      icon: <i className="bi bi-x-circle" />, colour: 'grey',  linkTo: '/marketing/prospects' },
      { key: 'conversionRate',   label: 'Conversion Rate', icon: <i className="bi bi-graph-up" />, colour: 'navy',  linkTo: '/targets', format: v => `${v}%` },
      { key: 'targetProgress',   label: 'My Target',       icon: <i className="bi bi-bullseye" />, colour: 'green', linkTo: '/targets', format: v => `${v}%` },
    ],
    feeds: [
      { key: 'pipelineStages', title: 'My Pipeline', icon: <i className="bi bi-arrow-repeat" />, emptyText: 'No leads assigned to you yet', linkTo: '/marketing/prospects' },
      { key: 'recentActivity', title: 'Recent Activity', icon: <i className="bi bi-clock" />, emptyText: 'No pipeline movement yet', linkTo: '/marketing/prospects' },
    ],
  },

  CLIENT: {
    caption: `Your account with ${DEFAULT_COMPANY_NAME}`,
    stats: [
      { key: 'activeSites',         label: 'Your Sites',        icon: <i className="bi bi-diagram-3" />, colour: 'navy',  linkTo: '/portal' },
      { key: 'activeContracts',     label: 'Active Contracts',  icon: <i className="bi bi-pencil-square" />, colour: 'teal',  linkTo: '/portal' },
      { key: 'unpaidInvoices',      label: 'Unpaid Invoices',   icon: <i className="bi bi-file-earmark-text" />, colour: alertWhenAny, linkTo: '/portal' },
      { key: 'openComplaints',      label: 'Open Complaints',   icon: <i className="bi bi-clipboard-check" />, colour: alertWhenAny, linkTo: '/portal' },
      { key: 'openServiceRequests', label: 'Service Requests',  icon: <i className="bi bi-tools" />, colour: alertWhenAny, linkTo: '/portal' },
    ],
    feeds: [
      { key: 'recentInvoices',   title: 'Recent Invoices',   icon: <i className="bi bi-file-earmark-text" />, emptyText: 'No invoices yet', linkTo: '/portal' },
      { key: 'recentComplaints', title: 'Recent Complaints', icon: <i className="bi bi-clipboard-check" />, emptyText: 'No complaints raised', linkTo: '/portal' },
    ],
  },
};

export function specForRole(data: DashboardData, companyName = DEFAULT_COMPANY_NAME): RoleDashboardSpec {
  const spec = ROLE_DASHBOARDS[data.role] ?? ROLE_DASHBOARDS.HR;
  return data.role === 'CLIENT' ? { ...spec, caption: `Your account with ${companyName}` } : spec;
}
