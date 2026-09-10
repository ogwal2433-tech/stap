import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '../lib/roles.api';

/**
 * Roles from the Role table. `assignable` narrows to enabled staff roles —
 * what a person can be given right now. Roles are created at runtime, so every
 * dropdown reads this rather than a constant that would never list a new one.
 */
export function useRoles(assignable = false) {
  return useQuery({
    queryKey:  ['roles', { assignable }],
    queryFn:   () => rolesApi.list({ assignable }),
    staleTime: 5 * 60 * 1000,
  });
}
