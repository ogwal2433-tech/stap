import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * Add Guard for an OPERATIONS_SUPERVISOR holding guards.create, traced through
 * the API: the permission reaches /permissions/me, POST /guards accepts it, and
 * the failures the form has to explain come back in a shape it can explain.
 *
 * The grant is added only if this database lacks it and removed again after,
 * so a deployment that granted it by hand is left as it was. Guards created
 * here carry a ZZOPSTEST national ID and are deleted afterwards.
 */

const ROLE   = 'OPERATIONS_SUPERVISOR';
const NIN    = 'ZZOPSTEST';

let token = '';
let addedGrant = false;
let permissionId = '';

const tokenFor = (sub: string, role: string, name: string, email: string) =>
  `Bearer ${signAccessToken({ sub, role, name, email, clientId: null } as never)}`;

const guardBody = (o: Record<string, unknown> = {}) => ({
  firstName:     'Ops',
  lastName:      'Recruit',
  nationalId:    `${NIN}${Date.now().toString().slice(-6)}`,
  phone:         '+256700000123',
  dateOfBirth:   '1995-04-12T00:00:00.000Z',
  nextOfKinName: 'Next Of Kin',
  nextOfKinPhone:'+256700000456',
  salaryRate:    300_000,
  contractStart: '2026-09-01T00:00:00.000Z',
  ...o,
});

beforeAll(async () => {
  const user = await prisma.user.findFirst({
    where:  { role: ROLE, status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new Error(`These tests need an active ${ROLE} account.`);
  token = tokenFor(user.id, ROLE, user.name, user.email);

  const perm = await prisma.permission.findUniqueOrThrow({ where: { key: 'guards.create' }, select: { id: true } });
  permissionId = perm.id;

  const held = await prisma.rolePermission.findUnique({
    where: { role_permissionId: { role: ROLE, permissionId } },
  });
  if (!held) {
    await prisma.rolePermission.create({ data: { role: ROLE, permissionId } });
    addedGrant = true;
  }
  // The middleware caches a role's grants for five minutes; this process may
  // already hold an entry from before the grant.
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  await prisma.guard.deleteMany({ where: { nationalId: { startsWith: NIN } } });
  if (addedGrant) {
    await prisma.rolePermission.deleteMany({ where: { role: ROLE, permissionId } });
  }
  clearPermissionCache(ROLE);
});

describe('Add Guard for OPERATIONS_SUPERVISOR with guards.create', () => {
  it('reports the grant through /permissions/me, read from the database', async () => {
    const res = await request(app).get('/api/v1/permissions/me').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toContain('guards.create');
  });

  it('creates the guard — POST /guards gates on the permission, not a role list', async () => {
    const res = await request(app).post('/api/v1/guards').set('Authorization', token).send(guardBody());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.firstName).toBe('Ops');
  });

  it('opens the guard it just created, which is where the form navigates next', async () => {
    const created = await request(app).post('/api/v1/guards').set('Authorization', token)
      .send(guardBody({ firstName: 'Opens' }));
    expect(created.status).toBe(201);

    const res = await request(app).get(`/api/v1/guards/${created.body.data.id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });

  it('returns per-field details on a validation failure, so the form can name the field', async () => {
    const res = await request(app).post('/api/v1/guards').set('Authorization', token)
      .send(guardBody({ dateOfBirth: 'not-a-date', salaryRate: -5 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Object.keys(res.body.details.fieldErrors)).toEqual(
      expect.arrayContaining(['dateOfBirth', 'salaryRate']),
    );
  });

  it('refuses a role without the grant with a message naming the permission', async () => {
    // Any role that does not hold guards.create — chosen from the database, not assumed.
    const without = await prisma.role.findFirst({
      where: {
        isActive: true,
        name: { notIn: ['DIRECTOR', 'GUARD', 'CLIENT'] },
        permissions: { none: { permissionId } },
      },
      select: { name: true },
    });
    if (!without) return; // every staff role holds it on this database

    const res = await request(app).post('/api/v1/guards')
      .set('Authorization', tokenFor(`ci-${without.name}`, without.name, 'CI', 'ci@test.local'))
      .send(guardBody());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Missing permission/i);
  });
});
