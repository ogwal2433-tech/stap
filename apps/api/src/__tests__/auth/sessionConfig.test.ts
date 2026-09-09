import { describe, it, expect } from 'vitest';
import { parseDuration } from '../../config/session';

describe('parseDuration()', () => {
  it('reads the suffixed forms used in .env', () => {
    expect(parseDuration('15m', 0)).toBe(900);
    expect(parseDuration('8h', 0)).toBe(8 * 3600);
    expect(parseDuration('7d', 0)).toBe(7 * 86400);
    expect(parseDuration('30s', 0)).toBe(30);
  });

  it('treats a bare number as seconds', () => {
    expect(parseDuration('900', 0)).toBe(900);
  });

  it('tolerates surrounding whitespace and a space before the unit', () => {
    expect(parseDuration('  15m ', 0)).toBe(900);
    expect(parseDuration('15 m', 0)).toBe(900);
  });

  it('falls back rather than yielding a nonsense expiry', () => {
    // A typo here would otherwise sign everyone out instantly, or never.
    for (const bad of ['', 'abc', '15x', '-5m', '0', '0m', '1.5h', 'm15']) {
      expect(parseDuration(bad, 4242)).toBe(4242);
    }
  });
});
