import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS, permissionModule, permissionName } from '../../constants/permissions';
import { DEFAULT_ROLE_PERMISSIONS, rolesWithDefault } from '../../constants/defaultPermissions';

/**
 * The permission catalogue and the default grants.
 *
 * These are pure data, and wrong data here is silent: a typo'd key is a
 * permission no route can ever satisfy, and a permission granted to a role that
 * should not hold it widens access with nothing to show for it.
 */

describe('permission catalogue', () => {
  it('has a unique key per permission', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('uses module.action throughout', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      expect(key, key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('derives the module from the key, so the two cannot drift', () => {
    expect(permissionModule('guards.edit')).toBe('guards');
    expect(permissionModule('service_requests.respond')).toBe('service_requests');
  });

  it('renders a readable name from the constant', () => {
    expect(permissionName('GUARDS_EDIT')).toBe('Guards Edit');
    expect(permissionName('SERVICE_REQUESTS_RESPOND')).toBe('Service Requests Respond');
  });
});

describe('default role permissions', () => {
  it('grants only keys that exist in the catalogue', () => {
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const key of keys) {
        expect(ALL_PERMISSION_KEYS, `${role} → ${key}`).toContain(key);
      }
    }
  });

  it('lists no role twice within its own set', () => {
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });

  it('gives DIRECTOR every permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.DIRECTOR).toHaveLength(ALL_PERMISSION_KEYS.length);
  });

  it('keeps roles.manage reachable', () => {
    // If no role but DIRECTOR could manage permissions, a misconfigured
    // DIRECTOR would leave the matrix unreachable.
    const managers = rolesWithDefault(PERMISSIONS.ROLES_MANAGE);
    expect(managers).toContain('DIRECTOR');
    expect(managers).toContain('ADMINISTRATOR');
  });

  it('omits GUARD and CLIENT', () => {
    // They reach the system through check-in and the portal, which scope to the
    // holder's own records rather than gating on permissions.
    expect(DEFAULT_ROLE_PERMISSIONS.GUARD).toBeUndefined();
    expect(DEFAULT_ROLE_PERMISSIONS.CLIENT).toBeUndefined();
  });

  it('never grants a write without the matching read', () => {
    // A role that can edit but not view lands on an empty screen it cannot use.
    const pairs: Array<[string, string]> = [
      ['guards.edit', 'guards.view'],
      ['clients.edit', 'clients.view'],
      ['attendance.edit', 'attendance.view'],
      ['inventory.issue', 'inventory.view'],
      ['invoices.create', 'invoices.view'],
      ['guns.deploy', 'guns.view'],
    ];
    for (const [write, read] of pairs) {
      for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        if ((keys as string[]).includes(write)) {
          expect(keys, `${role} has ${write} but not ${read}`).toContain(read);
        }
      }
    }
  });
});

/**
 * Records where the default grants do NOT match the roles the routes allow
 * today. Each of these is a deliberate decision waiting to be made, not an
 * oversight — swapping the route over before deciding would change who can do
 * what, silently.
 */
describe('known divergence from current requireRole gates', () => {
  it('staff.deactivate is broader than ACCOUNT_CONTROL_ROLES', () => {
    // routes/staff.ts restricts deactivate, reactivate and reset-password to
    // DIRECTOR and ADMINISTRATOR. The default set also gives it to
    // ASSISTANT_MANAGER, so migrating that route as-is would grant Assistant
    // Managers the ability to deactivate accounts and reset passwords.
    const holders = rolesWithDefault(PERMISSIONS.STAFF_DEACTIVATE);
    expect(holders).toContain('ASSISTANT_MANAGER');
    expect(holders).toEqual(
      expect.arrayContaining(['DIRECTOR', 'ADMINISTRATOR', 'ASSISTANT_MANAGER']),
    );
  });
});
