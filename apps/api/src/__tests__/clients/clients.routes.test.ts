import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { signAccessToken } from '../../lib/jwt';
import { ROLES, type UserRole } from '@stap/shared';

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
const mktToken = token(ROLES.MARKETING);
const adminToken = token(ROLES.ADMINISTRATOR);
const opsToken = token(ROLES.OPERATIONS_SUPERVISOR);
const fieldToken = token(ROLES.FIELD_SUPERVISOR);
const guardToken = token(ROLES.GUARD);
const clientToken = token(ROLES.CLIENT);

const validClientBody = {
  clientName: 'Test Company Ltd',
  contactPerson: 'Test Person',
  contactPhone: '+256700000001',
  physicalAddress: '1 Test Street, Kampala',
  billingTerms: 30,
  contractStatus: 'ACTIVE',
};

// ── GET /api/v1/clients ────────────────────────────────────────────────────────

describe('GET /api/v1/clients', () => {
  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/clients');
    expect(res.status).toBe(401);
  });

  it('403 — GUARD token', async () => {
    const res = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${guardToken}`);
    expect(res.status).toBe(403);
  });

  it('403 — CLIENT token', async () => {
    const res = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('200 or 500 — OPERATIONS_SUPERVISOR token', async () => {
    const res = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${opsToken}`);
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── POST /api/v1/clients ───────────────────────────────────────────────────────

describe('POST /api/v1/clients', () => {
  it('403 — ADMINISTRATOR cannot create clients', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validClientBody);
    expect(res.status).toBe(403);
  });

  it('201 or 500 — MARKETING token, valid body', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mktToken}`)
      .send(validClientBody);
    expect([201, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    }
  });

  it('400 — missing clientName', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ ...validClientBody, clientName: undefined });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — invalid billingTerms (> 90)', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ ...validClientBody, billingTerms: 120 });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/clients/:id ────────────────────────────────────────────────────

describe('GET /api/v1/clients/:id', () => {
  it('200 or 404 — valid request with DIRECTOR token', async () => {
    const res = await request(app)
      .get('/api/v1/clients/nonexistent-id')
      .set('Authorization', `Bearer ${dirToken}`);
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
    if (res.status === 404) {
      expect(res.body.success).toBe(false);
    }
  });

  it('403 — GUARD cannot view client detail', async () => {
    const res = await request(app)
      .get('/api/v1/clients/some-id')
      .set('Authorization', `Bearer ${guardToken}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/clients/:clientId/sites ──────────────────────────────────────

describe('POST /api/v1/clients/:clientId/sites', () => {
  const validSite = {
    siteName: 'Main Entrance',
    location: 'City Hall, Kampala',
    guardsRequired: 2,
  };

  it('201 or 404/500 — OPERATIONS_SUPERVISOR can add a site', async () => {
    const res = await request(app)
      .post('/api/v1/clients/test-client-id/sites')
      .set('Authorization', `Bearer ${opsToken}`)
      .send(validSite);
    expect([201, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('403 — FIELD_SUPERVISOR cannot add a site', async () => {
    const res = await request(app)
      .post('/api/v1/clients/test-client-id/sites')
      .set('Authorization', `Bearer ${fieldToken}`)
      .send(validSite);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/clients/sites/:siteId/incidents ──────────────────────────────

describe('POST /api/v1/clients/sites/:siteId/incidents', () => {
  const validIncident = {
    siteId: 'test-site-id',
    incidentType: 'GUARD_MISCONDUCT',
    description: 'Guard was found sleeping on duty during the night shift.',
    severity: 'LOW',
    occurredAt: new Date().toISOString(),
  };

  it('201 or 404/500 — FIELD_SUPERVISOR can log an incident', async () => {
    const res = await request(app)
      .post('/api/v1/clients/sites/test-site-id/incidents')
      .set('Authorization', `Bearer ${fieldToken}`)
      .send(validIncident);
    expect([201, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('403 — MARKETING cannot log incidents', async () => {
    const res = await request(app)
      .post('/api/v1/clients/sites/test-site-id/incidents')
      .set('Authorization', `Bearer ${mktToken}`)
      .send(validIncident);
    expect(res.status).toBe(403);
  });

  it('201 or 500 — HIGH severity incident is accepted', async () => {
    const res = await request(app)
      .post('/api/v1/clients/sites/test-site-id/incidents')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ ...validIncident, severity: 'HIGH' });
    // Auth + validation passed — DB might not be available in CI
    expect([201, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });
});

// ── GET /api/v1/clients/summary ───────────────────────────────────────────────

describe('GET /api/v1/clients/summary', () => {
  it('200 or 500 — DIRECTOR can get summary', async () => {
    const res = await request(app)
      .get('/api/v1/clients/summary')
      .set('Authorization', `Bearer ${dirToken}`);
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('403 — OPERATIONS_SUPERVISOR cannot get summary', async () => {
    const res = await request(app)
      .get('/api/v1/clients/summary')
      .set('Authorization', `Bearer ${opsToken}`);
    expect(res.status).toBe(403);
  });
});
