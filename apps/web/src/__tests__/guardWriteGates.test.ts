import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getApiErrorMessage } from '../lib/api';

/**
 * "+ Add Guard" was shown by permission (guards.create) while the page it opened
 * was guarded by a role list of DIRECTOR and ASSISTANT_MANAGER. A role granted
 * guards.create saw the button and was refused on arrival.
 *
 * Nothing failed loudly: both checks worked, they just asked different
 * questions. These read the router, the list page and the sidebar and require
 * every way into a guard write page to ask the same one.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const app     = read('App.tsx');
const list    = read('pages/guards/GuardsListPage.tsx');
const sidebar = read('components/layout/Sidebar.tsx');

/** The whole <Route .../> element for a path. */
function routeFor(path: string): string {
  const m = app.match(new RegExp(`<Route\\s+path="${path.replace(/[/:]/g, (c) => `\\${c}`)}"[^\\n]*`));
  if (!m) throw new Error(`no route for ${path}`);
  return m[0];
}

/** The permission on the nearest PermissionGuard opened before `needle`. */
function gateBefore(source: string, needle: string): string | null {
  const at = source.indexOf(needle);
  if (at === -1) throw new Error(`"${needle}" not found`);
  const before = source.slice(0, at);
  const open   = before.lastIndexOf('<PermissionGuard permission="');
  const close  = before.lastIndexOf('</PermissionGuard>');
  if (open === -1 || close > open) return null;
  return before.slice(open).match(/permission="([^"]+)"/)![1];
}

describe('guard write pages gate on permissions', () => {
  it.each([
    ['/guards/new',      'guards.create'],
    ['/guards/import',   'guards.create'],
    ['/guards/:id/edit', 'guards.edit'],
  ])('%s requires %s and no role list', (path, permission) => {
    const route = routeFor(path);
    expect(route).toContain(`<PermissionGuard permission="${permission}"`);
    expect(route).not.toContain('RoleGuard');
  });

  it('the Add Guard button asks for the permission its page requires', () => {
    expect(gateBefore(list, "navigate('/guards/new')")).toBe('guards.create');
  });

  it('the Import button asks for the permission its page requires', () => {
    expect(gateBefore(list, "navigate('/guards/import')")).toBe('guards.create');
  });

  it('the sidebar Bulk Import link asks for the permission its page requires', () => {
    expect(gateBefore(sidebar, 'to="/guards/import"')).toBe('guards.create');
  });
});

describe('what the guard form shows when the API refuses', () => {
  const failure = (status: number, data: unknown) => ({ response: { status, data } });

  it('names the fields on a validation failure instead of "Validation failed"', () => {
    const msg = getApiErrorMessage(failure(400, {
      error: 'Validation failed',
      details: { formErrors: [], fieldErrors: { dateOfBirth: ['Invalid datetime'], salaryRate: ['Number must be greater than 0'] } },
    }), 'Failed to create guard');

    expect(msg).not.toBe('Validation failed');
    expect(msg).toMatch(/Invalid datetime/);
    expect(msg).toMatch(/greater than 0/);
  });

  it('passes a 403 through, so a missing permission is named rather than a generic failure', () => {
    const msg = getApiErrorMessage(failure(403, {
      error: 'Access denied. Missing permission: Create guards.',
    }), 'Failed to create guard');

    expect(msg).toMatch(/Missing permission/);
  });
});
