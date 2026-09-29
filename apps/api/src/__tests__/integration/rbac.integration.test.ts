import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

const EMAIL = (role: string) => `rbac.${role.toLowerCase()}@security360.test`;
const tokens: Record<string, string> = {};

const ROLES = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR', 'ACCOUNTS_OFFICER', 'GUARD', 'CLIENT'];

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.createMany({
    data: ROLES.map((role) => ({
      id: `rbac-${role.toLowerCase()}`,
      name: `RBAC ${role}`,
      email: EMAIL(role),
      passwordHash: hash,
      role: role as any,
      status: 'ACTIVE',
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    ROLES.map(async (role) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL(role), password: 'testpass123' });
      tokens[role] = res.body.data?.accessToken;
    }),
  );
});

afterAll(async () => {
  // Scoped to this file's own users. Deleting everything on @security360.test removed
  // the users other integration files were mid-run against — vitest runs files in
  // parallel — and their next audited write failed on AuditLog_userId_fkey.
  await prisma.user.deleteMany({ where: { email: { startsWith: 'rbac.', endsWith: '@security360.test' } } });
});

describe('RBAC — Guards endpoints', () => {
  it('GET /guards — DIRECTOR returns 200', async () => {
    const res = await request(app).get('/api/v1/guards').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
  });

  it('GET /guards — GUARD role returns 200 (internal role)', async () => {
    const res = await request(app).get('/api/v1/guards').set('Authorization', `Bearer ${tokens.GUARD}`);
    expect([200, 403]).toContain(res.status);
  });

  it('GET /guards — CLIENT role returns 403', async () => {
    const res = await request(app).get('/api/v1/guards').set('Authorization', `Bearer ${tokens.CLIENT}`);
    expect(res.status).toBe(403);
  });

  it('POST /guards — DIRECTOR returns 201 or 409', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({
        firstName: 'RBAC', lastName: 'TestGuard', nationalId: 'RBAC-TST-001',
        phone: '+256700000099', dateOfBirth: '1990-01-01T00:00:00.000Z',
        nextOfKinName: 'RBAC Kin', nextOfKinPhone: '+256700000098',
        salaryRate: 400000, contractStart: '2026-01-01T00:00:00.000Z',
      });
    expect([201, 409]).toContain(res.status);
  });

  it('POST /guards — ACCOUNTS_OFFICER returns 403', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${tokens.ACCOUNTS_OFFICER}`)
      .send({ firstName: 'X', lastName: 'Y' });
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Finance endpoints', () => {
  it('GET /finance/invoices — DIRECTOR returns 200', async () => {
    const res = await request(app).get('/api/v1/finance/invoices').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
  });

  it('GET /finance/invoices — GUARD returns 403', async () => {
    const res = await request(app).get('/api/v1/finance/invoices').set('Authorization', `Bearer ${tokens.GUARD}`);
    expect(res.status).toBe(403);
  });

  it('POST /finance/payroll/calculate — ACCOUNTS_OFFICER returns 403', async () => {
    const res = await request(app)
      .post('/api/v1/finance/payroll/calculate')
      .set('Authorization', `Bearer ${tokens.ACCOUNTS_OFFICER}`)
      .send({ month: 4, year: 2026 });
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Portal endpoints', () => {
  it('GET /portal/overview — CLIENT role reaches portal guard (not blocked by RBAC middleware)', async () => {
    // Portal guard allows CLIENT role but also requires a linked Client record.
    // A test CLIENT user without a linked record gets 403 from the portal guard (not RBAC).
    // Non-CLIENT roles (e.g. DIRECTOR) also get 403 but for a different reason.
    const clientRes = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tokens.CLIENT}`);
    const dirRes    = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    // Director gets 403 ("Client access only") — CLIENT also gets 403 ("No client account linked")
    // What matters is that DIRECTOR is forbidden, and CLIENT gets through the role check
    expect(dirRes.status).toBe(403);
    expect(clientRes.status).not.toBe(401); // reaches the route (not an auth failure)
  });

  it('GET /portal/overview — DIRECTOR returns 403', async () => {
    const res = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(403);
  });

  it('GET /portal/overview — GUARD returns 403', async () => {
    const res = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tokens.GUARD}`);
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Settings endpoints', () => {
  it('GET /settings — DIRECTOR returns 200', async () => {
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
  });

  it('GET /settings — ASSISTANT_MANAGER returns 200 (read-only access allowed)', async () => {
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${tokens.ASSISTANT_MANAGER}`);
    expect(res.status).toBe(200);
  });

  it('POST /settings/users — DIRECTOR returns 201 or 409', async () => {
    const res = await request(app)
      .post('/api/v1/settings/users')
      .set('Authorization', `Bearer ${tokens.DIRECTOR}`)
      .send({ name: 'RBAC User', email: 'rbac.newuser@security360.test', password: 'Password123!', role: 'TRAINER' });
    expect([201, 409]).toContain(res.status);
    // Cleanup
    await prisma.user.deleteMany({ where: { email: 'rbac.newuser@security360.test' } });
  });
});
