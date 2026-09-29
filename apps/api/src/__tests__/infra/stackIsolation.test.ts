import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * One host runs several stacks of this code at once: Security360 on 80/443, QA on
 * 8000, Security360 on 8080. They share nothing but the machine.
 *
 * These pin that. A container name, volume, network or published port reused
 * between two of them does not fail loudly — Docker attaches the new stack to
 * the existing resource, and the second deployment comes up talking to the
 * first one's database. This is the check that stops that reaching a server.
 *
 * Parsed with narrow regexes rather than a YAML library: no parser is a direct
 * dependency here, and relying on a hoisted transitive one is how a test starts
 * failing for reasons unrelated to what it asserts.
 */

const ROOT = resolve(__dirname, '../../../../..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');

const STACKS = {
  primary:     'docker-compose.yml',
  qa:          'docker-compose.qa.yml',
  security360: 'docker-compose.security360.yml',
} as const;

const all = <T,>(re: RegExp, src: string): T[] =>
  [...src.matchAll(re)].map((m) => m[1] as unknown as T);

const containerNames = (s: string) => all<string>(/^\s*container_name:\s*(\S+)/gm, s);

/**
 * Entries of a top-level `volumes:` / `networks:` block.
 *
 * An entry may pin an explicit `name:`, which is what Docker uses verbatim, or
 * omit it and be prefixed with the compose project name. Both forms are in use
 * here — the primary stack's volumes predate the explicit naming — so the effective
 * identifier is the declared name where there is one and the key otherwise.
 */
function blockEntries(src: string, heading: 'volumes' | 'networks'): string[] {
  const afterHeading = src.split(new RegExp(`^${heading}:`, 'm'))[1];
  if (afterHeading === undefined) return [];
  // Stops at the next top-level key, so `volumes:` does not swallow `networks:`.
  const block = afterHeading.split(/^\S/m)[0] ?? '';

  const names: string[] = [];
  let current: string | null = null;

  for (const line of block.split('\n')) {
    const key = /^\s{2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (key) {
      if (current) names.push(current);
      current = key[1]!;
      continue;
    }
    const explicit = /^\s{4}name:\s*(\S+)/.exec(line);
    if (explicit && current) {
      names.push(explicit[1]!);
      current = null;
    }
  }
  if (current) names.push(current);
  return names;
}

const volumeNames  = (s: string) => blockEntries(s, 'volumes');
const networkNames = (s: string) => blockEntries(s, 'networks');
/** Host side of every published mapping, with compose defaults resolved. */
const hostPorts = (s: string) =>
  all<string>(/^\s*-\s*"?\$?\{?([^":\s}]+(?::-\d+)?)\}?:\d+"?\s*$/gm, s)
    .map((p) => (p.includes(':-') ? p.split(':-')[1]! : p))
    .filter((p) => /^\d+$/.test(p));

describe('the three stacks share no identifiers', () => {
  const files = Object.fromEntries(
    Object.entries(STACKS).map(([k, f]) => [k, read(f)]),
  ) as Record<keyof typeof STACKS, string>;

  it.each([
    ['container names', containerNames],
    ['volume names',    volumeNames],
    ['network names',   networkNames],
    ['host ports',      hostPorts],
  ] as const)('%s are unique across all three', (_label, extract) => {
    const seen = new Map<string, string>();

    for (const [stack, src] of Object.entries(files)) {
      const values = extract(src);
      // A stack that suddenly yields nothing means the regex stopped matching
      // the file's shape — that would make this whole test pass vacuously.
      expect(values.length).toBeGreaterThan(0);

      for (const value of values) {
        const owner = seen.get(value);
        expect(owner, `"${value}" is used by both ${owner} and ${stack}`).toBeUndefined();
        seen.set(value, stack);
      }
    }
  });

  it('every stack pins its own compose project name', () => {
    // Without `name:` the project is named after the directory, so two stacks
    // in one checkout would collide. The primary stack deploys to
    // /var/www/security360, which would derive "security360" — the name the
    // second stack pins — so it declares its own too.
    expect(files.primary).toMatch(/^name:\s*s360-prod$/m);
    expect(files.qa).toMatch(/^name:\s*security360-qa$/m);
    expect(files.security360).toMatch(/^name:\s*security360$/m);
    expect(files.security360).not.toMatch(/^name:\s*security360-qa$/m);
  });

  it('Security360 keeps its database off the host', () => {
    // psql is one `docker exec` away; a second Postgres on a host port is an
    // exposure that buys nothing.
    const postgres = files.security360.split(/^  redis:/m)[0] ?? '';
    expect(postgres).not.toMatch(/^\s*ports:/m);
  });

  it('Security360 runs a worker, or nothing queued ever happens', () => {
    // Emails, audit entries and cron all go through BullMQ. Without this
    // container they queue up and are never processed, and the stack looks fine.
    expect(files.security360).toMatch(/^\s{2}worker:/m);
    expect(files.security360).toContain('apps/api/dist/worker.js');
  });

  it('Security360 builds the frontend with its own brand', () => {
    // The bundle is static, so an unset build arg silently ships Security360 branding.
    expect(files.security360).toMatch(/VITE_APP_NAME:\s*\$\{S360_APP_NAME/);
  });

  it('Security360 refuses to start on unset secrets', () => {
    // `:?` makes compose fail before building rather than leaving a stack that
    // half-runs on placeholder credentials.
    for (const key of [
      'S360_POSTGRES_PASSWORD',
      'S360_JWT_SECRET',
      'S360_JWT_REFRESH_SECRET',
      'S360_SETTINGS_ENCRYPTION_KEY',
    ]) {
      expect(files.security360).toContain(`${key}:?`);
    }
  });
});

describe('the committed env example', () => {
  const example = read('.env.security360.example');

  it('lists every S360_ variable the compose file requires', () => {
    const required = new Set(
      [...read(STACKS.security360).matchAll(/\$\{(S360_[A-Z0-9_]+)/g)].map((m) => m[1]!),
    );
    const documented = new Set(
      [...example.matchAll(/^(S360_[A-Z0-9_]+)=/gm)].map((m) => m[1]!),
    );

    const undocumented = [...required].filter((k) => !documented.has(k));
    expect(undocumented, `not in .env.security360.example: ${undocumented.join(', ')}`).toEqual([]);
  });

  it('ships no usable secret', () => {
    // The example is committed; a real value here would be a leaked credential,
    // and a weak placeholder that happens to work is worse than one that fails.
    for (const line of example.split('\n')) {
      const m = /^(S360_(?:\w*(?:SECRET|PASSWORD|KEY))\w*)=(.+)$/.exec(line.trim());
      if (m) expect(m[2], `${m[1]} has a value in the committed example`).toMatch(/^CHANGE_ME/);
    }
  });

  it('is gitignored while the example is not', () => {
    expect(read('.gitignore')).toMatch(/^\.env\.security360$/m);
  });
});
