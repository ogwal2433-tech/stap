import { describe, it, expect } from 'vitest';
import { resolveSiteShift } from '../../services/siteService';

/**
 * The deployment sheet's Shift column is not the user's to fill in — it is
 * resolved from how the site is set up and what the client is contracted for.
 * These cover that resolution order, and the one case where the sheet still has
 * to offer a choice.
 */

const ACTIVE = ['DAY', 'NIGHT', 'FULL_24'];

const site = (over: Partial<Parameters<typeof resolveSiteShift>[0]> = {}) => ({
  id:                'site-1',
  siteName:          'Warehouse A',
  defaultShiftType:  null,
  allowedShiftTypes: [],
  shiftPattern:      null,
  ...over,
});

describe('resolveSiteShift() — resolution order', () => {
  it("prefers the site's own default shift", () => {
    const r = resolveSiteShift(
      site({ defaultShiftType: 'NIGHT', allowedShiftTypes: ['DAY'], shiftPattern: 'TWO_SHIFTS' }),
      ACTIVE,
    );
    expect(r.shift).toBe('NIGHT');
    expect(r.source).toBe('SITE_DEFAULT');
    expect(r.shiftOptions).toEqual(['NIGHT']);
  });

  it("falls back to the site's allowed shifts when there is no default", () => {
    const r = resolveSiteShift(site({ allowedShiftTypes: ['DAY'], shiftPattern: 'TWO_SHIFTS' }), ACTIVE);
    expect(r.shift).toBe('DAY');
    expect(r.source).toBe('SITE_ALLOWED');
  });

  it("falls back to the client's contract when the site says nothing", () => {
    const r = resolveSiteShift(site({ shiftPattern: 'SINGLE_SHIFT' }), ACTIVE);
    expect(r.shift).toBe('FULL_24');
    expect(r.source).toBe('CONTRACT');
    expect(r.note).toContain('contract');
  });

  it('falls back to the first active shift type when nothing else applies', () => {
    const r = resolveSiteShift(site(), ACTIVE);
    expect(r.shift).toBe('DAY');
    expect(r.source).toBe('SYSTEM_DEFAULT');
  });

  it('resolves nothing when no shift types are active at all', () => {
    const r = resolveSiteShift(site(), []);
    expect(r.shift).toBeNull();
    expect(r.source).toBe('NONE');
    expect(r.shiftOptions).toEqual([]);
  });
});

describe('resolveSiteShift() — never proposes an unusable shift', () => {
  it('ignores a site default that is no longer an active shift type', () => {
    const r = resolveSiteShift(site({ defaultShiftType: 'TWILIGHT' }), ACTIVE);
    expect(r.shift).not.toBe('TWILIGHT');
    expect(r.source).toBe('SYSTEM_DEFAULT');
  });

  it('drops deactivated shifts from a site\'s allowed list', () => {
    const r = resolveSiteShift(site({ allowedShiftTypes: ['TWILIGHT', 'NIGHT'] }), ACTIVE);
    expect(r.shiftOptions).toEqual(['NIGHT']);
  });

  it('drops contract-implied shifts that are not active', () => {
    const r = resolveSiteShift(site({ shiftPattern: 'TWO_SHIFTS' }), ['DAY']);
    expect(r.shiftOptions).toEqual(['DAY']);
  });
});

describe('resolveSiteShift() — when the sheet must still offer a choice', () => {
  it('locks the column for a site that runs exactly one shift', () => {
    const r = resolveSiteShift(site({ allowedShiftTypes: ['DAY'] }), ACTIVE);
    expect(r.shiftOptions).toHaveLength(1);
  });

  it('offers both shifts for a two-shift site, so night rows can be entered', () => {
    const r = resolveSiteShift(site({ shiftPattern: 'TWO_SHIFTS' }), ACTIVE);
    expect(r.shiftOptions).toEqual(['DAY', 'NIGHT']);
    expect(r.shift).toBe('DAY');   // pre-selected, but changeable
  });

  it('carries the contract pattern through even when the site decides the shift', () => {
    const r = resolveSiteShift(site({ defaultShiftType: 'DAY', shiftPattern: 'THREE_SHIFTS' }), ACTIVE);
    expect(r.shiftPattern).toBe('THREE_SHIFTS');
  });
});
