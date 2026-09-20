import type { RequestHandler } from 'express';
import prisma from '../db/prisma';
import { ForbiddenError, UnauthorisedError } from '../errors/AppError';
import type { PermissionKey } from '../constants/permissions';
import { logSecurityEvent, logged } from '../lib/securityLog';
import { publishPermissionChange, startPermissionCacheSync as startBus } from '../lib/permissionCacheBus';

/**
 * Permission checks on the hot path.
 *
 * Every guarded request needs the set of permissions its role holds, so it is
 * cached per role rather than queried each time. The cache is per process, and
 * the API runs as several PM2 instances, so a grant is broadcast over Redis
 * (see lib/permissionCacheBus.ts) and every instance drops the role at once.
 * The TTL remains as the floor if Redis is unavailable.
 */
const TTL_MS = 5 * 60 * 1000;

interface Entry { keys: Set<string>; at: number }
const cache = new Map<string, Entry>();

async function getRolePermissions(role: string): Promise<Set<string>> {
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;

  // Read through the Role, so a disabled role — or one deleted since the token
  // was issued — holds nothing, whatever grant rows remain. A disabled role's
  // grants are kept, so enabling it again restores exactly what it had.
  const row = await prisma.role.findUnique({
    where:  { name: role },
    select: { isActive: true, permissions: { select: { permission: { select: { key: true } } } } },
  });

  const keys = new Set(row?.isActive ? row.permissions.map((p) => p.permission.key) : []);
  cache.set(role, { keys, at: Date.now() });
  return keys;
}

/** Clears this process only. Application code wants invalidatePermissions. */
export function clearPermissionCache(role?: string): void {
  if (role) cache.delete(role);
  else cache.clear();
}

/**
 * Clears everywhere: here at once, and on every other API instance through
 * Redis. Clearing locally alone left the other instances answering with the
 * old permissions until their entry expired — which is why a grant seemed to
 * work or not depending on which instance served the next request.
 */
export function invalidatePermissions(role?: string): void {
  clearPermissionCache(role);
  publishPermissionChange(role);
}

/** Subscribes this process to invalidations. Called once at start-up. */
export function startPermissionCacheSync(): void {
  startBus(clearPermissionCache);
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
        logSecurityEvent(req, 'PERMISSION_DENIED', { required: missing.join(', ') });
        return next(logged(new ForbiddenError(`Access denied. Missing permission: ${label(missing[0])}.`)));
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
        logSecurityEvent(req, 'PERMISSION_DENIED', { required: keys.join(' or ') });
        return next(logged(new ForbiddenError('Access denied. You do not have permission to perform this action.')));
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
