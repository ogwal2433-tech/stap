import prisma from '../db/prisma';

export interface PostedSite {
  siteId:   string;
  siteName: string;
}

/**
 * Where each guard is posted on each requested date — the one site allowed to
 * roster them there.
 *
 * Transfers are checked first: `createRoster` used to write a history row per
 * guard per day, so `DeploymentHistory` carries duplicate open rows and "latest
 * startDate" alone can name a site the guard has already been transferred away
 * from. The latest transfer on or before the date wins; guards never
 * transferred (or transferred after the date) fall back to their most recent
 * covering history row. Null means no posting on file for that date — the
 * guard is free to be rostered anywhere.
 *
 * Returns a map keyed by guardId whose value aligns with the (de-duplicated)
 * dates array passed in.
 */
export async function resolvePostedSites(
  guardIds: string[],
  dates:    Date[],
): Promise<Map<string, (PostedSite | null)[]>> {
  const out      = new Map<string, (PostedSite | null)[]>();
  const ids      = [...new Set(guardIds)];
  const uniqDates = [...new Map(dates.map((d) => [d.getTime(), d])).values()];

  ids.forEach((id) => out.set(id, uniqDates.map(() => null)));
  if (ids.length === 0 || uniqDates.length === 0) return out;

  const minDate = new Date(Math.min(...uniqDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...uniqDates.map((d) => d.getTime())));

  const [transfers, history] = await Promise.all([
    prisma.guardTransfer.findMany({
      where:   { guardId: { in: ids }, transferDate: { lte: maxDate } },
      orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
      include: { toSite: { select: { id: true, siteName: true } } },
    }),
    prisma.deploymentHistory.findMany({
      where: {
        guardId:   { in: ids },
        startDate: { lte: maxDate },
        OR:        [{ endDate: null }, { endDate: { gt: minDate } }],
      },
      orderBy: { startDate: 'desc' },
      include: { site: { select: { id: true, siteName: true } } },
    }),
  ]);

  const transfersByGuard = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const list = transfersByGuard.get(t.guardId) ?? [];
    list.push(t);
    transfersByGuard.set(t.guardId, list);
  }
  const historyByGuard = new Map<string, typeof history>();
  for (const h of history) {
    const list = historyByGuard.get(h.guardId) ?? [];
    list.push(h);
    historyByGuard.set(h.guardId, list);
  }

  for (const id of ids) {
    const perDate   = out.get(id)!;
    const myXfers   = transfersByGuard.get(id) ?? [];
    const myHistory = historyByGuard.get(id) ?? [];
    uniqDates.forEach((d, i) => {
      // Latest transfer on or before the date (both sides are day-midnight
      // UTC, so a same-day transfer already applies to that day).
      const xfer = myXfers.find((t) => t.transferDate.getTime() <= d.getTime());
      if (xfer) {
        perDate[i] = { siteId: xfer.toSite.id, siteName: xfer.toSite.siteName };
        return;
      }
      const row = myHistory.find(
        (h) => h.startDate.getTime() <= d.getTime()
          && (!h.endDate || h.endDate.getTime() > d.getTime()),
      );
      if (row) perDate[i] = { siteId: row.site.id, siteName: row.site.siteName };
    });
  }

  return out;
}
