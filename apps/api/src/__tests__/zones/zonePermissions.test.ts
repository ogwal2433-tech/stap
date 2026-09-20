import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * Zones are reached by permission, not by role name.
 *
 * The sidebar offers Zones to whoever holds roster.view, but the API only let a
 * fixed list of roles through — so Control Room, which holds roster.view, saw
 * the page and an empty list, and a role granted roster.view in the Roles &
 * Permissions page got the same. Writing stays with sites.edit: assigning a
 * site to a zone is a site update, and that is who could already do it.
 *
 * A throwaway role stands in for "any role an administrator grants", so no real
 * role is touched.
 */

const ROLE = 'ZZ_ZONE_PERMS';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const token = bearer(`ci-${ROLE}`, ROLE);
const controlRoom = bearer('ci-control-room', 'CONTROL_ROOM');

const permIds: Record<string, string> = {};

async function grant(key: string) {
  await prisma.rolePermission.create({ data: { role: ROLE, permissionId: permIds[key] } });
  clearPermissionCache(ROLE);
}

async function revokeAll() {
  await prisma.rolePermission.deleteMany({ where: { role: ROLE } });
  clearPermissionCache(ROLE);
}

beforeAll(async () => {
  for (const key of ['roster.view', 'sites.edit']) {
    permIds[key] = (
      await prisma.permission.findUniqueOrThrow({ where: { key }, select: { id: true } })
    ).id;
  }

  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Zone Permission Test', isSystem: false, isActive: true },
  });
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
});

describe('zone access follows the permission, not the role', () => {
  it('refuses a role holding nothing', async () => {
    await revokeAll();
    const res = await request(app).get('/api/v1/zones').set('Authorization', token);
    expect(res.status).toBe(403);
  });

  it('roster.view lists the zones — the grant the sidebar already requires', async () => {
    await revokeAll();
    await grant('roster.view');

    const res = await request(app).get('/api/v1/zones').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('shows Control Room the zones its sidebar offers', async () => {
    // CONTROL_ROOM holds roster.view, so the nav shows Zones. The API used to
    // refuse it by role, leaving the page loaded and the list empty.
    const res = await request(app).get('/api/v1/zones').set('Authorization', controlRoom);
    expect(res.status).toBe(200);
  });

  it('roster.view alone does not allow creating or editing a zone', async () => {
    await revokeAll();
    await grant('roster.view');

    const created = await request(app)
      .post('/api/v1/zones')
      .set('Authorization', token)
      .send({ name: 'ZZ Should Not Exist' });
    expect(created.status).toBe(403);

    const zone = await prisma.zone.findFirst({ select: { id: true } });
    if (zone) {
      const patched = await request(app)
        .patch(`/api/v1/zones/${zone.id}`)
        .set('Authorization', token)
        .send({ name: 'ZZ Should Not Apply' });
      expect(patched.status).toBe(403);
    }
  });

  it('sites.edit allows zone management — the same people as before', async () => {
    await revokeAll();
    await grant('roster.view');
    await grant('sites.edit');

    const created = await request(app)
      .post('/api/v1/zones')
      .set('Authorization', token)
      .send({ name: 'ZZ Zone Perms Test' });
    expect(created.status).toBe(201);

    const id = created.body.data.id;
    try {
      const patched = await request(app)
        .patch(`/api/v1/zones/${id}`)
        .set('Authorization', token)
        .send({ name: 'ZZ Zone Perms Renamed' });
      expect(patched.status).toBe(200);
      expect(patched.body.data.name).toBe('ZZ Zone Perms Renamed');
    } finally {
      await prisma.zone.deleteMany({ where: { id } });
    }
  });

  it('a disabled role holds nothing, whatever it was granted', async () => {
    await revokeAll();
    await grant('roster.view');
    await prisma.role.update({ where: { name: ROLE }, data: { isActive: false } });
    clearPermissionCache(ROLE);

    const res = await request(app).get('/api/v1/zones').set('Authorization', token);
    expect(res.status).toBe(403);

    await prisma.role.update({ where: { name: ROLE }, data: { isActive: true } });
    clearPermissionCache(ROLE);
  });
});
