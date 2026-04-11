import type { Request, RequestHandler } from 'express';
import { hasMinimumRole, type UserRole } from '@stap/shared';
import { ForbiddenError, UnauthorisedError } from '../errors/AppError';

/**
 * Middleware that enforces role-based access.
 * Must be placed AFTER authenticate middleware.
 *
 * @example
 * router.get('/payroll', authenticate, requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER), handler)
 */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorisedError());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }

    next();
  };
}

/**
 * Middleware that enforces a minimum privilege level using the role hierarchy.
 * Must be placed AFTER authenticate middleware.
 *
 * @example
 * // Allow ACCOUNTS_OFFICER and every role above it in the hierarchy
 * router.get('/invoices', authenticate, requireMinimumRole(ROLES.ACCOUNTS_OFFICER), handler)
 */
export function requireMinimumRole(minimumRole: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorisedError());
    }

    if (!hasMinimumRole(req.user.role, minimumRole)) {
      return next(new ForbiddenError());
    }

    next();
  };
}

/**
 * Middleware factory for resource ownership checks.
 * Allows access if the requesting user owns the resource OR is a DIRECTOR.
 *
 * @param getResourceUserId - Async/sync function that returns the userId who owns the resource
 *
 * @example
 * // Guard can only view their own profile; Director can view any
 * router.get(
 *   '/guards/:id/profile',
 *   authenticate,
 *   requireOwnership(async (req) => {
 *     const guard = await prisma.guard.findUnique({ where: { id: req.params.id } })
 *     return guard?.userId ?? ''
 *   }),
 *   handler,
 * )
 */
export function requireOwnership(
  getResourceUserId: (req: Request) => string | Promise<string>,
): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorisedError());
    }

    try {
      const ownerUserId = await getResourceUserId(req);

      if (req.user.userId === ownerUserId || req.user.role === 'DIRECTOR') {
        return next();
      }

      next(new ForbiddenError());
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Utility — returns true if the authenticated user is accessing their own resource.
 * Checks req.params.id against req.user.userId.
 *
 * @example
 * if (!isSelf(req)) throw new ForbiddenError();
 */
export function isSelf(req: Request): boolean {
  return req.params.id === req.user?.userId;
}
