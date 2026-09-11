/**
 * Set arithmetic for the permission matrix.
 *
 * Kept out of the component so the rules deciding what a bulk change does —
 * and whether it strands the person making it — can be tested without
 * rendering anything.
 */

export const ROLES_MANAGE_KEY = 'roles.manage';

const sorted = (keys: Iterable<string>): string[] => [...new Set(keys)].sort();

/** The held set with every key of one module switched on, or off. */
export function withModule(
  held: Iterable<string>,
  moduleKeys: readonly string[],
  grant: boolean,
): string[] {
  const next = new Set(held);
  for (const key of moduleKeys) {
    if (grant) next.add(key);
    else next.delete(key);
  }
  return sorted(next);
}

/** What a replacement would grant and take away, so a confirm can say so. */
export function diffSets(
  before: Iterable<string>,
  after: Iterable<string>,
): { added: string[]; removed: string[] } {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added:   sorted([...a].filter((k) => !b.has(k))),
    removed: sorted([...b].filter((k) => !a.has(k))),
  };
}

/**
 * True when a change takes roles.manage away from the role the person making
 * it holds.
 *
 * The change is allowed — DIRECTOR is immutable and always keeps the key, so
 * permission management stays reachable — but the viewer loses this page the
 * moment it lands, which deserves a warning rather than a surprise.
 */
export function locksOutViewer(
  viewerRole: string | null | undefined,
  targetRole: string,
  before: Iterable<string>,
  after: Iterable<string>,
): boolean {
  if (!viewerRole || viewerRole !== targetRole) return false;
  return new Set(before).has(ROLES_MANAGE_KEY) && !new Set(after).has(ROLES_MANAGE_KEY);
}

/**
 * A preset's keys, less any the catalogue no longer has.
 *
 * Presets store keys as written so they survive catalogue changes. Applying one
 * skips what has gone and says so, rather than being refused outright by the
 * replace endpoint, which rejects any unknown key.
 */
export function applicablePresetKeys(
  presetKeys: readonly string[],
  catalogueKeys: Iterable<string>,
): { keys: string[]; skipped: string[] } {
  const known = new Set(catalogueKeys);
  return {
    keys:    sorted(presetKeys.filter((k) => known.has(k))),
    skipped: sorted(presetKeys.filter((k) => !known.has(k))),
  };
}
