import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMAIL        = (role: string) => `gtransfer.${role.toLowerCase()}@stap.test`;
const MAIN_NID     = 'GTRANSFER-NID-001';
const FRESH_NID    = 'GTRANSFER-NID-002';
const CLIENT_NAME  = 'GTransfer Test Corp';
const SITE_NAME    = 'GTransfer Test Site';
const SITE_NAME_2  = 'GTransfer Test Site 2';

const ROLES_UNDER_TEST = [
  'DIRECTOR',
  'ASSISTANT_MANAGER',
  'OPERATIONS_SUPERVISOR',
  'ACCOUNTS_OFFICER',
  'GUARD',
];

const tokens: Record<string, string> = {};
let guardId: string;
let siteId:  string;
let siteId2: string;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function nukeTestData() {
  const guards = await prisma.guard.findMany({
    where: { nationalId: { in: [MAIN_NID, FRESH_NID] } },
    select: { id: true },
  });
  const ids = guards.map((g) => g.id);
  if (ids.length) {
    await prisma.guardTransfer.deleteMany({ where: { guardId: { in: ids } } });
    await prisma.deploymentHistory.deleteMany({ where: { guardId: { in: ids } } });
    await prisma.guard.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.site.deleteMany({ where: { siteName: { in: [SITE_NAME, SITE_NAME_2] } } });
  await prisma.client.deleteMany({ where: { clientName: CLIENT_NAME } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@stap.test' } } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Wipe any leftover test data from a previous run
  await nukeTestData();

  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.createMany({
    data: ROLES_UNDER_TEST.map((role) => ({
      id:           `gtransfer-${role.toLowerCase()}`,
      name:         `GTransfer ${role}`,
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

  const client = await prisma.client.create({
    data: {
      clientName:      CLIENT_NAME,
      contactPerson:   'Jane Transfer',
      contactPhone:    '+256700099001',
      physicalAddress: 'Kampala Road',
      billingTerms:    30,
    },
  });

  const [site, site2] = await Promise.all([
    prisma.site.create({
      data: {
        clientId:       client.id,
        siteName:       SITE_NAME,
        location:       'Kampala',
        guardsRequired: 2,
      },
    }),
    prisma.site.create({
      data: {
        clientId:       client.id,
        siteName:       SITE_NAME_2,
        location:       'Entebbe',
        guardsRequired: 2,
      },
    }),
  ]);
  siteId  = site.id;
  siteId2 = site2.id;

  const res = await request(app)
    .post('/api/v1/guards')
    .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
    .send({
      firstName:      'Transfer',
      lastName:       'TestGuard',
      nationalId:     MAIN_NID,
      phone:          '+256700099002',
      dateOfBirth:    '1992-06-15T00:00:00.000Z',
      nextOfKinName:  'Kin Transfer',
      nextOfKinPhone: '+256700099003',
      salaryRate:     420000,
      contractStart:  '2025-01-01T00:00:00.000Z',
    });

  guardId = res.body.data?.id;
  if (!guardId) {
    throw new Error(`Guard creation failed in beforeAll: ${JSON.stringify(res.body)}`);
  }

  // A transfer moves a guard FROM a site — seed an active deployment
  // so the guard is transferable in the tests below.
  await prisma.deploymentHistory.create({
    data: {
      guardId,
      siteId:       siteId,
      startDate:    new Date('2025-01-02'),
      shiftType:    'DAY',
      supervisorId: 'gtransfer-director',
    },
  });
});

// ── Teardown ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  await nukeTestData();
});

// ── POST /guards/:id/transfer — RBAC ──────────────────────────────────────────

describe('POST /guards/:id/transfer — RBAC', () => {
  // Each successive transfer must target a site different from the guard's
  // current one, so RBAC checks that succeed alternate the destination site.
  const payload = (toSiteId: string) => ({
    toSiteId,
    reason:       'Operational redeployment for integration test',
    transferDate: new Date().toISOString(),
  });

  it('DIRECTOR returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send(payload(siteId2));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.guard.id).toBe(guardId);
    expect(res.body.data.toSite.siteName).toBe(SITE_NAME_2);
  });

  it('ASSISTANT_MANAGER returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.ASSISTANT_MANAGER}`)
      .send(payload(siteId));
    expect(res.status).toBe(201);
  });

  it('OPERATIONS_SUPERVISOR returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.OPERATIONS_SUPERVISOR}`)
      .send(payload(siteId2));
    expect(res.status).toBe(201);
  });

  it('ACCOUNTS_OFFICER returns 403', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.ACCOUNTS_OFFICER}`)
      .send(payload(siteId));
    expect(res.status).toBe(403);
  });

  it('GUARD role returns 403', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.GUARD}`)
      .send(payload(siteId));
    expect(res.status).toBe(403);
  });
});

// ── POST /guards/:id/transfer — validation ─────────────────────────────────────

describe('POST /guards/:id/transfer — validation', () => {
  it('returns 400 when reason is less than 10 characters', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({
        toSiteId:     siteId,
        reason:       'Short',
        transferDate: new Date().toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when toSiteId does not exist in the database', async () => {
    const res = await request(app)
      .post(`/api/v1/guards/${guardId}/transfer`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({
        toSiteId:     'nonexistent-site-id',
        reason:       'Operational redeployment for testing',
        transferDate: new Date().toISOString(),
      });
    expect(res.status).toBe(404);
  });
});

// ── GET /guards/:id/transfers ──────────────────────────────────────────────────

describe('GET /guards/:id/transfers', () => {
  it('DIRECTOR returns 200 with an array', async () => {
    const res = await request(app)
      .get(`/api/v1/guards/${guardId}/transfers`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns empty array for a guard that has never been transferred', async () => {
    const freshRes = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({
        firstName:      'Fresh',
        lastName:       'NoTransfer',
        nationalId:     FRESH_NID,
        phone:          '+256700099004',
        dateOfBirth:    '1993-01-01T00:00:00.000Z',
        nextOfKinName:  'Kin',
        nextOfKinPhone: '+256700099005',
        salaryRate:     400000,
        contractStart:  '2025-01-01T00:00:00.000Z',
      });
    const freshId = freshRes.body.data?.id;

    const res = await request(app)
      .get(`/api/v1/guards/${freshId}/transfers`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns transfer records after transfers are created', async () => {
    const res = await request(app)
      .get(`/api/v1/guards/${guardId}/transfers`)
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const transfer = res.body.data[0];
    expect(transfer).toHaveProperty('id');
    expect(transfer).toHaveProperty('toSite');
    expect(transfer).toHaveProperty('reason');
    expect(transfer).toHaveProperty('transferDate');
    expect(transfer).toHaveProperty('authorisedBy');
  });
});
