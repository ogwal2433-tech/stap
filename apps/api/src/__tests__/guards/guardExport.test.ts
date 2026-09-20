import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * GET /guards/export backs the "Export to Excel" button: every guard in one
 * response, with where each is deployed.
 *
 * Two things matter beyond the happy path. It must not paginate — the export
 * exists precisely to escape the page — and it must not carry the bank account
 * number, which is kept from everyone but the Director and Assistant Manager on
 * the profile and would otherwise leak to anyone holding guards.view.
 */

const ROLE = 'ZZ_GUARD_EXPORT';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const token = bearer(`ci-${ROLE}`, ROLE);
let viewPermissionId = '';

beforeAll(async () => {
  viewPermissionId = (
    await prisma.permission.findUniqueOrThrow({ where: { key: 'guards.view' }, select: { id: true } })
  ).id;

  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Guard Export Test', isSystem: false, isActive: true },
  });
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
});

async function grantView() {
  await prisma.rolePermission.create({ data: { role: ROLE, permissionId: viewPermissionId } });
  clearPermissionCache(ROLE);
}

async function revokeAll() {
  await prisma.rolePermission.deleteMany({ where: { role: ROLE } });
  clearPermissionCache(ROLE);
}

describe('GET /api/v1/guards/export', () => {
  it('refuses a role without guards.view', async () => {
    await revokeAll();
    const res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
    expect(res.status).toBe(403);
  });

  it('returns every guard, not one page of them', async () => {
    await revokeAll();
    await grantView();

    // Other suites add guards while this runs, so the roll is counted again if
    // it moved under the request rather than pinned to a stale number.
    let res; let count = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
      count = await prisma.guard.count();
      if (res.body?.data?.guards?.length === count) break;
    }

    expect(res!.status).toBe(200);
    expect(res!.body.data.totalCount).toBe(res!.body.data.guards.length);
    expect(res!.body.data.guards.length).toBe(count);
    // And well past any default page size, whatever the count settles at.
    expect(res!.body.data.guards.length).toBeGreaterThan(100);
  });

  it('never includes the bank account number', async () => {
    await revokeAll();
    await grantView();

    const res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
    expect(res.status).toBe(200);

    for (const row of res.body.data.guards) {
      expect(row).not.toHaveProperty('accountNumber');
      expect(row).not.toHaveProperty('bankName');
    }
  });

  it('carries the fields the spreadsheet needs', async () => {
    await revokeAll();
    await grantView();

    const res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
    const row = res.body.data.guards[0];
    if (!row) return;

    for (const key of [
      'systemId', 'firstName', 'lastName', 'fullName', 'nationalId', 'phone',
      'rank', 'employmentStatus', 'salaryRate', 'currentSiteName', 'clientName',
      'zoneName', 'nextOfKinName', 'contractStart',
    ]) {
      expect(row, key).toHaveProperty(key);
    }
    expect(typeof res.body.data.exportedAt).toBe('string');
  });

  it('names the site a guard is deployed to right now', async () => {
    await revokeAll();
    await grantView();

    // An open deployment (no end date) is what says where a guard is.
    const open = await prisma.deploymentHistory.findFirst({
      where:  { endDate: null },
      select: { guardId: true, site: { select: { siteName: true } } },
    });
    if (!open) return;

    const res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
    const guard = await prisma.guard.findUnique({
      where:  { id: open.guardId },
      select: { systemId: true },
    });

    const row = res.body.data.guards.find((g: { systemId: string }) => g.systemId === guard?.systemId);
    if (row) expect(row.currentSiteName).toBe(open.site.siteName);
  });

  it('leaves out guards that have been deleted', async () => {
    await revokeAll();
    await grantView();

    // Read past the soft-delete extension: the export must equal the rows that
    // are actually live, not every row in the table. Re-read on drift, as above.
    let res; let live = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
      const [row] = await prisma.$queryRaw<{ live: bigint }[]>`
        SELECT COUNT(*) AS live FROM "Guard" WHERE "deletedAt" IS NULL
      `;
      live = Number(row.live);
      if (res.body?.data?.guards?.length === live) break;
    }

    expect(res!.body.data.guards.length).toBe(live);
  });

  it('is not mistaken for a guard id', async () => {
    await revokeAll();
    await grantView();

    // /export must be declared before /:id, or it would be looked up as one.
    const res = await request(app).get('/api/v1/guards/export').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.guards)).toBe(true);
  });
});
