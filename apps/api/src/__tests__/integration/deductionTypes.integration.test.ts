import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMAIL = (role: string) => `dtypes.${role.toLowerCase()}@stap.test`;

const ROLES_UNDER_TEST = ['DIRECTOR', 'ASSISTANT_MANAGER', 'GUARD'];
const tokens: Record<string, string> = {};

const TEST_TYPE_NAME  = 'Integration Test Deduction Type';
const TEST_TYPE_CODE  = 'INTEGRATION_TEST_DT';
const TEST_TYPE_NAME2 = 'Integration Test Deduction Type 2';
const TEST_TYPE_CODE2 = 'INTEGRATION_TEST_DT2';

let typeId: string;
let autoTypeId: string;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function nukeTestData() {
  await prisma.guardDeduction.deleteMany({ where: { type: 'INTEGRATION_TEST_DT_USED' } });
  await prisma.deductionType.deleteMany({
    where: { code: { in: [TEST_TYPE_CODE, TEST_TYPE_CODE2, 'INTEGRATION_AUTO_DT', 'INTEGRATION_TEST_DT_USED'] } },
  });
  // Scoped to this file's own users. Deleting everything on @stap.test removed
  // the users other integration files were mid-run against — vitest runs files in
  // parallel — and their next audited write failed on AuditLog_userId_fkey.
  await prisma.user.deleteMany({ where: { email: { startsWith: 'dtypes.', endsWith: '@stap.test' } } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await nukeTestData();

  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.createMany({
    data: ROLES_UNDER_TEST.map((role) => ({
      id:           `dtypes-test-${role.toLowerCase()}`,
      name:         `DTypes Test ${role}`,
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

  // Seed an automatic type for testing system-type restrictions
  const auto = await prisma.deductionType.create({
    data: {
      name:        'Integration Auto Type',
      code:        'INTEGRATION_AUTO_DT',
      isAutomatic: true,
      displayOrder: 99,
    },
  });
  autoTypeId = auto.id;
});

afterAll(async () => {
  await nukeTestData();
});

// ── GET /settings/deduction-types ─────────────────────────────────────────────

describe('GET /settings/deduction-types', () => {
  it('returns 200 for authenticated user (DIRECTOR)', async () => {
    const res = await request(app)
      .get('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for GUARD role', async () => {
    const res = await request(app)
      .get('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.GUARD}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/settings/deduction-types');
    expect(res.status).toBe(401);
  });
});

// ── GET /settings/deduction-types?activeOnly ──────────────────────────────────

describe('GET /settings/deduction-types?activeOnly', () => {
  it('returns only active types when activeOnly=true', async () => {
    const res = await request(app)
      .get('/api/v1/settings/deduction-types?activeOnly=true')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t: any) => t.isActive)).toBe(true);
  });

  it('returns all types including inactive when activeOnly=false', async () => {
    const res = await request(app)
      .get('/api/v1/settings/deduction-types?activeOnly=false')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── POST /settings/deduction-types ────────────────────────────────────────────

describe('POST /settings/deduction-types', () => {
  it('DIRECTOR can create a type — returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_TYPE_NAME, code: TEST_TYPE_CODE, displayOrder: 99 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(TEST_TYPE_NAME);
    expect(res.body.data.code).toBe(TEST_TYPE_CODE);
    expect(res.body.data.isAutomatic).toBe(false);
    expect(res.body.data.isActive).toBe(true);
    typeId = res.body.data.id;
  });

  it('ASSISTANT_MANAGER cannot create a type — returns 403', async () => {
    const res = await request(app)
      .post('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.ASSISTANT_MANAGER}`)
      .send({ name: 'Forbidden Type', code: 'FORBIDDEN_TYPE', displayOrder: 100 });
    expect(res.status).toBe(403);
  });

  it('returns 409 for duplicate name', async () => {
    const res = await request(app)
      .post('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_TYPE_NAME, code: 'DIFFERENT_CODE', displayOrder: 99 });
    expect(res.status).toBe(409);
  });

  it('returns 409 for duplicate code', async () => {
    const res = await request(app)
      .post('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: 'Different Name', code: TEST_TYPE_CODE, displayOrder: 99 });
    expect(res.status).toBe(409);
  });
});

// ── PATCH /settings/deduction-types/:id ───────────────────────────────────────

describe('PATCH /settings/deduction-types/:id', () => {
  it('DIRECTOR can update a type — returns 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/deduction-types/${typeId}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ defaultAmount: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.data.defaultAmount).toBe(5000);
  });

  it('attempt to change code returns 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/deduction-types/${typeId}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ code: 'CHANGED_CODE' });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /settings/deduction-types/:id/deactivate ────────────────────────────

describe('PATCH /settings/deduction-types/:id/deactivate', () => {
  it('DIRECTOR can deactivate a non-automatic type — returns 200 with isActive false', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/deduction-types/${typeId}/deactivate`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('automatic type cannot be deactivated — returns 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/deduction-types/${autoTypeId}/deactivate`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(400);
  });
});

// ── PATCH /settings/deduction-types/:id/activate ─────────────────────────────

describe('PATCH /settings/deduction-types/:id/activate', () => {
  it('DIRECTOR can activate a type — returns 200 with isActive true', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/deduction-types/${typeId}/activate`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });
});

// ── DELETE /settings/deduction-types/:id ──────────────────────────────────────

describe('DELETE /settings/deduction-types/:id', () => {
  it('can delete type that has no deduction records — returns 200', async () => {
    const createRes = await request(app)
      .post('/api/v1/settings/deduction-types')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: TEST_TYPE_NAME2, code: TEST_TYPE_CODE2, displayOrder: 999 });
    const idToDelete = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/settings/deduction-types/${idToDelete}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 when deduction records reference this type', async () => {
    // Create a type then add a deduction record referencing it
    const used = await prisma.deductionType.create({
      data: { name: 'Used Type', code: 'INTEGRATION_TEST_DT_USED', displayOrder: 998, isAutomatic: false },
    });

    // Find a guard to attach the deduction to
    const guard = await prisma.guard.findFirst();
    if (guard) {
      await prisma.guardDeduction.create({
        data: {
          guardId:       guard.id,
          type:          'INTEGRATION_TEST_DT_USED',
          amount:        1000,
          description:   'Test deduction for integration test',
          effectiveDate: new Date(),
          createdBy:     'dtypes-test-director',
        },
      });
    }

    const res = await request(app)
      .delete(`/api/v1/settings/deduction-types/${used.id}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);

    if (guard) {
      expect(res.status).toBe(409);
      await prisma.guardDeduction.deleteMany({ where: { type: 'INTEGRATION_TEST_DT_USED' } });
    } else {
      // No guards in test DB — skip the 409 check but ensure we can still delete
      expect([200, 409]).toContain(res.status);
    }

    await prisma.deductionType.deleteMany({ where: { code: 'INTEGRATION_TEST_DT_USED' } });
  });

  it('automatic type cannot be deleted — returns 400', async () => {
    const res = await request(app)
      .delete(`/api/v1/settings/deduction-types/${autoTypeId}`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(400);
  });
});

// ── PUT /settings/deduction-types/reorder ─────────────────────────────────────

describe('PUT /settings/deduction-types/reorder', () => {
  it('DIRECTOR can reorder types — returns 200', async () => {
    const listRes = await request(app)
      .get('/api/v1/settings/deduction-types?activeOnly=false')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    const ids = listRes.body.data.map((t: any) => t.id);

    const res = await request(app)
      .put('/api/v1/settings/deduction-types/reorder')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ orderedIds: [...ids].reverse() });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
