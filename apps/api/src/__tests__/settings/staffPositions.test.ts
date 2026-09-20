import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';
import { UpdateStaffSchema } from '@stap/shared';

/**
 * Staff positions are configured in Settings rather than compiled in.
 *
 * The part worth holding down is the code: it is what User.jobTitle stores, the
 * same arrangement Guard.rank has with GuardRank. Renaming a position must not
 * change it, or every staff member holding that position would be detached from
 * it in one edit.
 */

const ROLE = 'ZZ_STAFF_POSITIONS';
const BASE = '/api/v1/settings/staff-positions';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const token = bearer(`ci-${ROLE}`, ROLE);
const permIds: Record<string, string> = {};
const created: string[] = [];

async function grant(key: string) {
  await prisma.rolePermission.create({ data: { role: ROLE, permissionId: permIds[key] } });
  clearPermissionCache(ROLE);
}
async function revokeAll() {
  await prisma.rolePermission.deleteMany({ where: { role: ROLE } });
  clearPermissionCache(ROLE);
}

/** Creates a position through the API and remembers it for cleanup. */
async function create(body: Record<string, unknown>) {
  const res = await request(app).post(BASE).set('Authorization', token).send(body);
  if (res.status === 201) created.push(res.body.data.id);
  return res;
}

beforeAll(async () => {
  for (const key of ['settings.edit', 'settings.view']) {
    permIds[key] = (
      await prisma.permission.findUniqueOrThrow({ where: { key }, select: { id: true } })
    ).id;
  }
  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Staff Position Test', isSystem: false, isActive: true },
  });
  clearPermissionCache(ROLE);
});

afterEach(async () => {
  if (created.length) {
    await prisma.staffPosition.deleteMany({ where: { id: { in: created.splice(0) } } });
  }
});

afterAll(async () => {
  await prisma.staffPosition.deleteMany({ where: { code: { startsWith: 'ZZ_' } } });
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
});

