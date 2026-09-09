/**
 * Session timing, in one place.
 *
 * These three numbers were previously spread across four files that had to
 * agree by hand: the JWT expiry in lib/jwt, the Redis TTL in authService, and
 * the cookie maxAge in routes/auth. They disagreeing is not a loud failure —
 * a Redis TTL shorter than the cookie means the browser keeps sending a token
 * the server has already forgotten, and the user is signed out with no
 * explanation. So the values are derived here and imported everywhere else.
 *
 * JWT_EXPIRES_IN and JWT_REFRESH_EXPIRES_IN already existed in .env and were
 * read by nothing; they are live now.
 */

/** Accepts `900`, `15m`, `8h`, `7d`. Returns seconds. */
export function parseDuration(value: string, fallbackSeconds: number): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return fallbackSeconds;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackSeconds;

  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? 's'] ?? 1;
  return amount * multiplier;
}

function seconds(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  return raw ? parseDuration(raw, fallback) : fallback;
}

/**
 * Short by design. A leaked access token is only useful until it expires, and
 * the frontend renews it in the background before it does, so the length is
 * invisible to anyone actually using the system.
 */
export const ACCESS_TOKEN_TTL_SECONDS = seconds('JWT_EXPIRES_IN', 15 * 60);

/**
 * The outer bound on a session. Rotated on every refresh, so it slides forward
 * while someone is working and only bites once they have stopped — which is
 * also what limits how long a closed tab can be reopened straight back into a
 * live session, where no inactivity timer is running to catch it.
 */
export const REFRESH_TOKEN_TTL_SECONDS = seconds('JWT_REFRESH_EXPIRES_IN', 8 * 60 * 60);

/**
 * How long a signed-in browser may sit untouched. Enforced in the browser,
 * which is the only place that can see a mouse; sent from here so it can be
 * changed in .env without rebuilding the frontend.
 */
export const INACTIVITY_TIMEOUT_MINUTES = Math.max(
  1,
  Number(process.env.SESSION_INACTIVITY_MINUTES ?? 30) || 30,
);

/** jsonwebtoken accepts a number of seconds directly, which avoids re-parsing. */
export const ACCESS_TOKEN_EXPIRES_IN = ACCESS_TOKEN_TTL_SECONDS;
export const REFRESH_TOKEN_EXPIRES_IN = REFRESH_TOKEN_TTL_SECONDS;
