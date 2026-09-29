import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { type UserRole } from '@security360/shared';

interface RoleGuardProps {
  /** Roles that are allowed to see the children. */
  allowedRoles: UserRole[];
  children: ReactNode;
  /** What to render when the user doesn't have an allowed role. Defaults to null. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the authenticated user's role.
 * Renders nothing (or `fallback`) when the user lacks the required role.
 *
 * @example
 * <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
 *   <PayrollButton />
 * </RoleGuard>
 *
 * @example — with fallback
 * <RoleGuard allowedRoles={[ROLES.ACCOUNTS_OFFICER]} fallback={<p>Finance access required</p>}>
 *   <InvoiceTable />
 * </RoleGuard>
 */
export default function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role as UserRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
