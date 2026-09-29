/**
 * Role constants, hierarchy, and permission groupings for Security360.
 *
 * Permission matrix (summary):
 *
 *  DIRECTOR             — Full read/write to ALL modules; user management; approvals;
 *                         financial dashboard; all reports; critical alerts.
 *  ASSISTANT_MANAGER    — HR full; Finance full except Yo! disbursement; Payroll run/approve;
 *                         Document templates; Requisitions up to threshold (TODO).
 *  ADMINISTRATOR        — Attendance create/update; Inventory issue/return/damage;
 *                         Requisitions submit; Deployments view.
 *  OPERATIONS_SUPERVISOR — Deployments full; Attendance full; Incidents create/update;
 *                          Client complaints view/update; Guard profiles view.
 *  FIELD_SUPERVISOR     — Check-ins create (own); Attendance mark (assigned sites);
 *                         Incidents create; Guard profiles view (own sites).
 *  TRAINER              — Training sessions full; Guard profiles view (training section).
 *  ACCOUNTS_OFFICER     — Invoices full; Payments record/reconcile; Cashbook full;
 *                         Payroll view; AR aging full.
 *  MARKETING_HEAD       — All leads from all sales staff; targets; bids and tenders;
 *                         all marketing reports; client profiles view.
 *  SALES                — Own assigned leads only; client profiles view. No targets,
 *                         no bids, no cross-officer visibility.
 *  GUARD                — Own profile view; Own attendance view; Leave requests submit.
 *  CLIENT               — Own invoices/payments/guards view; Own complaints submit/view.
 */

export const ROLES = {
  DIRECTOR: 'DIRECTOR',
  ASSISTANT_MANAGER: 'ASSISTANT_MANAGER',
  ADMINISTRATOR: 'ADMINISTRATOR',
  OPERATIONS_SUPERVISOR: 'OPERATIONS_SUPERVISOR',
  FIELD_SUPERVISOR: 'FIELD_SUPERVISOR',
  TRAINER: 'TRAINER',
  ACCOUNTS_OFFICER: 'ACCOUNTS_OFFICER',
  CONTROL_ROOM: 'CONTROL_ROOM',
  /** @deprecated Split into MARKETING_HEAD and SALES. Kept so rows and tokens
   *  predating the split still resolve; nothing assigns it. */
  MARKETING: 'MARKETING',
  MARKETING_HEAD: 'MARKETING_HEAD',
  SALES: 'SALES',
  HR: 'HR',
  GUARD: 'GUARD',
  CLIENT: 'CLIENT',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * Role hierarchy ordered from highest to lowest privilege.
 * Index 0 = most privileged (DIRECTOR).
 */
export const ROLE_HIERARCHY: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
  ROLES.TRAINER,
  ROLES.ACCOUNTS_OFFICER,
  ROLES.CONTROL_ROOM,
  // A departmental officer, ranked with the others. Absent, indexOf returns -1
  // and hasMinimumRole fails closed for every threshold — HR would be refused
  // everywhere that uses it.
  ROLES.HR,
  ROLES.MARKETING,
  ROLES.MARKETING_HEAD,
  ROLES.SALES,
  ROLES.GUARD,
  ROLES.CLIENT,
];

/**
 * Returns true if `userRole` is at the same level or higher than `minimumRole`
 * in the privilege hierarchy.
 *
 * @example
 * hasMinimumRole('DIRECTOR', 'GUARD')         // true  — Director outranks Guard
 * hasMinimumRole('GUARD', 'DIRECTOR')         // false — Guard cannot meet Director threshold
 * hasMinimumRole('ACCOUNTS_OFFICER', 'ACCOUNTS_OFFICER') // true — same level
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole);
  const minIdx = ROLE_HIERARCHY.indexOf(minimumRole);
  // Lower index = higher privilege; user must be at same or higher position
  return userIdx !== -1 && minIdx !== -1 && userIdx <= minIdx;
}

// ── Module-level permission groupings ──────────────────────────────────────────

/** Roles with access to finance and accounts modules. */
export const FINANCE_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ACCOUNTS_OFFICER,
];

/** Roles with access to HR records. */
export const HR_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

/** Roles that can create or modify guard records. */
export const GUARD_WRITE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.HR];

/** Roles with deployment management access. */
export const DEPLOYMENT_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
  ROLES.ADMINISTRATOR,
];

/** Roles with access to reports. */
export const REPORT_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ACCOUNTS_OFFICER,
];

/** All internal staff roles (excludes GUARD and CLIENT). */
export const INTERNAL_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
  ROLES.TRAINER,
  ROLES.ACCOUNTS_OFFICER,
  ROLES.CONTROL_ROOM,
  ROLES.MARKETING_HEAD,
  ROLES.SALES,
];

/**
 * Roles that may be recorded as having received a complaint.
 *
 * Control Room is the single point of entry for complaints from guards, field
 * supervisors and clients — the API refuses any other role as `receivedById`.
 */
export const COMPLAINT_RECEIVER_ROLES: UserRole[] = [ROLES.CONTROL_ROOM];

/** Roles that may assign a complaint to a member of staff. */
export const COMPLAINT_ASSIGN_ROLES: UserRole[] = [
  ROLES.CONTROL_ROOM,
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.OPERATIONS_SUPERVISOR,
];

/**
 * Roles that may read deployments without being able to change them.
 *
 * Deliberately separate from DEPLOYMENT_ROLES, which grants write access to the
 * roster and the deployment sheet.
 */
export const DEPLOYMENT_VIEW_ROLES: UserRole[] = [
  ...DEPLOYMENT_ROLES,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ACCOUNTS_OFFICER,
  ROLES.CONTROL_ROOM,
  // Reads attendance to answer leave and discipline questions; never edits it.
  ROLES.HR,
];

/**
 * Marketing roles that see the whole pipeline.
 *
 * SALES is deliberately absent: sales staff see only the leads assigned to
 * them, and this list is what decides that.
 */
export const MARKETING_MANAGER_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.MARKETING_HEAD,
];

/** Everyone who can open the marketing module at all. */
export const MARKETING_MODULE_ROLES: UserRole[] = [
  ...MARKETING_MANAGER_ROLES,
  ROLES.SALES,
];
