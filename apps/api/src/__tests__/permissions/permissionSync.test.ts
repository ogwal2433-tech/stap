import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';
import { publishPermissionChange, stopPermissionCacheSync } from '../../lib/permissionCacheBus';

/**
 * A permission granted in the UI has to work on the caller's next request.
 *
 * The chain: the grant reaches RolePermission, the deciding middleware reads it
 * through the role, and every API instance drops its cached copy. The last step
 * is the one that used to fail — the API runs as several PM2 instances and only
 * the one that served the grant cleared itself, so whether a grant appeared to
 * work depended on which instance answered next.
 *
 * A throwaway role is used so no real role's permissions are touched.
 */

const ROLE = 'ZZ_PERM_SYNC';
const GUARDED = '/api/v1/clients';   // needs clients.view

let director = '';
let roleToken = '';
let clientsView = '';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const settle = () => new Promise((r) => setTimeout(r, 300));

beforeAll(async () => {
  const d = await prisma.user.findFirst({ where: { role: 'DIRECTOR', status: 'ACTIVE' }, select: { id: true } });
  if (!d) throw new Error('These tests need a seeded DIRECTOR account.');
  director  = bearer(d.id, 'DIRECTOR');
  roleToken = bearer(`ci-${ROLE}`, ROLE);

  clientsView = (await prisma.permission.findUniqueOrThrow({ where: { key: 'clients.view' }, select: { id: true } })).id;

  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Permission Sync Test', isSystem: false, isActive: true },
  });
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  // Grants go with the role: RolePermission cascades on delete.
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
  await stopPermissionCacheSync();
});

describe('a grant takes effect on the next request', () => {
  it('starts with nothing', async () => {
    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(403);
  });

  it('works immediately after the grant, with no wait', async () => {
    const grant = await request(app).post(`/api/v1/permissions/roles/${ROLE}/grant`)
      .set('Authorization', director).send({ permissionKey: 'clients.view' });
    expect(grant.status, JSON.stringify(grant.body)).toBe(201);

    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(200);
  });

  it('reports it on /permissions/me', async () => {
    const me = await request(app).get('/api/v1/permissions/me').set('Authorization', roleToken);
    expect(me.body.data.permissions).toContain('clients.view');
  });

  it('stops immediately after the revoke', async () => {
    const revoke = await request(app).delete(`/api/v1/permissions/roles/${ROLE}/revoke/clients.view`)
      .set('Authorization', director);
    expect(revoke.status).toBe(200);

    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(403);
  });

  it('a bulk replace lands the same way', async () => {
    const put = await request(app).put(`/api/v1/permissions/roles/${ROLE}`)
      .set('Authorization', director).send({ permissionKeys: ['clients.view'], reason: 'test' });
    expect(put.status).toBe(200);
    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(200);
  });
});

describe('a change made by another instance', () => {
  it('is picked up here as soon as it is broadcast', async () => {
    // Warm this process's cache, then change the grants behind its back —
    // exactly what a second PM2 instance, or a direct SQL grant, does.
    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(200);
    await prisma.rolePermission.deleteMany({ where: { role: ROLE, permissionId: clientsView } });

    // Still allowed: this process is serving its cached copy. That is the bug.
    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(200);

    publishPermissionChange(ROLE);
    await settle();

    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(403);
  });

  it('the cache refresh endpoint does the same for a change made outside the app', async () => {
    await prisma.rolePermission.create({ data: { role: ROLE, permissionId: clientsView } });
    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(403); // stale

    const refresh = await request(app).post('/api/v1/permissions/cache/refresh')
      .set('Authorization', director).send({ role: ROLE });
    expect(refresh.status, JSON.stringify(refresh.body)).toBe(200);
    await settle();

    expect((await request(app).get(GUARDED).set('Authorization', roleToken)).status).toBe(200);
  });

  it('refuses a role nobody manages', async () => {
    const res = await request(app).post('/api/v1/permissions/cache/refresh')
      .set('Authorization', director).send({ role: 'NOT_A_ROLE' });
    expect(res.status).toBe(400);
  });
});

describe('what the API reports matches the database', () => {
  it('for every role — and a disabled role holds nothing, by design', async () => {
    const roles = await prisma.role.findMany({
      select: { name: true, isActive: true, _count: { select: { permissions: true } } },
    });

    for (const role of roles) {
      // Re-read both sides together, and again if they disagree: another test
      // file may be granting and revoking on a shared role while this runs.
      let reported = -1;
      let stored = -1;
      for (let attempt = 0; attempt < 3; attempt++) {
        const me = await request(app).get('/api/v1/permissions/me')
          .set('Authorization', bearer(`ci-${role.name}`, role.name));
        expect(me.status, role.name).toBe(200);
        reported = me.body.data.permissions.length;
        stored = await prisma.rolePermission.count({ where: { role: role.name } });
        if (!role.isActive || reported === stored) break;
        await settle();
      }

      if (role.isActive) {
        expect(reported, `${role.name} reports a different count from the database`).toBe(stored);
      } else {
        // Its grants are kept so enabling it restores them, but it holds none.
        expect(reported, `${role.name} is disabled and should hold nothing`).toBe(0);
      }
    }
  });
});
