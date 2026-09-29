import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLES, ROLE_NAME_PATTERN, normaliseRoleName } from '@security360/shared';
import { SYSTEM_ROLES, PORTAL_ROLES } from '../../constants/systemRoles';

const MIGRATION = resolve(
  __dirname,
  '../../../prisma/migrations/20260910000002_replace_role_enum_with_table/migration.sql',
);

describe('system roles', () => {
  it('cover every role code names', () => {
    expect(new Set(SYSTEM_ROLES.map((r) => r.name))).toEqual(new Set(Object.values(ROLES)));
  });

  it('are exactly what the migration seeds — no more, no fewer', () => {
    // The migration is SQL and cannot import this list, so the two are kept in
    // step here. A role in one and not the other is a row the seed would add
    // later, or a value the foreign key would refuse.
    const seeded = [...readFileSync(MIGRATION, 'utf8').matchAll(/\(gen_random_uuid\(\)::text,\s*'([A-Z_]+)'/g)]
      .map((m) => m[1]);
    expect(seeded).toHaveLength(SYSTEM_ROLES.length);
    expect(new Set(seeded)).toEqual(new Set(SYSTEM_ROLES.map((r) => r.name)));
  });

  it('keep MARKETING, disabled, and every other one enabled', () => {
    for (const r of SYSTEM_ROLES) expect(r.isActive, r.name).toBe(r.name !== 'MARKETING');
  });

  it('give every role a label and a hex colour', () => {
    for (const r of SYSTEM_ROLES) {
      expect(r.label.length, r.name).toBeGreaterThan(1);
      expect(r.colour, r.name).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('use names the create endpoint would itself accept', () => {
    for (const r of SYSTEM_ROLES) expect(ROLE_NAME_PATTERN.test(r.name), r.name).toBe(true);
  });

  it('treat GUARD and CLIENT as portal roles', () => {
    expect([...PORTAL_ROLES].sort()).toEqual(['CLIENT', 'GUARD']);
  });
});

describe('normaliseRoleName()', () => {
  it.each([
    ['Zone Manager',          'ZONE_MANAGER'],
    ['  zone   manager  ',    'ZONE_MANAGER'],
    ['Zone-Manager (North)',  'ZONE_MANAGER_NORTH'],
    ['zone__manager',         'ZONE_MANAGER'],
    ['HR',                    'HR'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseRoleName(input)).toBe(expected);
  });

  it('caps the result at 40 characters', () => {
    expect(normaliseRoleName('a'.repeat(60))).toHaveLength(40);
  });

  it('leaves punctuation alone as an empty name, which the pattern refuses', () => {
    expect(normaliseRoleName('!!!')).toBe('');
    expect(ROLE_NAME_PATTERN.test('')).toBe(false);
  });

  it('pattern refuses a leading digit and a single character', () => {
    expect(ROLE_NAME_PATTERN.test('9_LIVES')).toBe(false);
    expect(ROLE_NAME_PATTERN.test('Z')).toBe(false);
    expect(ROLE_NAME_PATTERN.test('ZONE_MANAGER')).toBe(true);
  });
});
