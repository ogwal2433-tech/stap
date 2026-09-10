import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';

/**
 * Roles as rows, end to end against the real database like the other route
 * tests. Everything created here is named ZZ_TEST_* (roles) or zz-role-test*
 * (users) and removed afterwards. No system role or real grant is changed.
 */

const BASE  = '/api/v1/roles';
const ZONE  = 'ZZ_TEST_ZONE_MANAGER';
const EMAIL = 'zz-role-test';

const tokenFor = (role: string, sub = `ci-${role}`) =>
  `Bearer ${signAccessToken({
    sub, role, name: `CI ${role}`, email: `${sub}@test.local`, clientId: null,
  } as never)}`;

let director = '';
const zone  = tokenFor(ZONE);
const guard = tokenFor('GUARD');

beforeAll(async () => {
  const d = await prisma.user.findFirst({ where: { role: 'DIRECTOR', status: 'ACTIVE' }, select: { id: true } });
  if (!d) throw new Error('These tests need a seeded DIRECTOR account.');
  director = tokenFor('DIRECTOR', d.id);
});

afterAll(async () => {
  // Users first: a role cannot be deleted while someone holds it.
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: 'ZZ_TEST' } } });
});

describe('reading roles', () => {
  it('401 without a token', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('403 for a role that manages neither roles nor staff', async () => {
    expect((await request(app).get(BASE).set('Authorization', guard)).status).toBe(403);
  });

  it('lists every system role, with MARKETING kept but disabled', async () => {
    const res = await request(app).get(BASE).set('Authorization', director);
    expect(res.status).toBe(200);
    const byName = new Map<string, { isSystem: boolean; isActive: boolean; userCount: number }>(
      res.body.data.map((r: { name: string }) => [r.name, r]),
    );
    for (const n of [
      'DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR', 'OPERATIONS_SUPERVISOR', 'FIELD_SUPERVISOR',
      'TRAINER', 'ACCOUNTS_OFFICER', 'CONTROL_ROOM', 'MARKETING', 'MARKETING_HEAD', 'SALES', 'HR',
      'GUARD', 'CLIENT',
    ]) {
      expect(byName.get(n)?.isSystem, n).toBe(true);
    }
    expect(byName.get('MARKETING')?.isActive).toBe(false);
    expect(byName.get('DIRECTOR')?.userCount).toBeGreaterThanOrEqual(1);
  });

  it('assignable leaves out portal and disabled roles', async () => {
    const res = await request(app).get(`${BASE}?assignable=true`).set('Authorization', director);
    const names: string[] = res.body.data.map((r: { name: string }) => r.name);
    expect(names).toContain('HR');
    for (const n of ['GUARD', 'CLIENT', 'MARKETING']) expect(names).not.toContain(n);
  });
});

describe('creating a role', () => {
  it('derives the system name from the label, and starts with nothing', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', director)
      .send({ label: 'Zz Test Zone Manager', description: 'Runs one zone', colour: '#0F7B6C' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: ZONE, label: 'Zz Test Zone Manager', isSystem: false, isActive: true,
      permissionCount: 0, userCount: 0,
    });
  });

  it('refuses the same name twice', async () => {
    const res = await request(app).post(BASE).set('Authorization', director).send({ label: 'Zz Test Zone Manager' });
    expect(res.status).toBe(409);
  });

  it.each([
    ['a one-letter label',               { label: 'Z' }],
    ['a name that starts with a digit',  { label: 'Zz Test Digits', name: '9 lives' }],
    ['a colour that is not hex',         { label: 'Zz Test Colour', colour: 'green' }],
  ])('refuses %s', async (_label, body) => {
    const res = await request(app).post(BASE).set('Authorization', director).send(body);
    expect(res.status).toBe(400);
  });

  it('is closed to a role without roles.manage', async () => {
    const res = await request(app).post(BASE).set('Authorization', zone).send({ label: 'Zz Test Sneaky' });
    expect(res.status).toBe(403);
  });

  it('appears in the permission matrix at once, and is editable', async () => {
    const res = await request(app).get('/api/v1/permissions/roles').set('Authorization', director);
    const row = res.body.data.find((r: { role: string }) => r.role === ZONE);
    expect(row).toMatchObject({ editable: true, count: 0, isSystem: false, isActive: true });
  });
});

