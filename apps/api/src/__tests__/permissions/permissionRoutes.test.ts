import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';

/**
 * The permission router had no route tests at all — including the guard that
 * keeps DIRECTOR immutable, the one thing standing between an administrator and
 * locking permission management out of the system for good.
 *
 * Runs against the real database, like the other route tests. Written so that
 * even a broken guard could not do damage: the DIRECTOR checks re-send the set
 * it already holds, or a key it already has, so a failure would rewrite what is
 * there rather than strip it. There is no revoke-on-DIRECTOR test for exactly
 * that reason — no version of it is harmless if the guard has failed.
 */

const BASE   = '/api/v1/permissions';
const PREFIX = 'zz-route-test';

let directorAuth = '';

const fieldAuth = `Bearer ${signAccessToken({
  sub: 'ci-FIELD_SUPERVISOR', role: 'FIELD_SUPERVISOR',
  name: 'CI Field', email: 'field@test.com', clientId: null,
} as never)}`;

beforeAll(async () => {
  // A real account: a preset records who made it through a foreign key, so an
  // invented id would fail the insert rather than the assertion.
  const director = await prisma.user.findFirst({
    where:  { role: 'DIRECTOR', status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
  });
  if (!director) throw new Error('These tests need a seeded DIRECTOR account.');
  directorAuth = `Bearer ${signAccessToken({
    sub: director.id, role: 'DIRECTOR',
    name: director.name, email: director.email, clientId: null,
  } as never)}`;
});

afterAll(async () => {
  await prisma.rolePreset.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

const directorKeys = async (): Promise<string[]> => {
  const res = await request(app).get(`${BASE}/roles/DIRECTOR`).set('Authorization', directorAuth);
  return (res.body.data.permissions as { key: string }[]).map((p) => p.key);
};

describe('who may manage permissions', () => {
  it('401 without a token', async () => {
    expect((await request(app).get(`${BASE}/presets`)).status).toBe(401);
  });

  it('403 for a role without roles.manage', async () => {
    const res = await request(app).get(`${BASE}/presets`).set('Authorization', fieldAuth);
    expect(res.status).toBe(403);
  });

  it('still lets that role read its own permissions', async () => {
    // /me sits before the roles.manage gate on purpose: the frontend needs it
    // for every user to decide what to show.
    const res = await request(app).get(`${BASE}/me`).set('Authorization', fieldAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).not.toContain('roles.manage');
  });
});

describe('DIRECTOR cannot be changed', () => {
  it('refuses replacing its set', async () => {
    const keys = await directorKeys();
    const res = await request(app)
      .put(`${BASE}/roles/DIRECTOR`)
      .set('Authorization', directorAuth)
      .send({ permissionKeys: keys, reason: 'route test — must be refused' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be changed/i);
  });

  it('refuses a grant, even of a key it already holds', async () => {
    const res = await request(app)
      .post(`${BASE}/roles/DIRECTOR/grant`)
      .set('Authorization', directorAuth)
      .send({ permissionKey: 'roles.manage' });
    expect(res.status).toBe(400);
  });

  it('still holds every permission afterwards', async () => {
    const catalogue = await request(app).get(BASE).set('Authorization', directorAuth);
    expect(await directorKeys()).toHaveLength(catalogue.body.data.length);
    expect(await directorKeys()).toContain('roles.manage');
  });
});

describe('roles outside the matrix', () => {
  it.each(['GUARD', 'CLIENT', 'NOT_A_ROLE'])('refuses %s', async (role) => {
    const res = await request(app).get(`${BASE}/roles/${role}`).set('Authorization', directorAuth);
    expect(res.status).toBe(400);
  });
});

describe('presets', () => {
  const name = `${PREFIX} Front desk`;
  let id = '';

  it('creates one — deduplicated, sorted, and recording who made it', async () => {
    const res = await request(app)
      .post(`${BASE}/presets`)
      .set('Authorization', directorAuth)
      .send({
        name: `  ${name}  `,
        description: 'Reception staff',
        permissionKeys: ['guards.view', 'clients.view', 'guards.view'],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(name);
    expect(res.body.data.permissionKeys).toEqual(['clients.view', 'guards.view']);
    expect(res.body.data.createdBy?.id).toBeTruthy();
    id = res.body.data.id;
  });

  it('lists it', async () => {
    const res = await request(app).get(`${BASE}/presets`).set('Authorization', directorAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it('refuses the same name in a different case', async () => {
    const res = await request(app)
      .post(`${BASE}/presets`)
      .set('Authorization', directorAuth)
      .send({ name: name.toUpperCase(), permissionKeys: [] });
    expect(res.status).toBe(409);
  });

  it('refuses an unknown key rather than saving the rest', async () => {
    const res = await request(app)
      .post(`${BASE}/presets`)
      .set('Authorization', directorAuth)
      .send({ name: `${PREFIX} typo`, permissionKeys: ['guards.view', 'guards.veiw'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('guards.veiw');
    const saved = await prisma.rolePreset.findFirst({ where: { name: `${PREFIX} typo` } });
    expect(saved).toBeNull();
  });

  it.each([
    ['a missing name',  { permissionKeys: [] }],
    ['a blank name',    { name: '   ', permissionKeys: [] }],
    ['keys that are not an array', { name: `${PREFIX} bad`, permissionKeys: 'guards.view' }],
    ['a name past 80 characters',  { name: `${PREFIX} ${'x'.repeat(80)}`, permissionKeys: [] }],
  ])('refuses %s', async (_label, body) => {
    const res = await request(app).post(`${BASE}/presets`).set('Authorization', directorAuth).send(body);
    expect(res.status).toBe(400);
  });

  it('accepts an empty set — "no access" is worth saving', async () => {
    const res = await request(app)
      .post(`${BASE}/presets`)
      .set('Authorization', directorAuth)
      .send({ name: `${PREFIX} No access`, permissionKeys: [] });
    expect(res.status).toBe(201);
    expect(res.body.data.permissionKeys).toEqual([]);
  });

  it('deleting a preset changes no role', async () => {
    const counts = async () =>
      (await request(app).get(`${BASE}/roles`).set('Authorization', directorAuth)).body.data;
    const before = await counts();

    const res = await request(app).delete(`${BASE}/presets/${id}`).set('Authorization', directorAuth);
    expect(res.status).toBe(200);

    expect(await counts()).toEqual(before);
  });

  it('reports a deleted preset as gone', async () => {
    const res = await request(app).delete(`${BASE}/presets/${id}`).set('Authorization', directorAuth);
    expect(res.status).toBe(404);
  });

  it('is closed to a role without roles.manage', async () => {
    const res = await request(app)
      .post(`${BASE}/presets`)
      .set('Authorization', fieldAuth)
      .send({ name: `${PREFIX} sneaky`, permissionKeys: [] });
    expect(res.status).toBe(403);
  });
});
