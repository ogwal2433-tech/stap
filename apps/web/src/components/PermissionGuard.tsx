import type { ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

const NAVY = '#1B3A6B';

interface PermissionGuardProps {
  /** Permission key required to see the children, e.g. "guards.view". */
  permission: string;
  children: ReactNode;
  /** Rendered instead of the children when the permission is absent. */
  fallback?: ReactNode;
}

/**
 * Renders children only when the signed-in user's role holds the permission.
 *
 * The role-based equivalent kept its own list of who may reach each page, and
 * the sidebar kept another — they drifted, and a link appeared for a role the
 * router then refused. Both now read the same permission, which comes from the
 * database, so granting one in the Roles & Permissions page is enough to open a
 * page without a code change.
 *
 * Cosmetic, like every client-side check: the API enforces the same permission
 * independently, so hiding a page here never becomes the only thing stopping
 * someone reaching the data behind it.
 */
export default function PermissionGuard({
  permission,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { permissions, isLoading } = useAuth();

  // Permissions arrive a moment after the user does. Rendering the denial in
  // that gap would flash "Access Denied" at someone who does have access.
  if (isLoading) return null;

  if (!permissions.includes(permission)) return <>{fallback}</>;

  return <>{children}</>;
}

/** Full-page denial, for a route the user reached by URL. */
export function PermissionDenied({ permission }: { permission: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 24,
    }}>
      <div style={{ fontSize: '3rem' }}>🔒</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: NAVY }}>Access denied</div>
      <div style={{ fontSize: '0.9rem', color: '#6c757d', textAlign: 'center', maxWidth: 420 }}>
        Your role does not have permission to view this page. An administrator can grant it
        from Settings → Roles &amp; Permissions.
      </div>
      <div style={{
        fontSize: '0.75rem', color: '#6c757d', fontFamily: 'monospace',
        background: '#F2F4F7', padding: '4px 10px', borderRadius: '0.375rem',
      }}>
        Required: {permission}
      </div>
      <Button variant="outline-primary" size="sm" onClick={() => window.history.back()}>
        ← Go back
      </Button>
    </div>
  );
}
