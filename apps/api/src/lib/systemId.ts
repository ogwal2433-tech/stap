import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';

/**
 * System IDs — S360G001, S360C004, GUN-002, SHR-2026-007.
 *
 * The prefixes and the number width are configured in Settings → ID Formats
 * rather than compiled in, because a deployment under another brand wants its
 * own letters. Changing one affects records created afterwards; nothing is
 * renamed, and the number carries on from the highest already issued under that
 * prefix.
 *
 * The sequence is read by cutting the prefix off by length and casting what is
 * left. It is deliberately not "strip every non-digit": a prefix containing a
 * digit — S360G, the obvious choice for a Security360 deployment — would then
 * read S360G0001 as three million and one, and the next ID would jump to
 * S360G3600002.
 */

/** Tables whose systemId this module issues. Names are interpolated into SQL. */
type IdTable = 'Guard' | 'Client' | 'User' | 'Gun' | 'ShiftHandoverReport';

/** Kept for callers that still name a prefix directly. */
export type IdPrefix = string;

// ── Settings ───────────────────────────────────────────────────────────────────

const SETTING_KEYS = {
  guard:       'guard_id_prefix',
  client:      'client_id_prefix',
  staff:       'staff_id_prefix',
  gun:         'gun_id_prefix',
  shiftReport: 'shift_report_prefix',
  invoice:     'invoice_prefix',
  padding:     'id_padding',
} as const;

const FALLBACKS: Record<string, string> = {
  [SETTING_KEYS.guard]:       'S360G',
  [SETTING_KEYS.client]:      'S360C',
  [SETTING_KEYS.staff]:       'S360S',
  [SETTING_KEYS.gun]:         'GUN',
  [SETTING_KEYS.shiftReport]: 'SHR',
  [SETTING_KEYS.invoice]:     'S360/INV',
  [SETTING_KEYS.padding]:     '3',
};

/**
 * Held briefly because an ID is issued on the hot path of every create, and a
 * prefix changes about once in the life of a deployment. Short enough that an
 * administrator saving a new prefix sees it take effect without a restart.
 */
const CACHE_MS = 30_000;
let cache: Map<string, string> | null = null;
let cachedAt = 0;

/** Drops the cached formats. Called when the settings are saved. */
export function clearIdFormatCache(): void {
  cache = null;
  cachedAt = 0;
}

async function formats(): Promise<Map<string, string>> {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;

  const resolved = new Map<string, string>(Object.entries(FALLBACKS));
  try {
    const rows = await prisma.systemSetting.findMany({
      where:  { key: { in: Object.values(SETTING_KEYS) } },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      if (row.value?.trim()) resolved.set(row.key, row.value.trim());
    }
  } catch {
    // An unreachable settings table must not stop a guard being created; the
    // fallbacks are the values this system shipped with.
  }

  cache = resolved;
  cachedAt = Date.now();
  return resolved;
}

async function prefixFor(key: string): Promise<string> {
  return (await formats()).get(key) ?? FALLBACKS[key];
}

/** 1–8 digits. Anything unreadable falls back to 3 rather than throwing. */
async function padding(): Promise<number> {
  const raw = (await formats()).get(SETTING_KEYS.padding) ?? '3';
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 3 : Math.min(Math.max(n, 1), 8);
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export function formatSystemId(prefix: string, num: number, width = 3): string {
  return `${prefix}${num.toString().padStart(width, '0')}`;
}

/** Escapes a prefix for use inside a POSIX regular expression. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Sequence ───────────────────────────────────────────────────────────────────

/**
 * The highest number already issued under `prefix`, or 0.
 *
 * `body` is what follows the prefix — for a gun that is "-", for a shift report
 * "-2026-" — so the digits are read from the right place whatever the shape.
 */
async function maxIssued(table: IdTable, prefix: string, body = ''): Promise<number> {
  const head = `${prefix}${body}`;
  // Prisma.sql rather than $queryRawUnsafe: the pattern and the offset go in as
  // bound parameters, and only the table name — a closed union, never user
  // input — is interpolated.
  const rows = await prisma.$queryRaw<{ max_num: number | null }[]>(Prisma.sql`
    SELECT MAX(CAST(SUBSTRING("systemId" FROM ${head.length + 1}::int) AS BIGINT)) AS max_num
      FROM ${Prisma.raw(`"${table}"`)}
     WHERE "systemId" ~ ${`^${escapeRegex(head)}[0-9]+$`}
  `);
  return Number(rows[0]?.max_num ?? 0);
}

async function nextId(table: IdTable, settingKey: string, body = ''): Promise<string> {
  const [prefix, width] = await Promise.all([prefixFor(settingKey), padding()]);
  const next = (await maxIssued(table, prefix, body)) + 1;
  return `${prefix}${body}${next.toString().padStart(width, '0')}`;
}

/**
 * `count` consecutive IDs in one round trip, for a bulk import where issuing
 * them one row at a time is not practical.
 */
async function nextIds(table: IdTable, settingKey: string, count: number, body = ''): Promise<string[]> {
  const [prefix, width] = await Promise.all([prefixFor(settingKey), padding()]);
  const from = (await maxIssued(table, prefix, body)) + 1;
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${body}${(from + i).toString().padStart(width, '0')}`,
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const generateGuardId  = (): Promise<string> => nextId('Guard',  SETTING_KEYS.guard);
export const generateClientId = (): Promise<string> => nextId('Client', SETTING_KEYS.client);
export const generateStaffId  = (): Promise<string> => nextId('User',   SETTING_KEYS.staff);

export const generateGuardIds = (count: number): Promise<string[]> =>
  nextIds('Guard', SETTING_KEYS.guard, count);

/** GUN-001. The dash is part of the shape and is kept when the prefix changes. */
export const generateGunId = (): Promise<string> => nextId('Gun', SETTING_KEYS.gun, '-');

/** GUN-041..043 in one reservation, so a batch never mints the same id twice. */
export const generateGunIds = (count: number): Promise<string[]> =>
  nextIds('Gun', SETTING_KEYS.gun, count, '-');

/**
 * SHR-2026-001, numbered afresh each calendar year — which is why the year sits
 * in the body rather than being dropped into one running sequence.
 */
export const generateShiftReportId = (year = new Date().getFullYear()): Promise<string> =>
  nextId('ShiftHandoverReport', SETTING_KEYS.shiftReport, `-${year}-`);

/** The configured invoice prefix, e.g. "S360/INV". */
export const invoicePrefix = (): Promise<string> => prefixFor(SETTING_KEYS.invoice);