describe('what a custom role can reach', () => {
  it('holds nothing until granted', async () => {
    const res = await request(app).get('/api/v1/permissions/me').set('Authorization', zone);
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toEqual([]);
    expect(res.body.data.roleLabel).toBe('Zz Test Zone Manager');
  });

  it('reaches a permission-gated route once granted', async () => {
    const g = await request(app)
      .post(`/api/v1/permissions/roles/${ZONE}/grant`)
      .set('Authorization', director)
      .send({ permissionKey: 'guards.view' });
    expect(g.status).toBe(201);
    expect((await request(app).get('/api/v1/guards/id-stats').set('Authorization', zone)).status).toBe(200);
  });

  it('is still refused by a route gated on role names — the known limit', async () => {
    // GET /guards is requireRole(...INTERNAL_ROLES, HR). A custom role cannot be
    // in that list, so it is refused even holding guards.view. Moving those
    // gates to permissions is separate work; this pins today's behaviour so
    // the day it changes is visible rather than silent.
    expect((await request(app).get('/api/v1/guards').set('Authorization', zone)).status).toBe(403);
  });
});

describe('editing a role', () => {
  it('relabels and recolours', async () => {
    const res = await request(app)
      .patch(`${BASE}/${ZONE}`)
      .set('Authorization', director)
      .send({ label: 'Zz Test Zone Lead', colour: '#1B3A6B' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: ZONE, label: 'Zz Test Zone Lead', colour: '#1B3A6B' });
  });

  it('refuses a new system name — it is fixed once created', async () => {
    const res = await request(app).patch(`${BASE}/${ZONE}`).set('Authorization', director).send({ name: 'ZZ_TEST_OTHER' });
    expect(res.status).toBe(400);
  });

  it('refuses an empty change', async () => {
    expect((await request(app).patch(`${BASE}/${ZONE}`).set('Authorization', director).send({})).status).toBe(400);
  });

  it('disabling it takes its permissions away at once', async () => {
    const res = await request(app).patch(`${BASE}/${ZONE}`).set('Authorization', director).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/v1/guards/id-stats').set('Authorization', zone)).status).toBe(403);
    const me = await request(app).get('/api/v1/permissions/me').set('Authorization', zone);
    expect(me.body.data.permissions).toEqual([]);
    expect(me.body.data.roleActive).toBe(false);
  });

  it('keeps its grants while disabled, so enabling restores them', async () => {
    await request(app).patch(`${BASE}/${ZONE}`).set('Authorization', director).send({ isActive: true });
    expect((await request(app).get('/api/v1/guards/id-stats').set('Authorization', zone)).status).toBe(200);
  });

  it('refuses to disable DIRECTOR', async () => {
    const res = await request(app).patch(`${BASE}/DIRECTOR`).set('Authorization', director).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('refuses to let someone disable the role they are signed in with', async () => {
    await request(app)
      .post(`/api/v1/permissions/roles/${ZONE}/grant`)
      .set('Authorization', director)
      .send({ permissionKey: 'roles.manage' });
    const res = await request(app).patch(`${BASE}/${ZONE}`).set('Authorization', zone).send({ isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signed in with/i);
  });
});

describe('deleting a role', () => {
  it.each(['DIRECTOR', 'GUARD'])('refuses system role %s', async (name) => {
    expect((await request(app).delete(`${BASE}/${name}`).set('Authorization', director)).status).toBe(400);
  });

  it('refuses while someone holds it', async () => {
    await prisma.user.create({
      data: {
        name: 'ZZ Role Test', email: `${EMAIL}-holder@test.local`, passwordHash: 'x',
        role: ZONE, twoFactorBackupCodes: [],
      },
    });
    const res = await request(app).delete(`${BASE}/${ZONE}`).set('Authorization', director);
    expect(res.status).toBe(409);
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } });
  });

  it('deletes it, taking its grants with it', async () => {
    const res = await request(app).delete(`${BASE}/${ZONE}`).set('Authorization', director);
    expect(res.status).toBe(200);
    expect(res.body.data.grantsRemoved).toBeGreaterThanOrEqual(2);
    expect(await prisma.rolePermission.count({ where: { role: ZONE } })).toBe(0);
  });

  it('reports it gone', async () => {
    expect((await request(app).delete(`${BASE}/${ZONE}`).set('Authorization', director)).status).toBe(404);
  });
});

describe('the foreign key', () => {
  it('refuses a user whose role does not exist', async () => {
    await expect(
      prisma.user.create({
        data: {
          name: 'ZZ', email: `${EMAIL}-orphan@test.local`, passwordHash: 'x',
          role: 'ZZ_TEST_NO_SUCH_ROLE', twoFactorBackupCodes: [],
        },
      }),
    ).rejects.toThrow();
  });
});
