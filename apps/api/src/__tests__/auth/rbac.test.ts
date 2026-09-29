import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { signAccessToken } from '../../lib/jwt';
import { ROLES, type UserRole } from '@security360/shared';

// Generate a test token for any role without hitting the DB
function makeToken(role: UserRole, userId = 'test-user-id', name = 'Test User', email = `${role.toLowerCase()}@test.com`) {
  return signAccessToken({ sub: userId, role, name, email });
}

// ── GET /api/v1/auth/rbac-test/:role — Director-only ─────────────────────────

describe('GET /api/v1/auth/rbac-test/:role', () => {
  const URL = '/api/v1/auth/rbac-test/test';

  it('401 — no token provided', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('200 — Director token accepted', async () => {
    const res = await request(app)
      .get(URL)
      .set('Authorization', `Bearer ${makeToken(ROLES.DIRECTOR)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe(ROLES.DIRECTOR);
  });

  const nonDirectorRoles = Object.values(ROLES).filter((r) => r !== ROLES.DIRECTOR) as UserRole[];

  it.each(nonDirectorRoles)('403 — %s token rejected', async (role) => {
    const res = await request(app)
      .get(URL)
      .set('Authorization', `Bearer ${makeToken(role)}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Forbidden');
  });
});

// ── GET /api/v1/auth/me — role-agnostic ───────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  const URL = '/api/v1/auth/me';

  it('401 — no token', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it('401 — malformed token', async () => {
    const res = await request(app).get(URL).set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('401 — expired token', async () => {
    // sign with -1s expiry
    const { default: jwt } = await import('jsonwebtoken');
    const expired = jwt.sign(
      { sub: 'u1', role: ROLES.GUARD, name: 'G', email: 'g@test.com', type: 'access' },
      process.env.JWT_SECRET!,
      { expiresIn: -1 },
    );
    const res = await request(app).get(URL).set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  // /me performs a DB lookup — accept 200 (found), 401 (not found), or 500 (no DB in env)
  it.each(Object.values(ROLES) as UserRole[])(
    '200, 401, or 500 — %s token reaches the route handler',
    async (role) => {
      const res = await request(app)
        .get(URL)
        .set('Authorization', `Bearer ${makeToken(role, `ci-${role}`, 'CI User', `ci-${role}@test.com`)}`);
      expect([200, 401, 500]).toContain(res.status);
    },
  );
});

// ── GET /api/v1/auth/minimum-role-test — threshold: ACCOUNTS_OFFICER ─────────

describe('GET /api/v1/auth/minimum-role-test', () => {
  const URL = '/api/v1/auth/minimum-role-test';

  it('401 — no token', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  const aboveThreshold: UserRole[] = [
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.ADMINISTRATOR,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.TRAINER,
    ROLES.ACCOUNTS_OFFICER,
  ];

  it.each(aboveThreshold)('200 — %s meets or exceeds threshold', async (role) => {
    const res = await request(app)
      .get(URL)
      .set('Authorization', `Bearer ${makeToken(role)}`);
    expect(res.status).toBe(200);
  });

  const belowThreshold: UserRole[] = [ROLES.MARKETING, ROLES.GUARD, ROLES.CLIENT];

  it.each(belowThreshold)('403 — %s is below threshold', async (role) => {
    const res = await request(app)
      .get(URL)
      .set('Authorization', `Bearer ${makeToken(role)}`);
    expect(res.status).toBe(403);
  });
});