describe('staff positions', () => {
  it('lists the seeded positions to any signed-in user', async () => {
    await revokeAll();

    const res = await request(app).get(BASE).set('Authorization', token);
    expect(res.status).toBe(200);
    // The staff form needs this dropdown, so reading it is not gated on settings.
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('keeps the codes the staff records already point at', async () => {
    await revokeAll();

    const res = await request(app).get(BASE).set('Authorization', token);
    const codes = res.body.data.map((p: { code: string }) => p.code);
    // These were the hardcoded values before positions became configurable.
    expect(codes).toContain('ZONE_1_SUPERVISOR');
    expect(codes).toContain('MD');
  });

  it('refuses to create without settings.edit', async () => {
    await revokeAll();
    const res = await create({ title: 'ZZ Nope', department: 'Operations' });
    expect(res.status).toBe(403);
  });

  it('creates a position and derives its code from the title', async () => {
    await revokeAll();
    await grant('settings.edit');

    const res = await create({
      title: 'ZZ Security Coordinator', department: 'Operations', grade: 'Senior',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('ZZ_SECURITY_COORDINATOR');
    expect(res.body.data.department).toBe('Operations');
    expect(res.body.data.grade).toBe('Senior');
    expect(res.body.data.isActive).toBe(true);
  });

  it('refuses a duplicate title in the same department', async () => {
    await revokeAll();
    await grant('settings.edit');

    await create({ title: 'ZZ Duplicate', department: 'Operations' });
    const again = await create({ title: 'zz duplicate', department: 'Operations' });

    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already exists/i);
  });

  it('allows the same title in a different department', async () => {
    await revokeAll();
    await grant('settings.edit');

    expect((await create({ title: 'ZZ Shared Title', department: 'Operations' })).status).toBe(201);
    expect((await create({ title: 'ZZ Shared Title', department: 'Training' })).status).toBe(201);
  });

  it('keeps the code fixed when a position is renamed', async () => {
    await revokeAll();
    await grant('settings.edit');

    const made = await create({ title: 'ZZ Original Name', department: 'Operations' });
    const { id, code } = made.body.data;

    const res = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', token)
      .send({ title: 'ZZ Renamed Entirely', grade: 'Head' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('ZZ Renamed Entirely');
    expect(res.body.data.grade).toBe('Head');
    // The staff pointing at this position must not be detached by a rename.
    expect(res.body.data.code).toBe(code);
  });

  it('hides a deactivated position from the staff form but keeps it listed in settings', async () => {
    await revokeAll();
    await grant('settings.edit');

    const made = await create({ title: 'ZZ Retired Post', department: 'Operations' });
    const { id } = made.body.data;

    expect((await request(app).patch(`${BASE}/${id}/deactivate`).set('Authorization', token)).status).toBe(200);

    const active = await request(app).get(BASE).set('Authorization', token);
    expect(active.body.data.map((p: { id: string }) => p.id)).not.toContain(id);

    const all = await request(app).get(`${BASE}?activeOnly=false`).set('Authorization', token);
    expect(all.body.data.map((p: { id: string }) => p.id)).toContain(id);

    expect((await request(app).patch(`${BASE}/${id}/activate`).set('Authorization', token)).status).toBe(200);
    const back = await request(app).get(BASE).set('Authorization', token);
    expect(back.body.data.map((p: { id: string }) => p.id)).toContain(id);
  });

  it('deletes a position nobody holds', async () => {
    await revokeAll();
    await grant('settings.edit');

    const made = await create({ title: 'ZZ Unused Post', department: 'Operations' });
    const res = await request(app).delete(`${BASE}/${made.body.data.id}`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(await prisma.staffPosition.findUnique({ where: { id: made.body.data.id } })).toBeNull();
  });

  it('refuses to delete a position staff still hold, and says how many', async () => {
    await revokeAll();
    await grant('settings.edit');

    // A real position with people on it: whatever code staff actually carry.
    const holder = await prisma.user.findFirst({
      where:  { jobTitle: { not: null } },
      select: { jobTitle: true },
    });
    if (!holder?.jobTitle) return;

    const position = await prisma.staffPosition.findUnique({ where: { code: holder.jobTitle } });
    if (!position) return;

    const res = await request(app).delete(`${BASE}/${position.id}`).set('Authorization', token);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/staff member/i);
    expect(res.body.error).toMatch(/Deactivate it instead/i);

    // And it is still there.
    expect(await prisma.staffPosition.findUnique({ where: { id: position.id } })).not.toBeNull();
  });

  it('reports how many staff hold each position', async () => {
    await revokeAll();

    const res = await request(app).get(`${BASE}?activeOnly=false`).set('Authorization', token);
    const withCounts = res.body.data.filter((p: { staffCount: number }) => p.staffCount > 0);

    for (const position of withCounts) {
      const actual = await prisma.user.count({ where: { jobTitle: position.code } });
      expect(position.staffCount, position.code).toBe(actual);
    }
  });

  it('lets a newly added position actually be assigned to staff', async () => {
    await revokeAll();
    await grant('settings.edit');

    const made = await create({ title: 'ZZ Brand New Post', department: 'Operations' });
    const { code } = made.body.data;

    // The whole point of configurable positions: a code invented after the
    // build must pass validation. A compiled enum would refuse this one.
    const parsed = UpdateStaffSchema.safeParse({ jobTitle: code });
    expect(parsed.success, 'a newly created position code must validate').toBe(true);
  });

  it('gives a position with a clashing code a distinct one', async () => {
    await revokeAll();
    await grant('settings.edit');

    // Same title, different department — the titles may coexist, the codes cannot.
    const first  = await create({ title: 'ZZ Code Clash', department: 'Operations' });
    const second = await create({ title: 'ZZ Code Clash', department: 'Finance' });

    expect(second.status).toBe(201);
    expect(second.body.data.code).not.toBe(first.body.data.code);
  });
});
