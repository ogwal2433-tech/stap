/**
 * Every permission the system recognises.
 *
 * The key is `module.action`. The module half is what the management UI groups
 * by, so it must match the module recorded on the Permission row — both are
 * derived from this key, so they cannot drift.
 *
 * These constants are the contract between routes and the database: a route
 * names a permission, the database decides which roles hold it. Adding one here
 * and running the seed makes it available to grant; it is held by nobody until
 * granted, so a new permission never silently widens access.
 */
export const PERMISSIONS = {
  // ── Guards ──────────────────────────────────────────────────────────────────
  GUARDS_VIEW:      'guards.view',
  GUARDS_CREATE:    'guards.create',
  GUARDS_EDIT:      'guards.edit',
  GUARDS_DELETE:    'guards.delete',
  GUARDS_PURGE:     'guards.purge',
  GUARDS_PROMOTE:   'guards.promote',
  GUARDS_TRANSFER:  'guards.transfer',
  GUARDS_DOCUMENTS: 'guards.documents',

  // ── Clients ─────────────────────────────────────────────────────────────────
  CLIENTS_VIEW:   'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_EDIT:   'clients.edit',
  CLIENTS_DELETE: 'clients.delete',

  // ── Sites ───────────────────────────────────────────────────────────────────
  // ── Contracts ───────────────────────────────────────────────────────────────
  // Separate from clients on purpose: the Control Room works a client's sites,
  // complaints and service requests daily but has no business seeing what the
  // client is charged.
  CONTRACTS_VIEW:   'contracts.view',
  CONTRACTS_CREATE: 'contracts.create',
  CONTRACTS_EDIT:   'contracts.edit',
  CONTRACTS_DELETE: 'contracts.delete',

  SITES_VIEW:   'sites.view',
  SITES_CREATE: 'sites.create',
  SITES_EDIT:   'sites.edit',
  SITES_DELETE: 'sites.delete',

  // ── Roster and attendance ───────────────────────────────────────────────────
  ROSTER_VIEW:     'roster.view',
  ROSTER_BUILD:    'roster.build',
  ROSTER_EDIT:     'roster.edit',
  ATTENDANCE_VIEW: 'attendance.view',
  /// Submitting a site check-in from the supervisor's phone.
  CHECKIN_PERFORM:  'checkin.perform',
  ATTENDANCE_EDIT: 'attendance.edit',

  // ── Finance ─────────────────────────────────────────────────────────────────
  FINANCE_VIEW:    'finance.view',
  INVOICES_VIEW:   'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_EDIT:   'invoices.edit',
  INVOICES_PRINT:  'invoices.print',
  /** Voids, never deletes: the invoice stays on file marked VOID. */
  INVOICES_VOID:   'invoices.void',
  /** The month-end run that raises a batch for MD's final issue approval. */
  INVOICES_RUN:    'invoices.run',
  /** MD/Director final approval: flips run invoices from PENDING to ISSUED. */
  INVOICES_ISSUE:  'invoices.issue',
  PAYMENTS_VIEW:   'payments.view',
  PAYMENTS_RECORD: 'payments.record',
  /** Final approval on manually recorded payments before they count. */
  PAYMENTS_APPROVE: 'payments.approve',

  // ── Payroll ─────────────────────────────────────────────────────────────────
  PAYROLL_VIEW:    'payroll.view',
  PAYROLL_RUN:     'payroll.run',
  PAYROLL_APPROVE: 'payroll.approve',

  // ── Requisitions ────────────────────────────────────────────────────────────
  REQUISITIONS_VIEW:     'requisitions.view',
  REQUISITIONS_CREATE:   'requisitions.create',
  REQUISITIONS_APPROVE:  'requisitions.approve',
  REQUISITIONS_DISPATCH: 'requisitions.dispatch',

  // ── Complaints ──────────────────────────────────────────────────────────────
  COMPLAINTS_VIEW:     'complaints.view',
  COMPLAINTS_CREATE:   'complaints.create',
  COMPLAINTS_ASSIGN:   'complaints.assign',
  COMPLAINTS_RESOLVE:  'complaints.resolve',
  COMPLAINTS_OUTBOUND: 'complaints.outbound',

  // ── Service requests ────────────────────────────────────────────────────────
  SERVICE_REQUESTS_VIEW:    'service_requests.view',
  SERVICE_REQUESTS_RESPOND: 'service_requests.respond',

  // ── Control room shift handover ─────────────────────────────────────────────
  SHIFT_REPORT_VIEW:        'shift_report.view',
  SHIFT_REPORT_CREATE:      'shift_report.create',
  SHIFT_REPORT_ACKNOWLEDGE: 'shift_report.acknowledge',

  // ── Inventory ───────────────────────────────────────────────────────────────
  INVENTORY_VIEW:   'inventory.view',
  INVENTORY_ISSUE:  'inventory.issue',
  INVENTORY_RETURN: 'inventory.return',
  INVENTORY_EDIT:   'inventory.edit',

  // ── HR ──────────────────────────────────────────────────────────────────────
  HR_VIEW:         'hr.view',
  HR_EDIT:         'hr.edit',
  HR_LETTERS:      'hr.letters',
  HR_DISCIPLINARY: 'hr.disciplinary',
  LEAVE_VIEW:      'leave.view',
  LEAVE_APPROVE:   'leave.approve',

  // ── Marketing ───────────────────────────────────────────────────────────────
  MARKETING_VIEW:      'marketing.view',
  MARKETING_PROSPECTS: 'marketing.prospects',
  MARKETING_BIDS:      'marketing.bids',
  MARKETING_TARGETS:   'marketing.targets',
  MARKETING_REPORTS:   'marketing.reports',

  // ── Firearms ────────────────────────────────────────────────────────────────
  GUNS_VIEW:     'guns.view',
  GUNS_REGISTER: 'guns.register',
  GUNS_DEPLOY:   'guns.deploy',
  GUNS_WITHDRAW: 'guns.withdraw',
  GUNS_TRANSFER: 'guns.transfer',

  // ── Reports ─────────────────────────────────────────────────────────────────
  REPORTS_VIEW:   'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // ── Staff directory ─────────────────────────────────────────────────────────
  STAFF_VIEW:       'staff.view',
  STAFF_CREATE:     'staff.create',
  STAFF_EDIT:       'staff.edit',
  STAFF_DEACTIVATE: 'staff.deactivate',
  STAFF_DELETE:     'staff.delete',

  // ── System ──────────────────────────────────────────────────────────────────
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SYSTEM_ERRORS: 'system.errors',
  AUDIT_LOG:     'audit.log',
  ROLES_MANAGE:  'roles.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

/** The module half of the key — what the management UI groups by. */
export function permissionModule(key: string): string {
  return key.split('.')[0];
}

/** "GUARDS_EDIT" → "Guards Edit", for display next to the raw key. */
export function permissionName(constantName: string): string {
  return constantName
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
