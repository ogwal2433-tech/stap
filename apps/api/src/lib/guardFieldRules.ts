import prisma from '../db/prisma';
import { AppError } from '../errors/AppError';

/**
 * Which guard fields this deployment insists on.
 *
 * Only fields that the database and the schema allow to be absent can be
 * configured. firstName, lastName, dateOfBirth, salaryRate and contractStart
 * are NOT NULL columns with no default — a guard cannot be stored without them,
 * so offering a switch that says otherwise would be offering a lie. They are
 * reported as always required instead.
 *
 * The rest are optional by deliberate design: a guard is often registered from
 * a paper form before they have produced a phone number or named a next of kin,
 * and refusing the record until then leaves the guard on paper and nowhere
 * else. A deployment that would rather refuse can say so here.
 */

/** Configurable fields, each with the label an error message should use. */
export const CONFIGURABLE_GUARD_FIELDS = {
  phone:                   'Phone number',
  nationalId:              'National ID number',
  idType:                  'ID type',
  gender:                  'Gender',
  district:                'District',
  nextOfKinName:           'Next of kin name',
  nextOfKinPhone:          'Next of kin phone',
  preferredPaymentContact: 'Mobile money number',
  mobileNetwork:           'Mobile network',
  // Has a database default of GUARD, so it is never absent once stored.
  // Requiring it means insisting the rank is chosen rather than fallen into.
  rank:                    'Rank',
} as const;

export type ConfigurableGuardField = keyof typeof CONFIGURABLE_GUARD_FIELDS;

/** Always required — the columns are NOT NULL, so this is not a policy choice. */
export const ALWAYS_REQUIRED_GUARD_FIELDS = [
  'firstName', 'lastName', 'dateOfBirth', 'salaryRate', 'contractStart',
] as const;

export const settingKeyFor = (field: string): string => `guard_field_${field}_required`;

// ── Reading the configuration ──────────────────────────────────────────────────

const CACHE_MS = 30_000;
let cache: Record<ConfigurableGuardField, boolean> | null = null;
let cachedAt = 0;

/** Drops the cached rules. Called when a setting is saved. */
export function clearGuardFieldCache(): void {
  cache = null;
  cachedAt = 0;
}

export type GuardFieldRules = Record<ConfigurableGuardField, boolean>;

const noneRequired = (): GuardFieldRules =>
  Object.fromEntries(
    Object.keys(CONFIGURABLE_GUARD_FIELDS).map((f) => [f, false]),
  ) as GuardFieldRules;

export async function guardFieldRules(): Promise<GuardFieldRules> {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;

  const rules = noneRequired();
  try {
    const rows = await prisma.systemSetting.findMany({
      where:  { group: 'GUARD_FIELDS' },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const field = row.key.replace(/^guard_field_/, '').replace(/_required$/, '');
      if (field in rules) rules[field as ConfigurableGuardField] = row.value === 'true';
    }
  } catch {
    // An unreadable settings table must not stop a guard being registered.
    // Nothing extra is demanded, which is the shipped behaviour.
  }

  cache = rules;
  cachedAt = Date.now();
  return rules;
}

// ── Enforcement ────────────────────────────────────────────────────────────────

/** True for values that count as "not given" on a guard form. */
function missing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/**
 * Refuses a guard that leaves out a field this deployment requires.
 *
 * Enforced here rather than only in the browser: the setting is a rule about
 * the records the business will hold, and a rule only the form applies is one
 * that any other caller can ignore.
 *
 * `partial` is for an update, where a field simply not being in the payload
 * means "leave it alone" rather than "clear it".
 */
export async function assertRequiredGuardFields(
  data: Record<string, unknown>,
  { partial = false }: { partial?: boolean } = {},
): Promise<void> {
  const rules = await guardFieldRules();

  const absent = (Object.keys(CONFIGURABLE_GUARD_FIELDS) as ConfigurableGuardField[])
    .filter((field) => rules[field])
    .filter((field) => (partial ? field in data && missing(data[field]) : missing(data[field])))
    .map((field) => CONFIGURABLE_GUARD_FIELDS[field]);

  if (absent.length > 0) {
    throw new AppError(
      `${absent.join(', ')} ${absent.length === 1 ? 'is' : 'are'} required for a guard. `
      + 'This is set in Settings → Guard Fields.',
      400,
    );
  }
}
