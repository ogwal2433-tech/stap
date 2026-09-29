import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../db/prisma';
import { zoneService } from '../../services/zoneService';
import { DEPLOYABLE_STATUSES } from '@security360/shared';

/**
 * The guard list behind the roster builder.
 *
 * Guards are not zone-scoped — the Guard model has no zoneId — so the same
 * guards are offered whichever zone is open. What varies is the date: a guard
 * already holding a deployment that day is marked rather than dropped, so the
 * builder can show who is taken instead of leaving a gap.
 *
 * Guards whose National ID is still pending used to be left out of the list
 * entirely, which on this database hid 186 of 485 active guards with nothing
 * on screen to say so. They are listed like anyone else now, carrying a flag so the
 * outstanding paperwork is visible without blocking the roster.
 */

let zoneA = '';
let zoneB = '';

beforeAll(async () => {
  const zones = await prisma.zone.findMany({ select: { id: true }, take: 2 });
  zoneA = zones[0]?.id ?? '';
  zoneB = zones[1]?.id ?? zoneA;
});

describe('zoneService.getRosterData — guards', () => {
  it('offers every deployable guard, not a zone-scoped subset', async () => {
    if (!zoneA) return;

    const data = await zoneService.getRosterData(zoneA, '2026-09-25');
    const deployable = await prisma.guard.count({
      where: { employmentStatus: { in: DEPLOYABLE_STATUSES as unknown as string[] } },
    });

    expect(data.guards.length).toBe(deployable);
  });

  it('returns the same guards for a different zone', async () => {
    if (!zoneA || !zoneB || zoneA === zoneB) return;

    const [a, b] = await Promise.all([
      zoneService.getRosterData(zoneA, '2026-09-25'),
      zoneService.getRosterData(zoneB, '2026-09-25'),
    ]);

    // Guards have no zone. Two zones differing here would mean one crept in.
    expect(a.guards.map((g) => g.id).sort()).toEqual(b.guards.map((g) => g.id).sort());
  });

  it('scopes the sites to the zone, which do belong to one', async () => {
    if (!zoneA) return;

    const data = await zoneService.getRosterData(zoneA, '2026-09-25');
    const expected = await prisma.site.count({ where: { zoneId: zoneA, deletedAt: null } });

    expect(data.sites.length).toBe(expected);
  });

  it('marks a guard already deployed that day rather than dropping them', async () => {
    const existing = await prisma.deployment.findFirst({
      select: { guardId: true, date: true },
    });
    if (!existing || !zoneA) return;

    const day = existing.date.toISOString().slice(0, 10);
    const data = await zoneService.getRosterData(zoneA, day);

    const row = data.guards.find((g) => g.id === existing.guardId);
    // Present, and flagged — the builder greys them out instead of hiding them.
    expect(row, 'a deployed guard should still be listed').toBeTruthy();
    expect(row!.alreadyDeployed).toBe(true);
  });

  it('leaves a guard unmarked on a day they hold no deployment', async () => {
    if (!zoneA) return;

    const data = await zoneService.getRosterData(zoneA, '2026-09-25');
    const deployedThatDay = await prisma.deployment.count({
      where: { date: new Date('2026-09-25T00:00:00.000Z') },
    });
    if (deployedThatDay > 0) return; // pick a quiet day only

    expect(data.guards.every((g) => !g.alreadyDeployed)).toBe(true);
  });

  it('lists a guard with a pending National ID, flagged rather than hidden', async () => {
    if (!zoneA) return;

    const pending = await prisma.guard.count({
      where: {
        employmentStatus: { in: DEPLOYABLE_STATUSES as unknown as string[] },
        isIncompleteNID:  true,
      },
    });
    if (pending === 0) return;

    const data = await zoneService.getRosterData(zoneA, '2026-09-25');
    const flagged = data.guards.filter((g) => g.pendingNationalId);

    expect(flagged.length).toBe(pending);
  });

  it('never offers a guard whose status makes them undeployable', async () => {
    if (!zoneA) return;

    const data = await zoneService.getRosterData(zoneA, '2026-09-25');
    const ids = data.guards.map((g) => g.id);
    if (ids.length === 0) return;

    const undeployable = await prisma.guard.count({
      where: {
        id:               { in: ids },
        employmentStatus: { notIn: DEPLOYABLE_STATUSES as unknown as string[] },
      },
    });

    expect(undeployable).toBe(0);
  });
});
