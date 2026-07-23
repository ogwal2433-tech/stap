import type { Request } from 'express';
import { ForbiddenError } from '../errors/AppError';

/**
 * Returns a Prisma `where` fragment that scopes a query to the logged-in
 * client's own company. Internal staff get no filter (they see everything);
 * a CLIENT-role user with no linked company is rejected outright rather than
 * silently returning zero rows.
 */
export function getClientFilter(req: Request): { clientId: string } | Record<string, never> {
  if (req.user?.role === 'CLIENT') {
    if (!req.user.clientId) {
      throw new ForbiddenError(
        'Your account is not linked to a client company. Please contact the administrator.',
      );
    }
    return { clientId: req.user.clientId };
  }
  return {};
}

/**
 * Asserts that a resource already fetched by ID belongs to the logged-in
 * client before it's returned. No-op for internal staff.
 */
export function assertClientOwnership(
  req: Request,
  resourceClientId: string | null,
  resourceName = 'resource',
): void {
  if (req.user?.role === 'CLIENT' && resourceClientId !== req.user.clientId) {
    throw new ForbiddenError(`You do not have access to this ${resourceName}.`);
  }
}
