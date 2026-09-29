import { describe, it, expect, afterEach, vi } from 'vitest';
import { loginFailureMessage, verboseAuthErrors } from '../../services/authService';

/**
 * How much a refused login is allowed to say.
 *
 * Telling "no such email" apart from "wrong password" tells an unauthenticated
 * visitor which addresses have accounts here, which is the first half of a
 * phishing or credential-stuffing run. Detail is therefore a development
 * convenience that production does not get by default.
 *
 * These pin both halves: that the detail exists when asked for, and that it
 * genuinely collapses — the two answers must be byte-identical, since any
 * difference at all is the oracle.
 */
const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe('verboseAuthErrors()', () => {
  it('is off in production when unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_VERBOSE_ERRORS;
    expect(verboseAuthErrors()).toBe(false);
  });

  it('is on outside production when unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_VERBOSE_ERRORS;
    expect(verboseAuthErrors()).toBe(true);
  });

  it('can be forced on in production, deliberately', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_VERBOSE_ERRORS = 'true';
    expect(verboseAuthErrors()).toBe(true);
  });

  it('can be forced off outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_VERBOSE_ERRORS = 'false';
    expect(verboseAuthErrors()).toBe(false);
  });

  it('treats any value other than "true" as off', () => {
    process.env.NODE_ENV = 'development';
    for (const v of ['1', 'yes', 'TRUE', '']) {
      process.env.AUTH_VERBOSE_ERRORS = v;
      expect(verboseAuthErrors(), `AUTH_VERBOSE_ERRORS=${JSON.stringify(v)}`).toBe(v === '' ? true : false);
    }
  });
});

describe('loginFailureMessage()', () => {
  it('names the reason when verbose', () => {
    process.env.AUTH_VERBOSE_ERRORS = 'true';
    expect(loginFailureMessage('EMAIL_NOT_FOUND')).toBe('No account found with this email address.');
    expect(loginFailureMessage('WRONG_PASSWORD')).toBe('Incorrect password. Please try again.');
  });

  it('gives one identical answer when not verbose', () => {
    process.env.AUTH_VERBOSE_ERRORS = 'false';
    const unknown = loginFailureMessage('EMAIL_NOT_FOUND');
    const wrong   = loginFailureMessage('WRONG_PASSWORD');
    expect(unknown).toBe('Invalid credentials');
    // Byte-identical, not merely similar: a difference in wording, casing or
    // even trailing whitespace is enough to enumerate accounts with.
    expect(unknown).toBe(wrong);
  });
});

/**
 * Refresh-cookie flags.
 *
 * A Secure cookie is dropped by the browser over plain HTTP with no error
 * raised anywhere, and the access token is memory-only — every page load
 * restores the session through /auth/refresh. So a wrongly-Secure cookie does
 * not degrade gracefully: it logs the user out on their first reload, which
 * looks exactly like a failed login.
 */
describe('refresh cookie flags', () => {
  const load = async () => {
    vi.resetModules();
    return import('../../routes/auth');
  };

  it('is not Secure when the app is served over plain HTTP', async () => {
    process.env.NODE_ENV     = 'production';
    process.env.FRONTEND_URL = 'http://185.194.218.245';
    delete process.env.COOKIE_SECURE;
    const { __testRefreshCookieOptions } = await load();
    expect(__testRefreshCookieOptions().secure).toBe(false);
  });

  it('is Secure when the app is served over HTTPS', async () => {
    process.env.NODE_ENV     = 'production';
    process.env.FRONTEND_URL = 'https://security360.co.ug';
    delete process.env.COOKIE_SECURE;
    const { __testRefreshCookieOptions } = await load();
    expect(__testRefreshCookieOptions().secure).toBe(true);
  });

  it('honours COOKIE_SECURE when TLS terminates upstream', async () => {
    process.env.NODE_ENV      = 'production';
    process.env.FRONTEND_URL  = 'http://internal-lb';
    process.env.COOKIE_SECURE = 'true';
    const { __testRefreshCookieOptions } = await load();
    expect(__testRefreshCookieOptions().secure).toBe(true);
  });

  it('uses SameSite=Lax, which does not require Secure', async () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    delete process.env.COOKIE_SECURE;
    const { __testRefreshCookieOptions } = await load();
    // None is only honoured alongside Secure, and the API is same-origin with
    // the frontend, so Lax delivers on every request that needs the cookie.
    expect(__testRefreshCookieOptions().sameSite).toBe('lax');
  });
});
