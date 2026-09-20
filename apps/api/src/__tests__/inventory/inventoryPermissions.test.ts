import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * Inventory access is decided by permission, not by role name.
 *
 * Every route here used to carry a role list, so a role granted inventory.view
 * in the Roles & Permissions page still got a 403 — the page offered access the
 * API refused. These drive a throwaway role through the four inventory grants
 * and check each one opens exactly what it names and nothing more.
 *
 * The role is created here and deleted afterwards, so no real role is touched.
 */

const ROLE = 'ZZ_INVENTORY_PERMS';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const token = bearer(`ci-${ROLE}`, ROLE);

const permIds: Record<string, string> = {};

/** Grants one permission to the throwaway role and makes it effective now. */
async function grant(key: string) {
  await prisma.rolePermission.create({ data: { role: ROLE, permissionId: permIds[key] } });
  clearPermissionCache(ROLE);
}

async function revokeAll() {
  await prisma.rolePermission.deleteMany({ where: { role: ROLE } });
  clearPermissionCache(ROLE);
}

beforeAll(async () => {
  for (const key of ['inventory.view', 'inventory.issue', 'inventory.return', 'inventory.edit']) {
    permIds[key] = (
      await prisma.permission.findUniqueOrThrow({ where: { key }, select: { id: true } })
    ).id;
  }

  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Inventory Permission Test', isSystem: false, isActive: true },
  });
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  // Grants cascade with the role.
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
});

describe('inventory access follows the permission, not the role', () => {
  it('refuses a role holding nothing', async () => {
    await revokeAll();

    for (const path of ['/api/v1/inventory/items', '/api/v1/inventory/transactions', '/api/v1/inventory/outstanding']) {
      const res = await request(app).get(path).set('Authorization', token);
      expect(res.status, path).toBe(403);
    }
  });

  it('inventory.view opens the catalogue, ledger and outstanding list', async () => {
    await revokeAll();
    await grant('inventory.view');

    for (const path of ['/api/v1/inventory/items', '/api/v1/inventory/transactions', '/api/v1/inventory/outstanding']) {
      const res = await request(app).get(path).set('Authorization', token);
      expect(res.status, path).toBe(200);
    }
  });

  it('inventory.view alone does not allow issuing, returning or editing', async () => {
    await revokeAll();
    await grant('inventory.view');

    const issue = await request(app)
      .post('/api/v1/inventory/items/issue')
      .set('Authorization', token)
      .send({});
    expect(issue.status).toBe(403);

    const ret = await request(app)
      .post('/api/v1/inventory/items/return')
      .set('Authorization', token)
      .send({});
    expect(ret.status).toBe(403);

    const create = await request(app)
      .post('/api/v1/inventory/items')
      .set('Authorization', token)
      .send({});
    expect(create.status).toBe(403);
  });

  it('inventory.issue opens issuing without opening returns', async () => {
    await revokeAll();
    await grant('inventory.issue');

    // An empty body is rejected by validation, not by the permission layer —
    // which is the point: it got past the guard.
    const issue = await request(app)
      .post('/api/v1/inventory/items/issue')
      .set('Authorization', token)
      .send({});
    expect(issue.status).not.toBe(403);
    expect(issue.status).toBe(400);

    const ret = await request(app)
      .post('/api/v1/inventory/items/return')
      .set('Authorization', token)
      .send({});
    expect(ret.status).toBe(403);
  });

  it('inventory.return opens returns without opening issuing', async () => {
    await revokeAll();
    await grant('inventory.return');

    const ret = await request(app)
      .post('/api/v1/inventory/items/return')
      .set('Authorization', token)
      .send({});
    expect(ret.status).toBe(400);

    const issue = await request(app)
      .post('/api/v1/inventory/items/issue')
      .set('Authorization', token)
      .send({});
    expect(issue.status).toBe(403);
  });

  it('inventory.edit opens the catalogue and stock corrections', async () => {
    await revokeAll();
    await grant('inventory.edit');

    const create = await request(app)
      .post('/api/v1/inventory/items')
      .set('Authorization', token)
      .send({});
    expect(create.status).toBe(400);

    const adjust = await request(app)
      .post('/api/v1/inventory/items/adjust-stock')
      .set('Authorization', token)
      .send({});
    expect(adjust.status).toBe(400);
  });

  it("a guard's issued items follow inventory.view", async () => {
    const guard = await prisma.guard.findFirst({ select: { id: true } });
    if (!guard) return;
    const path = `/api/v1/inventory/guards/${guard.id}/items`;

    await revokeAll();
    expect((await request(app).get(path).set('Authorization', token)).status).toBe(403);

    await grant('inventory.view');
    expect((await request(app).get(path).set('Authorization', token)).status).toBe(200);
  });

  it('still lets a guard read their own issued items, holding no permission', async () => {
    const guard = await prisma.guard.findFirst({
      where:  { userId: { not: null } },
      select: { id: true, userId: true },
    });
    if (!guard?.userId) return;

    const guardToken = bearer(guard.userId, 'GUARD');

    const own = await request(app)
      .get(`/api/v1/inventory/guards/${guard.id}/items`)
      .set('Authorization', guardToken);
    expect(own.status).toBe(200);

    // And not somebody else's.
    const other = await prisma.guard.findFirst({ where: { id: { not: guard.id } }, select: { id: true } });
    if (other) {
      const res = await request(app)
        .get(`/api/v1/inventory/guards/${other.id}/items`)
        .set('Authorization', guardToken);
      expect(res.status).toBe(403);
    }
  });

  it('a disabled role holds nothing, whatever it was granted', async () => {
    await revokeAll();
    await grant('inventory.view');
    await prisma.role.update({ where: { name: ROLE }, data: { isActive: false } });
    clearPermissionCache(ROLE);

    const res = await request(app).get('/api/v1/inventory/items').set('Authorization', token);
    expect(res.status).toBe(403);

    await prisma.role.update({ where: { name: ROLE }, data: { isActive: true } });
    clearPermissionCache(ROLE);
  });
});
