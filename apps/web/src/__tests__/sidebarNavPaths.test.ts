import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The sidebar keeps two lists: the nav items themselves, and ALL_NAV_PATHS —
 * the set of paths that actually have a route. An item missing from the second
 * list still renders, but as a greyed-out "Soon" stub that cannot be clicked.
 *
 * That failure is silent: the page exists, the route works if you type the URL,
 * and only the sidebar is dead. These read the two files and assert the lists
 * agree, so adding a page without wiring the path fails here instead of
 * shipping an unreachable menu entry.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const sidebar = read('components/layout/Sidebar.tsx');
const app     = read('../src/App.tsx');

/** Every `to:` declared on a nav item. */
const navPaths = [...new Set([...sidebar.matchAll(/to:\s*'([^']+)'/g)].map(m => m[1]))];

/** The ALL_NAV_PATHS whitelist. */
const allowed = new Set(
  [...(sidebar.match(/const ALL_NAV_PATHS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map(m => m[1]),
);

/** Every path with a <Route path="..."> in the router. */
const routed = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]));

describe('sidebar navigation wiring', () => {
  it('finds nav items and the whitelist', () => {
    expect(navPaths.length).toBeGreaterThan(5);
    expect(allowed.size).toBeGreaterThan(5);
    expect(routed.size).toBeGreaterThan(5);
  });

  it('every nav item that has a route is clickable, not a "Soon" stub', () => {
    const unreachable = navPaths.filter(p => routed.has(p) && !allowed.has(p));
    expect(unreachable, `built but shown as "Soon": ${unreachable.join(', ')}`).toEqual([]);
  });

  it('no nav item links to a path with no route', () => {
    // The reverse mistake: clickable in the sidebar, 404 on arrival.
    const dangling = navPaths.filter(p => allowed.has(p) && !routed.has(p));
    expect(dangling, `linked but unrouted: ${dangling.join(', ')}`).toEqual([]);
  });

  it('keeps the two pages added this sprint reachable', () => {
    for (const p of ['/service-requests', '/admin/audit-log']) {
      expect(navPaths, `${p} missing from the sidebar`).toContain(p);
      expect(allowed.has(p), `${p} would render as "Soon"`).toBe(true);
      expect(routed.has(p), `${p} has no route`).toBe(true);
    }
  });
});
