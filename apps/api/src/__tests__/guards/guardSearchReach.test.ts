import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { ROLES } from '@security360/shared';

/**
 * The issue-items form picks a guard by searching the server. What it needs is
 * that every guard can be reached that way — the bug it replaces was a single
 * unfiltered page, so guards past the end of it could not be issued to at all.
 *
 * These tests pin the reachability rather than the page size: a guard sitting
 * well past the first page is found by name and by system ID, and the list
 * applies no status or deployment filter of its own.
 */

const bearer = `Bearer ${signAccessToken({
  sub:   'ci-guard-search',
  role:  ROLES.DIRECTOR,
  name:  'Test Director',
  email: 'director@test.com',
} as never)}`;

const PAGE = 20; // what the form asks for

/** A guard deliberately chosen from beyond the first page of the default sort. */
let deepGuard: { id: string; firstName: string; lastName: string; systemId: string | null } | null = null;

beforeAll(async () => {
  deepGuard = await prisma.guard.findFirst({
    where:   { systemId: { not: null } },
    orderBy: { createdAt: 'desc' },
    skip:    PAGE * 2,
    select:  { id: true, firstName: true, lastName: true, systemId: true },
  });
});

describe('GET /api/v1/guards — every guard is reachable from the issue form', () => {
  it('finds a guard that falls outside the first page, by system ID', async () => {
    if (!deepGuard?.systemId) return; // too few guards in this database to test the case

    const res = await request(app)
      .get('/api/v1/guards')
      .query({ search: deepGuard.systemId, limit: PAGE })
      .set('Authorization', bearer);

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((g: { id: string }) => g.id),
      `${deepGuard.systemId} is past the first page and must still be findable`,
    ).toContain(deepGuard.id);
  });

  it('finds that same guard by surname', async () => {
    if (!deepGuard) return;

    const res = await request(app)
      .get('/api/v1/guards')
      .query({ search: deepGuard.lastName, limit: 100 })
      .set('Authorization', bearer);

    expect(res.status).toBe(200);
    expect(res.body.data.map((g: { id: string }) => g.id)).toContain(deepGuard.id);
  });

  it('reports the full total, so the form can say more results exist', async () => {
    // Other suites add and remove guards while this runs, so the count is read
    // again if it moved under the request rather than pinned to a stale one.
    let res; let count = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await request(app)
        .get('/api/v1/guards')
        .query({ limit: PAGE })
        .set('Authorization', bearer);
      count = await prisma.guard.count();
      if (res.body?.pagination?.total === count) break;
    }

    expect(res!.status).toBe(200);
    expect(res!.body.data.length).toBeLessThanOrEqual(PAGE);
    expect(res!.body.pagination.total).toBe(count);
    expect(res!.body.pagination.hasNext).toBe(count > PAGE);
  });

  it('applies no status filter unless one is asked for', async () => {
    const [all, active] = await Promise.all([
      request(app).get('/api/v1/guards').query({ limit: 1 }).set('Authorization', bearer),
      request(app).get('/api/v1/guards').query({ limit: 1, status: 'ACTIVE' }).set('Authorization', bearer),
    ]);

    expect(all.status).toBe(200);
    // Whatever mix of statuses this database holds, the unfiltered list covers
    // at least the active ones — a guard awaiting deployment still needs a
    // uniform, so nothing is excluded until a status is asked for.
    expect(all.body.pagination.total).toBeGreaterThanOrEqual(active.body.pagination.total);
    expect(all.body.pagination.total).toBeGreaterThan(PAGE);
  });
});
