import { describe, it, expect } from 'vitest';
import { hasMinimumRole, ROLES, ROLE_HIERARCHY } from '../types/roles';

describe('hasMinimumRole()', () => {
  it('returns true when user and minimum are the same role', () => {
    expect(hasMinimumRole(ROLES.DIRECTOR, ROLES.DIRECTOR)).toBe(true);
    expect(hasMinimumRole(ROLES.ACCOUNTS_OFFICER, ROLES.ACCOUNTS_OFFICER)).toBe(true);
    expect(hasMinimumRole(ROLES.GUARD, ROLES.GUARD)).toBe(true);
    expect(hasMinimumRole(ROLES.CLIENT, ROLES.CLIENT)).toBe(true);
  });

  it('returns true when user outranks the minimum', () => {
    expect(hasMinimumRole(ROLES.DIRECTOR, ROLES.GUARD)).toBe(true);
    expect(hasMinimumRole(ROLES.DIRECTOR, ROLES.CLIENT)).toBe(true);
    expect(hasMinimumRole(ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER)).toBe(true);
    expect(hasMinimumRole(ROLES.ADMINISTRATOR, ROLES.FIELD_SUPERVISOR)).toBe(true);
  });

  it('returns false when user is below the minimum', () => {
    expect(hasMinimumRole(ROLES.GUARD, ROLES.DIRECTOR)).toBe(false);
    expect(hasMinimumRole(ROLES.CLIENT, ROLES.DIRECTOR)).toBe(false);
    expect(hasMinimumRole(ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR)).toBe(false);
    expect(hasMinimumRole(ROLES.MARKETING, ROLES.ADMINISTRATOR)).toBe(false);
  });

  it('DIRECTOR passes every role threshold', () => {
    for (const role of ROLE_HIERARCHY) {
      expect(hasMinimumRole(ROLES.DIRECTOR, role)).toBe(true);
    }
  });

  it('all 10 roles tested against DIRECTOR threshold — only DIRECTOR passes', () => {
    for (const role of ROLE_HIERARCHY) {
      const expected = role === ROLES.DIRECTOR;
      expect(hasMinimumRole(role, ROLES.DIRECTOR)).toBe(expected);
    }
  });

  it('ACCOUNTS_OFFICER threshold — Director and AM and Administrator and Ops/Field/Trainer pass; Marketing, Guard, Client fail', () => {
    const pass = [
      ROLES.DIRECTOR,
      ROLES.ASSISTANT_MANAGER,
      ROLES.ADMINISTRATOR,
      ROLES.OPERATIONS_SUPERVISOR,
      ROLES.FIELD_SUPERVISOR,
      ROLES.TRAINER,
      ROLES.ACCOUNTS_OFFICER,
    ];
    const fail = [ROLES.MARKETING, ROLES.GUARD, ROLES.CLIENT];

    for (const role of pass) {
      expect(hasMinimumRole(role, ROLES.ACCOUNTS_OFFICER)).toBe(true);
    }
    for (const role of fail) {
      expect(hasMinimumRole(role, ROLES.ACCOUNTS_OFFICER)).toBe(false);
    }
  });
});
