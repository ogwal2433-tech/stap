import { PERMISSIONS, ALL_PERMISSION_KEYS, type PermissionKey } from './permissions';

const P = PERMISSIONS;

/**
 * The permission set each role starts with.
 *
 * A starting point, not the source of truth — once seeded, the grants live in
 * RolePermission and an administrator can change them from the UI. Re-seeding
 * is additive and never revokes, so a deploy cannot quietly undo a change
 * someone made deliberately. "Reset to defaults" in the UI is the only thing
 * that puts a role back to this list.
 *
 * GUARD and CLIENT are absent on purpose: they reach the system through the
 * check-in screen and the client portal, which are scoped to the holder's own
 * records rather than gated on permissions. MARKETING is absent because it was
 * split into MARKETING_HEAD and SALES and nothing holds it any more.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  // Everything, including roles.manage. Kept whole deliberately: a Director who
  // could lock themselves out of permission management would leave the system
  // with no way back in.
  DIRECTOR: [...ALL_PERMISSION_KEYS],

  ASSISTANT_MANAGER: [
    P.GUARDS_VIEW, P.GUARDS_CREATE, P.GUARDS_EDIT, P.GUARDS_PROMOTE,
    P.GUARDS_TRANSFER, P.GUARDS_DOCUMENTS,
    P.CLIENTS_VIEW, P.CLIENTS_CREATE, P.CLIENTS_EDIT,
    P.SITES_VIEW, P.SITES_CREATE, P.SITES_EDIT,
    P.ROSTER_VIEW, P.ROSTER_BUILD, P.ROSTER_EDIT,
    P.ATTENDANCE_VIEW, P.ATTENDANCE_EDIT,
    P.FINANCE_VIEW, P.INVOICES_VIEW, P.INVOICES_CREATE, P.INVOICES_EDIT,
    P.INVOICES_PRINT, P.PAYMENTS_VIEW, P.PAYMENTS_RECORD,
    P.PAYROLL_VIEW, P.PAYROLL_APPROVE,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE, P.REQUISITIONS_APPROVE,
    P.REQUISITIONS_DISPATCH,
    P.COMPLAINTS_VIEW, P.COMPLAINTS_CREATE, P.COMPLAINTS_ASSIGN,
    P.COMPLAINTS_RESOLVE, P.COMPLAINTS_OUTBOUND,
    P.SERVICE_REQUESTS_VIEW, P.SERVICE_REQUESTS_RESPOND,
    P.INVENTORY_VIEW, P.INVENTORY_ISSUE, P.INVENTORY_RETURN, P.INVENTORY_EDIT,
    P.HR_VIEW, P.HR_LETTERS, P.HR_DISCIPLINARY, P.LEAVE_VIEW, P.LEAVE_APPROVE,
    P.MARKETING_VIEW,
    P.GUNS_VIEW,
    P.REPORTS_VIEW, P.REPORTS_EXPORT,
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_EDIT, P.STAFF_DEACTIVATE,
    P.SETTINGS_VIEW, P.SETTINGS_EDIT, P.SYSTEM_ERRORS, P.AUDIT_LOG,
  ],

  // Runs the system rather than the business: accounts, settings, diagnostics.
  // Holds roles.manage, so this role and DIRECTOR are the two that can reach
  // the permission matrix.
  ADMINISTRATOR: [
    P.GUARDS_VIEW, P.CLIENTS_VIEW, P.SITES_VIEW,
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_EDIT, P.STAFF_DEACTIVATE,
    P.SETTINGS_VIEW, P.SETTINGS_EDIT, P.SYSTEM_ERRORS, P.AUDIT_LOG,
    P.ROLES_MANAGE,
    P.REPORTS_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.ATTENDANCE_VIEW, P.COMPLAINTS_VIEW, P.INVENTORY_VIEW, P.REQUISITIONS_VIEW, P.SERVICE_REQUESTS_VIEW,
  ],

  OPERATIONS_SUPERVISOR: [
    P.GUARDS_VIEW, P.GUARDS_TRANSFER,
    P.CLIENTS_VIEW, P.SITES_VIEW,
    P.ROSTER_VIEW, P.ROSTER_BUILD, P.ROSTER_EDIT,
    P.ATTENDANCE_VIEW, P.ATTENDANCE_EDIT,
    P.COMPLAINTS_VIEW, P.COMPLAINTS_ASSIGN, P.COMPLAINTS_RESOLVE,
    P.SERVICE_REQUESTS_VIEW, P.SERVICE_REQUESTS_RESPOND,
    P.INVENTORY_VIEW,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE,
    P.REPORTS_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.GUNS_VIEW,
  ],

  FIELD_SUPERVISOR: [
    P.GUARDS_VIEW,
    P.ROSTER_VIEW, P.ROSTER_BUILD,
    P.ATTENDANCE_VIEW, P.ATTENDANCE_EDIT,
    P.SITES_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.CLIENTS_VIEW, P.COMPLAINTS_VIEW, P.REQUISITIONS_VIEW,
  ],

  ACCOUNTS_OFFICER: [
    P.CLIENTS_VIEW, P.SITES_VIEW,
    P.FINANCE_VIEW, P.INVOICES_VIEW, P.INVOICES_CREATE, P.INVOICES_EDIT,
    P.INVOICES_PRINT, P.PAYMENTS_VIEW, P.PAYMENTS_RECORD,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE, P.REQUISITIONS_DISPATCH,
    P.SERVICE_REQUESTS_VIEW,
    P.REPORTS_VIEW, P.REPORTS_EXPORT,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.ATTENDANCE_VIEW, P.COMPLAINTS_VIEW, P.GUARDS_VIEW,
  ],

  CONTROL_ROOM: [
    P.GUARDS_VIEW, P.CLIENTS_VIEW, P.SITES_VIEW,
    P.ROSTER_VIEW, P.ATTENDANCE_VIEW,
    P.COMPLAINTS_VIEW, P.COMPLAINTS_ASSIGN, P.COMPLAINTS_RESOLVE,
    P.COMPLAINTS_OUTBOUND,
    P.SERVICE_REQUESTS_VIEW, P.SERVICE_REQUESTS_RESPOND,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE,
    P.REPORTS_VIEW,
  ],

  TRAINER: [
    P.GUARDS_VIEW, P.GUARDS_DOCUMENTS,
    P.GUNS_VIEW, P.GUNS_REGISTER, P.GUNS_DEPLOY, P.GUNS_WITHDRAW,
    P.GUNS_TRANSFER,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE,
    P.HR_VIEW, P.HR_LETTERS,
    P.REPORTS_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.CLIENTS_VIEW, P.COMPLAINTS_VIEW,
  ],

  // Everything marketing: every lead, targets, bids, all reports. Also
  // staff.view, so a head can see the sales officers leads are assigned to.
  MARKETING_HEAD: [
    P.CLIENTS_VIEW,
    P.MARKETING_VIEW, P.MARKETING_PROSPECTS, P.MARKETING_BIDS,
    P.MARKETING_TARGETS, P.MARKETING_REPORTS,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE,
    P.REPORTS_VIEW, P.REPORTS_EXPORT,
    P.STAFF_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.COMPLAINTS_VIEW, P.GUARDS_VIEW,
  ],

  // Prospects and nothing else in marketing. No bids, no targets, no marketing
  // reports and no export — the pipeline this role can see is its own, and an
  // export is how that boundary would otherwise be walked around.
  SALES: [
    P.CLIENTS_VIEW,
    P.MARKETING_VIEW, P.MARKETING_PROSPECTS,
    P.REQUISITIONS_VIEW, P.REQUISITIONS_CREATE,
    P.REPORTS_VIEW,
    // Reconciled with the pages this role already reaches, so moving the nav
    // and route guards onto permissions does not take access away.
    P.COMPLAINTS_VIEW, P.GUARDS_VIEW,
  ],
};

/** Roles that hold a given permission by default — used by the drift check. */
export function rolesWithDefault(key: PermissionKey): string[] {
  return Object.entries(DEFAULT_ROLE_PERMISSIONS)
    .filter(([, keys]) => keys.includes(key))
    .map(([role]) => role);
}
