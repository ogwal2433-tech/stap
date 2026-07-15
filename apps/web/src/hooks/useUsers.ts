import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../lib/users.api';
import { INTERNAL_ROLES } from '@stap/shared';

// Lightweight staff list for assignment dropdowns — internal roles only
// (excludes CLIENT/GUARD), rarely changes so cached for 5 minutes.
export function useStaffUsers() {
  return useQuery({
    queryKey: ['staff-users'],
    queryFn:  () => usersApi.list({ roles: INTERNAL_ROLES.join(',') }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
