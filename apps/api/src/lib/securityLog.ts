import type { Request } from 'express';
import { writeAuditLog } from './auditLog';

/**
 * Refused requests, recorded in the audit log so an administrator can see who
 * tried to reach what, when, from which role, and what they lacked.
 *
 * Each refusal is recorded once, where it is decided — the permission and role
 * middleware know which permission or role was missing, authenticate knows why
 * a token failed — and the error is marked so the global handler does not
 * record it again. The handler only picks up refusals raised elsewhere.
 *
 * Not recorded:
 *   - an expired token: that is how every session ends, and the app renews it
 *   - 401s outside authenticate: /auth/refresh answers 401 to every signed-out
 *     visitor, which says nothing about anyone
 *
 * Throttled, because the unauthenticated case is reachable by anyone who can
 * reach the API: the same event from the same caller on the same route is
 * recorded once a minute, and an anonymous IP at most 30 times a minute.
 * Without that, a scanner could write a row per request into the audit log.
 */

export type SecurityEvent =
  | 'PERMISSION_DENIED'    // requirePermission / requireAnyPermission
  | 'ROLE_DENIED'          // requireRole / requireMinimumRole
  | 'ACCESS_DENIED'        // any other 403 — ownership, client isolation, a service's own check
  | 'UNAUTHORISED_ACCESS'  // a protected route reached with no token
  | 'INVALID_TOKEN';       // a token that is not expired but still fails: forged, malformed, tampered

const WINDOW_MS              = 60_000;
const ANON_PER_IP_PER_WINDOW = 30;
const MAX_KEYS               = 5_000;

/** event key → when it was last recorded */
const seen = new Map<string, number>();
/** anonymous IP → its current window */
const anon = new Map<string, { start: number; count: number }>();

/** Whether this event should be recorded now. Exported for its test. */
export function admit(key: string, ip: string, anonymous: boolean, now = Date.now()): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return false;

  if (anonymous) {
    const w = anon.get(ip);
    if (!w || now - w.start >= WINDOW_MS) {
      anon.set(ip, { start: now, count: 1 });
    } else if (w.count >= ANON_PER_IP_PER_WINDOW) {
      return false;
    } else {
      w.count++;
    }
  }

  if (seen.size >= MAX_KEYS) prune(now);
  seen.set(key, now);
  return true;
}

function prune(now: number): void {
  for (const [k, t] of seen) if (now - t >= WINDOW_MS) seen.delete(k);
  for (const [k, w] of anon) if (now - w.start >= WINDOW_MS) anon.delete(k);
  // Still full after expiry — a burst of distinct keys. Drop the oldest half
  // rather than let memory grow with what an attacker sends.
  if (seen.size >= MAX_KEYS) {
    let dropped = 0;
    for (const k of seen.keys()) {
      if (dropped++ >= MAX_KEYS / 2) break;
      seen.delete(k);
    }
  }
}

export function resetSecurityLogThrottle(): void {
  seen.clear();
  anon.clear();
}

/**
 * On, except under test. The test suites deny thousands of requests on purpose
 * and would bury a development database's audit log; a test that needs the log
 * sets SECURITY_LOG=on. SECURITY_LOG=off turns it off anywhere.
 */
function enabled(): boolean {
  const flag = process.env.SECURITY_LOG;
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return process.env.NODE_ENV !== 'test';
}

/** "/api/v1/clients/abc/sites" → { entity: "clients", entityId: "abc" } */
function locate(path: string): { entity: string; entityId: string } {
  const parts = path.split('/').filter(Boolean);
  const v = parts.indexOf('v1');
  const rest = v === -1 ? parts : parts.slice(v + 1);
  return { entity: rest[0] ?? 'unknown', entityId: rest[1] ?? '-' };
}

export function logSecurityEvent(
  req: Request,
  action: SecurityEvent,
  detail: { required?: string | null; reason?: string | null } = {},
): void {
  if (!enabled()) return;

  // Mount path plus route path, never the query string — a query can carry
  // a token or a search term that does not belong in a log.
  const joined = `${req.baseUrl ?? ''}${req.path ?? ''}` || (req.originalUrl ?? '').split('?')[0];
  // A router's own root joins as "/api/v1/guards" + "/"; drop the trailing
  // slash so one endpoint is not logged under two paths.
  const path   = joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
  // req.ip honours `trust proxy`; a raw X-Forwarded-For header is whatever the
  // caller chose to send.
  const ip     = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const userId = req.user?.userId ?? null;

  if (!admit(`${action}|${userId ?? ip}|${req.method} ${path}`, ip, !userId)) return;

  const { entity, entityId } = locate(path);
  void writeAuditLog({
    action,
    entity,
    entityId,
    userId,
    ipAddress: ip,
    userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
    method:    req.method,
    path,
    role:      req.user?.role ?? null,
    required:  detail.required ?? null,
    newValue:  { reason: detail.reason ?? null },
  }).catch(() => undefined);
}

/** Marks an error as already recorded, so the global handler skips it. */
export function logged<E extends Error>(err: E): E {
  (err as E & { securityLogged?: boolean }).securityLogged = true;
  return err;
}
