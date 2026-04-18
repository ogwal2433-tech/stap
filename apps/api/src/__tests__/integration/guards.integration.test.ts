import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

let directorToken: string;
let guardId: string;
const EMAIL = 'gint.director@stap.test';

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    create: { id: 'gint-director', name: 'GInt Director', email: EMAIL, passwordHash: hash, role: 'DIRECTOR', status: 'ACTIVE' },
    update: {},
  });
  const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'testpass123' });
  directorToken = res.body.data?.accessToken;
});

afterAll(async () => {
  if (guardId) {
    await prisma.guard.deleteMany({ where: { id: guardId } });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe('Guards API — CRUD', () => {
  it('POST /guards — creates guard with valid data', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        firstName:       'Integration',
        lastName:        'TestGuard',
        nationalId:      'INT-TEST-001',
        phone:           '+256700000001',
        dateOfBirth:     '1990-01-01T00:00:00.000Z',
        nextOfKinName:   'Test Kin',
        nextOfKinPhone:  '+256700000002',
        salaryRate:      400000,
        contractStart:   '2026-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.fullName).toBe('Integration TestGuard');
    guardId = res.body.data.id;
  });

  it('GET /guards — returns paginated list with data array', async () => {
    const res = await request(app)
      .get('/api/v1/guards')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('GET /guards/:id — returns guard detail', async () => {
    const res = await request(app)
      .get(`/api/v1/guards/${guardId}`)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(guardId);
  });

  it('PATCH /guards/:id — updates guard phone', async () => {
    const res = await request(app)
      .patch(`/api/v1/guards/${guardId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ phone: '+256711111111' });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+256711111111');
  });

  it('POST /guards — 409 for duplicate national ID', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        firstName: 'Duplicate', lastName: 'Guard', nationalId: 'INT-TEST-001',
        phone: '+256700000099', dateOfBirth: '1991-01-01T00:00:00.000Z',
        nextOfKinName: 'Kin', nextOfKinPhone: '+256700000098',
        salaryRate: 400000, contractStart: '2026-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(409);
  });

  it('POST /guards — 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ firstName: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  it('GET /guards/:id — 404 for non-existent guard', async () => {
    const res = await request(app)
      .get('/api/v1/guards/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(404);
  });
});
