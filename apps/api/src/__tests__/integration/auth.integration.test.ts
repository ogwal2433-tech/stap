import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';
import { redisConnection } from '../../lib/redis';

let directorToken: string;
let guardToken: string;
let clientToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.createMany({
    data: [
      { id: 'it-director', name: 'IT Director', email: 'it.director@security360.test', passwordHash: hash, role: 'DIRECTOR', status: 'ACTIVE' },
      { id: 'it-guard',    name: 'IT Guard',    email: 'it.guard@security360.test',    passwordHash: hash, role: 'GUARD',    status: 'ACTIVE' },
      { id: 'it-client',   name: 'IT Client',   email: 'it.client@security360.test',   passwordHash: hash, role: 'CLIENT',   status: 'ACTIVE' },
    ],
    skipDuplicates: true,
  });

  const [d, g, c] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: 'it.director@security360.test', password: 'testpass123' }),
    request(app).post('/api/v1/auth/login').send({ email: 'it.guard@security360.test',    password: 'testpass123' }),
    request(app).post('/api/v1/auth/login').send({ email: 'it.client@security360.test',   password: 'testpass123' }),
  ]);

  directorToken = d.body.data?.accessToken;
  guardToken    = g.body.data?.accessToken;
  clientToken   = c.body.data?.accessToken;
});

afterAll(async () => {
  // Scoped to this file's own users. Deleting everything on @security360.test removed
  // the users other integration files were mid-run against — vitest runs files in
  // parallel — and their next audited write failed on AuditLog_userId_fkey.
  await prisma.user.deleteMany({ where: { email: { startsWith: 'it.', endsWith: '@security360.test' } } });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and accessToken for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'it.director@security360.test', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.role).toBe('DIRECTOR');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'it.director@security360.test', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    // Tests run outside production, so the detailed message is the one in play.
    // The generic-mode wording is pinned in auth/loginErrors.test.ts.
    expect(res.body.error).toBe('Incorrect password. Please try again.');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@security360.test', password: 'pass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No account found with this email address.');
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'it.director@security360.test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'notanemail', password: 'pass' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('it.director@security360.test');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});
