import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMAIL = (role: string) => `ranks.${role.toLowerCase()}@stap.test`;

const ROLES_UNDER_TEST = ['DIRECTOR', 'ASSISTANT_MANAGER', 'GUARD'];
const tokens: Record<string, string> = {};

const TEST_RANK_NAME   = 'Integration Test Rank';
const TEST_RANK_NAME_2 = 'Integration Test Rank 2';

let rankId: string;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function nukeTestData() {
  await prisma.guard.deleteMany({ where: { nationalId: 'RANKTEST-NID-DEL-001' } });
  await prisma.guardRank.deleteMany({
    where: { name: { in: [TEST_RANK_NAME, TEST_RANK_NAME_2] } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@stap.test' } } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await nukeTestData();

  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.createMany({
    data: ROLES_UNDER_TEST.map((role) => ({
      id:           `ranks-test-${role.toLowerCase()}`,
      name:         `Ranks Test ${role}`,
      email:        EMAIL(role),
      passwordHash: hash,
      role:         role as any,
      status:       'ACTIVE',
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    ROLES_UNDER_TEST.map(async (role) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL(role), password: 'testpass123' });
      tokens[role] = res.body.data?.accessToken;
    }),
  );
});

afterAll(async () => {
  await nukeTestData();
});

// ── GET /settings/ranks ────────────────────────────────────────────────────────

describe('GET /settings/ranks', () => {
  it('returns 200 for authenticated user (DIRECTOR)', async () => {
    const res = await request(app)
      .get('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for GUARD role', async () => {
    const res = await request(app)
      .get('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.GUARD}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/settings/ranks');
    expect(res.status).toBe(401);
  });
});

// ── POST /settings/ranks ───────────────────────────────────────────────────────

describe('POST /settings/ranks', () => {
  it('DIRECTOR can create a rank — returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_RANK_NAME, displayOrder: 99 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(TEST_RANK_NAME);
    expect(res.body.data.isActive).toBe(true);
    rankId = res.body.data.id;
  });

  it('ASSISTANT_MANAGER cannot create a rank — returns 403', async () => {
    const res = await request(app)
      .post('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.ASSISTANT_MANAGER}`)
      .send({ name: 'Forbidden Rank', displayOrder: 100 });
    expect(res.status).toBe(403);
  });

  it('returns 409 for duplicate rank name', async () => {
    const res = await request(app)
      .post('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_RANK_NAME, displayOrder: 99 });
    expect(res.status).toBe(409);
  });

  it('returns 409 for duplicate name case-insensitive', async () => {
    const res = await request(app)
      .post('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_RANK_NAME.toLowerCase(), displayOrder: 99 });
    expect(res.status).toBe(409);
  });
});

// ── GET /settings/ranks?activeOnly=true ───────────────────────────────────────

describe('GET /settings/ranks?activeOnly=true', () => {
  it('returns only active ranks', async () => {
    const res = await request(app)
      .get('/api/v1/settings/ranks?activeOnly=true')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.isActive)).toBe(true);
  });
});

// ── PATCH /settings/ranks/:id ─────────────────────────────────────────────────

describe('PATCH /settings/ranks/:id', () => {
  it('DIRECTOR can update a rank — returns 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/ranks/${rankId}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ displayOrder: 88 });
    expect(res.status).toBe(200);
    expect(res.body.data.displayOrder).toBe(88);
  });
});

// ── PATCH /settings/ranks/:id/deactivate ─────────────────────────────────────

describe('PATCH /settings/ranks/:id/deactivate', () => {
  it('DIRECTOR can deactivate a rank — returns 200 with isActive false', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/ranks/${rankId}/deactivate`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('deactivated rank not returned in activeOnly=true list', async () => {
    const res = await request(app)
      .get('/api/v1/settings/ranks?activeOnly=true')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    const names = res.body.data.map((r: any) => r.name);
    expect(names).not.toContain(TEST_RANK_NAME);
  });
});

// ── PATCH /settings/ranks/:id/activate ───────────────────────────────────────

describe('PATCH /settings/ranks/:id/activate', () => {
  it('DIRECTOR can activate a rank — returns 200 with isActive true', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/ranks/${rankId}/activate`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });
});

// ── PUT /settings/ranks/reorder ───────────────────────────────────────────────

describe('PUT /settings/ranks/reorder', () => {
  it('DIRECTOR can reorder ranks — returns 200', async () => {
    const listRes = await request(app)
      .get('/api/v1/settings/ranks?activeOnly=false')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    const ids = listRes.body.data.map((r: any) => r.id);

    const res = await request(app)
      .put('/api/v1/settings/ranks/reorder')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ orderedIds: [...ids].reverse() });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── DELETE /settings/ranks/:id ────────────────────────────────────────────────

describe('DELETE /settings/ranks/:id', () => {
  it('can delete rank that has no guards — returns 200', async () => {
    // Create a fresh rank with no guards, then delete it
    const createRes = await request(app)
      .post('/api/v1/settings/ranks')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_RANK_NAME_2, displayOrder: 999 });
    const idToDelete = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/settings/ranks/${idToDelete}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 when guards are assigned to the rank', async () => {
    // Seed a guard with the test rank name then try to delete
    const guard = await prisma.guard.create({
      data: {
        firstName:      'Rank',
        lastName:       'TestGuard',
        nationalId:     'RANKTEST-NID-DEL-001',
        phone:          '+256700099099',
        dateOfBirth:    new Date('1990-01-01'),
        nextOfKinName:  'Next',
        nextOfKinPhone: '+256700099098',
        salaryRate:     400000,
        contractStart:  new Date('2025-01-01'),
        rank:           TEST_RANK_NAME,
      },
    });

    const res = await request(app)
      .delete(`/api/v1/settings/ranks/${rankId}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(409);

    // Cleanup
    await prisma.guard.delete({ where: { id: guard.id } });
  });
});
