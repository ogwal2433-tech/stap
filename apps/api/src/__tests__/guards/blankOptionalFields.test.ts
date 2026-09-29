import { describe, it, expect } from 'vitest';
import { CreateGuardSchema } from '@security360/shared';

/**
 * A field left blank on a form arrives as "", not as absent.
 *
 * `.optional()` permits undefined and nothing else, so every optional field
 * carrying a content check used to run it against the empty string. Leaving a
 * phone box alone read as a malformed phone; leaving next of kin alone read as
 * "String must contain at least 1 character(s)". It looked as though the field
 * was still required — it was not, it was being judged as a bad value rather
 * than an absent one.
 *
 * The rule these pin: blank means not given. A value that is actually supplied
 * is still checked.
 */

/** The five NOT NULL columns — the minimum any guard needs. */
const base = {
  firstName:     'Blank',
  lastName:      'Test',
  dateOfBirth:   '1990-01-01T00:00:00.000Z',
  salaryRate:    300_000,
  contractStart: '2026-01-01T00:00:00.000Z',
};

const parse = (over: Record<string, unknown>) => CreateGuardSchema.safeParse({ ...base, ...over });

describe('a blank optional field is absent, not invalid', () => {
  it('accepts a guard with nothing beyond the required five', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each([
    ['phone'],
    ['nextOfKinPhone'],
    ['preferredPaymentContact'],
    ['spouseTelephone'],
    ['lcOfficialPhone'],
    ['fatherPhone'],
    ['motherPhone'],
  ])('accepts a blank %s rather than calling it malformed', (field) => {
    const result = parse({ [field]: '' });
    expect(result.success, JSON.stringify(result.success ? {} : result.error.issues)).toBe(true);
  });

  it.each([
    ['nationalId'],
    ['nextOfKinName'],
    ['rank'],
  ])('accepts a blank %s rather than calling it too short', (field) => {
    expect(parse({ [field]: '' }).success).toBe(true);
  });

  it.each([
    ['contractEnd'],
    ['probationEndDate'],
  ])('accepts a blank %s rather than calling it a bad date', (field) => {
    expect(parse({ [field]: '' }).success).toBe(true);
  });

  it('treats whitespace as blank too', () => {
    expect(parse({ phone: '   ' }).success).toBe(true);
  });

  it('still rejects a phone that is present and wrong', () => {
    // The point of the change is the presence rule, not the format rule.
    const result = parse({ phone: 'not-a-phone' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/phone/i);
    }
  });

  it('still accepts a phone that is present and right', () => {
    expect(parse({ phone: '+256700000001' }).success).toBe(true);
  });

  it('still rejects a malformed parent phone', () => {
    expect(parse({ fatherPhone: '123' }).success).toBe(false);
  });

  it('reports a blank salary as required, not as "received nan"', () => {
    // An empty number input coerces to NaN. The old message named the coercion
    // rather than the problem.
    const result = CreateGuardSchema.safeParse({ ...base, salaryRate: Number.NaN });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0].message;
      expect(message).not.toMatch(/nan/i);
      expect(message).toMatch(/required/i);
    }
  });

  it('still rejects a salary that is present and impossible', () => {
    expect(CreateGuardSchema.safeParse({ ...base, salaryRate: -5 }).success).toBe(false);
    expect(CreateGuardSchema.safeParse({ ...base, salaryRate: 0 }).success).toBe(false);
  });

  it('keeps the five NOT NULL fields required', () => {
    for (const field of Object.keys(base)) {
      const without = { ...base } as Record<string, unknown>;
      delete without[field];
      expect(CreateGuardSchema.safeParse(without).success, `${field} should be required`).toBe(false);
    }
  });
});
