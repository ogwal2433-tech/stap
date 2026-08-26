import type { RequestHandler } from 'express';
import prisma from '../db/prisma';
import { ForbiddenError, UnauthorisedError } from '../errors/AppError';
import type { PermissionKey } from '../constants/permissions';

/**
 * Permission checks on the hot path.
 *
 * Every guarded request needs the set of permissions its role holds, so it is
 * cached per role rather than queried each time. The cache is per process: with
 * more than one API container a grant made on one is not seen by the others
 * until their entry expires, which is why the TTL is short.
 */
const TTL_MS = 5 * 60 * 1000;

interface Entry { keys: Set<string>; at: number }
const cache = new Map<string, Entry>();

async function getRolePermissions(role: string): Promise<Set<string>> {
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;

  const rows = await prisma.rolePermission.findMany({
    where:  { role: role as never },
    select: { permission: { select: { key: true } } },
  });

  const keys = new Set(rows.map((r) => r.permission.key));
  cache.set(role, { keys, at: Date.now() });
  return keys;
}

/** Called after a grant or revoke so the change takes effect immediately. */
export function clearPermissionCache(role?: string): void {
  if (role) cache.delete(role);
  else cache.clear();
}

/** "guards.edit" → "Guards Edit", so a refusal names something readable. */
function label(key: string): string {
  return key.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Requires every listed permission. */
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) return next(new UnauthorisedError());
    try {
      const held    = await getRolePermissions(req.user.role);
      const missing = keys.filter((k) => !held.has(k));
      if (missing.length) {
        return next(new ForbiddenError(`Access denied. Missing permission: ${label(missing[0])}.`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Requires at least one of the listed permissions. */
export function requireAnyPermission(...keys: PermissionKey[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) return next(new UnauthorisedError());
    try {
      const held = await getRolePermissions(req.user.role);
      if (!keys.some((k) => held.has(k))) {
        return next(new ForbiddenError('Access denied. You do not have permission to perform this action.'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** For checks inside a service, where middleware does not reach. */
export async function hasPermission(role: string, key: PermissionKey): Promise<boolean> {
  return (await getRolePermissions(role)).has(key);
}

/** Every permission a role holds — used by /auth/me so the UI can hide what it cannot use. */
export async function permissionsFor(role: string): Promise<string[]> {
  return [...(await getRolePermissions(role))].sort();
}
