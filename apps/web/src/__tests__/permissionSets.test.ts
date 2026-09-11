import { describe, it, expect } from 'vitest';
import {
  ROLES_MANAGE_KEY, withModule, diffSets, locksOutViewer, applicablePresetKeys,
} from '../lib/permissionSets';

const GUARDS = ['guards.view', 'guards.edit', 'guards.create'];

describe('withModule()', () => {
  it('grants every key in the module and keeps the rest', () => {
    expect(withModule(['clients.view'], GUARDS, true)).toEqual(
      ['clients.view', 'guards.create', 'guards.edit', 'guards.view'],
    );
  });

  it('revokes every key in the module and keeps the rest', () => {
    expect(withModule(['clients.view', 'guards.view', 'guards.edit'], GUARDS, false))
      .toEqual(['clients.view']);
  });

  it('is idempotent — granting what is held changes nothing', () => {
    const held = [...GUARDS, 'clients.view'];
    expect(withModule(held, GUARDS, true)).toEqual([...held].sort());
  });

  it('never duplicates a key', () => {
    expect(withModule(['guards.view', 'guards.view'], GUARDS, true)).toHaveLength(3);
  });

  it('does not mutate what it was given', () => {
    const held = ['guards.view'];
    withModule(held, GUARDS, false);
    expect(held).toEqual(['guards.view']);
  });
});

describe('diffSets()', () => {
  it('reports what is gained and lost', () => {
    expect(diffSets(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({ added: ['d'], removed: ['a'] });
  });

  it('is empty when nothing changes, whatever the order', () => {
    expect(diffSets(['b', 'a'], ['a', 'b'])).toEqual({ added: [], removed: [] });
  });

  it('counts a full revoke as every key removed', () => {
    expect(diffSets(GUARDS, []).removed).toHaveLength(3);
  });
});

describe('locksOutViewer()', () => {
  const before = ['guards.view', ROLES_MANAGE_KEY];
  const after  = ['guards.view'];

  it('flags removing roles.manage from the viewer’s own role', () => {
    expect(locksOutViewer('ADMINISTRATOR', 'ADMINISTRATOR', before, after)).toBe(true);
  });

  it('does not flag the same change to someone else’s role', () => {
    expect(locksOutViewer('ADMINISTRATOR', 'HR', before, after)).toBe(false);
  });

  it('does not flag a change that leaves roles.manage in place', () => {
    expect(locksOutViewer('ADMINISTRATOR', 'ADMINISTRATOR', before, before)).toBe(false);
  });

  it('does not flag a role that never held it', () => {
    expect(locksOutViewer('ADMINISTRATOR', 'ADMINISTRATOR', ['guards.view'], [])).toBe(false);
  });

  it('treats an unknown viewer as not locked out', () => {
    expect(locksOutViewer(undefined, 'ADMINISTRATOR', before, after)).toBe(false);
  });
});

describe('applicablePresetKeys()', () => {
  const catalogue = ['guards.view', 'guards.edit', 'clients.view'];

  it('keeps keys the catalogue still has', () => {
    expect(applicablePresetKeys(['guards.view', 'clients.view'], catalogue))
      .toEqual({ keys: ['clients.view', 'guards.view'], skipped: [] });
  });

  it('skips keys that have since been removed, and names them', () => {
    // A preset outlives the catalogue. It should still apply, minus what went.
    expect(applicablePresetKeys(['guards.view', 'retired.thing'], catalogue))
      .toEqual({ keys: ['guards.view'], skipped: ['retired.thing'] });
  });

  it('handles an empty preset — a legitimate "no access" set', () => {
    expect(applicablePresetKeys([], catalogue)).toEqual({ keys: [], skipped: [] });
  });
});
