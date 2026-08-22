import { describe, it, expect, afterEach } from 'vitest';
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
