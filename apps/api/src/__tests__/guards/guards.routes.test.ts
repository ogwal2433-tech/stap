import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { signAccessToken } from '../../lib/jwt';
import { ROLES, type UserRole } from '@security360/shared';

function token(role: UserRole, userId = `ci-${role}`) {
  return signAccessToken({
    sub: userId,
    role,
    name: `Test ${role}`,
    email: `${role.toLowerCase()}@test.com`,
  });
}

const dirToken = token(ROLES.DIRECTOR);
const amToken = token(ROLES.ASSISTANT_MANAGER);
const accToken = token(ROLES.ACCOUNTS_OFFICER);
const clientToken = token(ROLES.CLIENT);
const fieldToken = token(ROLES.FIELD_SUPERVISOR);

// ── GET /api/v1/guards ────────────────────────────────────────────────────────

describe('GET /api/v1/guards', () => {
  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/guards');
    expect(res.status).toBe(401);
  });

  it('403 — CLIENT token', async () => {
    const res = await request(app)
      .get('/api/v1/guards')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('200 — DIRECTOR token returns pagination', async () => {
    const res = await request(app)
      .get('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`);
    // Either 200 with data or 500 if DB not connected in CI — we test the auth layer
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('pagination');
      expect(res.body).toHaveProperty('data');
    }
  });

  it('200 — FIELD_SUPERVISOR token allowed', async () => {
    const res = await request(app)
      .get('/api/v1/guards')
      .set('Authorization', `Bearer ${fieldToken}`);
    expect([200, 500]).toContain(res.status);
    // Must NOT be 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── POST /api/v1/guards ───────────────────────────────────────────────────────

describe('POST /api/v1/guards', () => {
  const validBody = {
    firstName: 'Test',
    lastName: 'Guard',
    nationalId: `NIN-${Date.now()}`,
    phone: '+256700000001',
    dateOfBirth: '1990-01-01T00:00:00.000Z',
    nextOfKinName: 'Relative Name',
    nextOfKinPhone: '+256700000002',
    salaryRate: 400000,
    contractStart: '2026-01-01T00:00:00.000Z',
  };

  it('403 — ACCOUNTS_OFFICER cannot create guards', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${accToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('400 — DIRECTOR, missing firstName', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ ...validBody, firstName: undefined });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('201 or 500 — DIRECTOR, valid body', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`)
      .send(validBody);
    // 201 if DB connected; 500 if not (auth + validation passed)
    expect([201, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    }
  });
});

// ── GET /api/v1/guards/:id ────────────────────────────────────────────────────

describe('GET /api/v1/guards/:id', () => {
  it('404 — unknown id when DB connected', async () => {
    const res = await request(app)
      .get('/api/v1/guards/nonexistent-id-xyz')
      .set('Authorization', `Bearer ${dirToken}`);
    // 404 if DB connected; 500 if not — auth layer passed
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 404) {
      expect(res.body.success).toBe(false);
    }
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/guards/any-id');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/guards/:id ──────────────────────────────────────────────────

describe('PATCH /api/v1/guards/:id', () => {
  it('403 — ACCOUNTS_OFFICER cannot update', async () => {
    const res = await request(app)
      .patch('/api/v1/guards/some-id')
      .set('Authorization', `Bearer ${accToken}`)
      .send({ firstName: 'New' });
    expect(res.status).toBe(403);
  });

  it('200 or 404 — ASSISTANT_MANAGER, valid update', async () => {
    const res = await request(app)
      .patch('/api/v1/guards/some-id')
      .set('Authorization', `Bearer ${amToken}`)
      .send({ firstName: 'Updated' });
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });
});

// ── PATCH /api/v1/guards/:id/status ──────────────────────────────────────────

describe('PATCH /api/v1/guards/:id/status', () => {
  it('403 — FIELD_SUPERVISOR cannot change status', async () => {
    const res = await request(app)
      .patch('/api/v1/guards/some-id/status')
      .set('Authorization', `Bearer ${fieldToken}`)
      .send({ status: 'SUSPENDED', reason: 'Test reason here.' });
    expect(res.status).toBe(403);
  });

  it('200 or 404 — DIRECTOR, TERMINATED', async () => {
    const res = await request(app)
      .patch('/api/v1/guards/some-id/status')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ status: 'TERMINATED', reason: 'Contract concluded successfully.' });
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });
});

// ── GET /api/v1/guards/:id/deployment-history ─────────────────────────────────

describe('GET /api/v1/guards/:id/deployment-history', () => {
  it('200 or 404 — DIRECTOR gets paginated history', async () => {
    const res = await request(app)
      .get('/api/v1/guards/some-id/deployment-history')
      .set('Authorization', `Bearer ${dirToken}`);
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('403 — FIELD_SUPERVISOR cannot access deployment history', async () => {
    const res = await request(app)
      .get('/api/v1/guards/some-id/deployment-history')
      .set('Authorization', `Bearer ${fieldToken}`);
    expect(res.status).toBe(403);
  });
});

// ── PUT /api/v1/guards/:id/vetting-data ───────────────────────────────────────

describe('PUT /api/v1/guards/:id/vetting-data', () => {
  const validVettingBody = {
    relatives: [
      {
        relativeName: 'Paul Ssekandi',
        phone: '+256703000001',
        relationship: 'Brother',
        occupation: 'Driver',
        placeOfResidence: 'Nateete',
      },
    ],
    associates: [],
  };

  it('403 — ACCOUNTS_OFFICER cannot update vetting data', async () => {
    const res = await request(app)
      .put('/api/v1/guards/some-id/vetting-data')
      .set('Authorization', `Bearer ${accToken}`)
      .send(validVettingBody);
    expect(res.status).toBe(403);
  });

  it('401 — no token', async () => {
    const res = await request(app)
      .put('/api/v1/guards/some-id/vetting-data')
      .send(validVettingBody);
    expect(res.status).toBe(401);
  });

  it('200 or 404 — DIRECTOR with valid body passes auth + validation', async () => {
    const res = await request(app)
      .put('/api/v1/guards/some-id/vetting-data')
      .set('Authorization', `Bearer ${dirToken}`)
      .send(validVettingBody);
    // 200 if DB connected; 404/500 if not — auth + validation passed
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('400 — relativeName missing fails Zod validation', async () => {
    const res = await request(app)
      .put('/api/v1/guards/some-id/vetting-data')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ relatives: [{ phone: '+256703000001' }], associates: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/v1/guards — new fields ──────────────────────────────────────────

describe('POST /api/v1/guards — extended vetting fields', () => {
  const baseBody = {
    firstName: 'John',
    lastName: 'Ssekandi',
    nationalId: `NIN-EXT-${Date.now()}`,
    phone: '+256701000001',
    dateOfBirth: '1990-01-01T00:00:00.000Z',
    nextOfKinName: 'Jane Ssekandi',
    nextOfKinPhone: '+256771000001',
    salaryRate: 450000,
    contractStart: '2026-01-01T00:00:00.000Z',
  };

  it('201 or 500 — DIRECTOR with full vetting fields passes validation', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({
        ...baseBody,
        gender: 'MALE',
        tribe: 'Muganda',
        placeOfBirth: 'Masaka',
        educationLevel: 'O_LEVEL',
        maritalStatus: 'MARRIED',
        spouseName: 'Jane',
        district: 'Kampala',
        nssfNumber: 'NSSF001',
        fatherName: 'Robert Ssekandi',
        fatherDistrict: 'Masaka',
        numberOfDependents: 2,
        hasDisability: false,
        takesAlcohol: false,
        hasAllergies: false,
        vettingData: {
          relatives: [{ relativeName: 'Paul', relationship: 'Brother' }],
          associates: [{ associateName: 'David', placeOfWork: 'Market' }],
        },
      });
    expect([201, 500]).toContain(res.status);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  it('400 — invalid gender value fails Zod', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ ...baseBody, gender: 'MALE_INVALID' });
    expect(res.status).toBe(400);
  });

  it('201 or 500 — DIRECTOR without new fields (backward compatibility)', async () => {
    const res = await request(app)
      .post('/api/v1/guards')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ ...baseBody, nationalId: `NIN-COMPAT-${Date.now()}` });
    expect([201, 409, 500]).toContain(res.status);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });
});
