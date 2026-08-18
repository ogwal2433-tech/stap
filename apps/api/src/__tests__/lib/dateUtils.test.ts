import { describe, it, expect } from 'vitest';
import { safeDate, dateRangeFilter, monthFilter } from '../../lib/dateUtils';

// These guard a crash that took out the Marketing module: an unparseable date
// reached Prisma as `new Date("Invalid Date")`, which it rejects outright.

describe('safeDate()', () => {
  it('rejects the values that produced Invalid Date', () => {
    for (const bad of [undefined, null, '', '   ', 'garbage', '2026-13-45', 'NaN']) {
      expect(safeDate(bad as never)).toBeNull();
    }
  });

  it('parses real dates', () => {
    expect(safeDate('2026-08-17')).toBeInstanceOf(Date);
    expect(safeDate('2026-08-17T10:30:00.000Z')?.toISOString()).toBe('2026-08-17T10:30:00.000Z');
  });

  it('passes a Date through, and rejects an invalid one', () => {
    const d = new Date('2026-08-17');
    expect(safeDate(d)).toBe(d);
    expect(safeDate(new Date('nonsense'))).toBeNull();
  });

  it('never returns a Date that Prisma would reject', () => {
    for (const v of ['', 'garbage', undefined, new Date('bad')]) {
      const out = safeDate(v as never);
      if (out) expect(Number.isNaN(out.getTime())).toBe(false);
    }
  });
});

describe('dateRangeFilter()', () => {
  it('is undefined when neither bound is usable, so the field is left out', () => {
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
    expect(dateRangeFilter('', '')).toBeUndefined();
    expect(dateRangeFilter('garbage', 'rubbish')).toBeUndefined();
  });

  it('keeps only the bound that parsed', () => {
    expect(dateRangeFilter('2026-01-01', 'garbage')).toEqual({ gte: new Date('2026-01-01') });
    expect(dateRangeFilter('garbage', '2026-12-31')).toHaveProperty('lte');
    expect(dateRangeFilter('garbage', '2026-12-31')).not.toHaveProperty('gte');
  });

  it('supports an open-ended range', () => {
    expect(dateRangeFilter('2026-06-01', undefined)).toEqual({ gte: new Date('2026-06-01') });
  });

  it('extends the end bound over the whole day when asked', () => {
    const f = dateRangeFilter(undefined, '2026-08-17', true)!;
    expect(f.lte!.getHours()).toBe(23);
    expect(f.lte!.getMinutes()).toBe(59);
    expect(f.lte!.getSeconds()).toBe(59);
  });

  it('leaves the end bound alone by default', () => {
    const f = dateRangeFilter(undefined, '2026-08-17T09:00:00.000Z')!;
    expect(f.lte!.toISOString()).toBe('2026-08-17T09:00:00.000Z');
  });
});

describe('monthFilter()', () => {
  it('covers the month as a half-open range', () => {
    expect(monthFilter(2026, 7)).toEqual({ gte: new Date(2026, 7, 1), lt: new Date(2026, 8, 1) });
  });

  it('rolls into the next year from December', () => {
    expect(monthFilter(2026, 11)).toEqual({ gte: new Date(2026, 11, 1), lt: new Date(2027, 0, 1) });
  });

  it('is null for missing or non-numeric parts', () => {
    expect(monthFilter(null, 7)).toBeNull();
    expect(monthFilter(2026, null)).toBeNull();
    expect(monthFilter(NaN, 7)).toBeNull();
    expect(monthFilter(2026, NaN)).toBeNull();
  });
});
