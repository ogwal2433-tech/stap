/**
 * Date parsing that cannot hand Prisma an invalid Date.
 *
 * `new Date(undefined)`, `new Date('')` and `new Date('garbage')` all produce
 * an Invalid Date, which Prisma rejects at query time with a DATABASE_ERROR
 * rather than ignoring. Anything built from user input or stored strings goes
 * through here first.
 */

/** Parses a date, returning null for anything that is not a usable date. */
export function safeDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A Prisma range filter built only from the bounds that actually parsed.
 *
 * Returns undefined when neither bound is usable, so the caller can spread it
 * away and leave the field out of `where` entirely — an unreadable filter
 * should widen the query, never fail it.
 */
export function dateRangeFilter(
  from?: string | Date | null,
  to?:   string | Date | null,
  endOfDay = false,
): { gte?: Date; lte?: Date } | undefined {
  const gte = safeDate(from);
  let   lte = safeDate(to);

  // A picker showing "to 17 Aug" means the whole of the 17th.
  if (lte && endOfDay) {
    lte = new Date(lte);
    lte.setHours(23, 59, 59, 999);
  }

  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/**
 * Half-open range covering one calendar month, or null if the parts are not
 * real numbers. `month` is 0-indexed, matching Date.
 */
export function monthFilter(
  year?:  number | null,
  month?: number | null,
): { gte: Date; lt: Date } | null {
  if (year == null || month == null) return null;
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  const gte = new Date(year, month, 1);
  const lt  = new Date(year, month + 1, 1);
  return Number.isNaN(gte.getTime()) || Number.isNaN(lt.getTime()) ? null : { gte, lt };
}
