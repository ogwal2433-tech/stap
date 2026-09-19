import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { admit, resetSecurityLogThrottle } from '../../lib/securityLog';

/**
 * Refused requests reach the audit log with who, what, when, role and what was
 * lacked — once each, throttled, and without the expired-token noise.
 *
 * The log is off under test by default so the other suites do not fill the
 * development database; this file turns it on for itself. Other test files run
 * in their own workers, where it stays off, so every security row written after
 * `since` is this file's, and is removed afterwards.
 */
process.env.SECURITY_LOG = 'on';

const EVENTS = ['PERMISSION_DENIED', 'ROLE_DENIED', 'ACCESS_DENIED', 'UNAUTHORISED_ACCESS', 'INVALID_TOKEN'];
const since = new Date();

let controlRoom = '';
let controlRoomId = '';
let director = '';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

/** Writes are fire-and-forget, so wait briefly for them to land. */
async function rows(where: Record<string, unknown>, expectAtLeast = 1) {
  for (let i = 0; i < 20; i++) {
    const found = await prisma.auditLog.findMany({ where: { ...where, createdAt: { gte: since } } });
    if (found.length >= expectAtLeast) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  return prisma.auditLog.findMany({ where: { ...where, createdAt: { gte: since } } });
}

/** Lets any stray write land before counting that there was none. */
const settle = () => new Promise((r) => setTimeout(r, 600));

beforeAll(async () => {
  const cr = await prisma.user.findFirst({ where: { role: 'CONTROL_ROOM', status: 'ACTIVE' }, select: { id: true } });
  const d  = await prisma.user.findFirst({ where: { role: 'DIRECTOR', status: 'ACTIVE' }, select: { id: true } });
  if (!cr || !d) throw new Error('These tests need seeded CONTROL_ROOM and DIRECTOR accounts.');
  controlRoomId = cr.id;
  controlRoom   = bearer(cr.id, 'CONTROL_ROOM');
  director      = bearer(d.id, 'DIRECTOR');
});

beforeEach(() => resetSecurityLogThrottle());

afterAll(async () => {
  // The last test's own refusal may still be in flight — let it land first.
  await settle();
  await prisma.auditLog.deleteMany({ where: { action: { in: EVENTS }, createdAt: { gte: since } } });
});

describe('what is recorded', () => {
  it('a missing permission: who, role, what they lacked, the request, the IP — once', async () => {
    const path = '/api/v1/clients/zz-sec-perm';
    const res = await request(app).patch(path).set('Authorization', controlRoom).send({ clientName: 'x' });
    expect(res.status).toBe(403);

    const [row] = await rows({ action: 'PERMISSION_DENIED', path });
    expect(row).toMatchObject({
      userId: controlRoomId, role: 'CONTROL_ROOM', required: 'clients.edit',
      method: 'PATCH', path, entity: 'clients', entityId: 'zz-sec-perm',
    });
    expect(row.ipAddress).toBeTruthy();

    // Recorded where it was decided, and not a second time by the error handler.
    await settle();
    expect(await rows({ path }, 99)).toHaveLength(1);
  });

  it('a role check — most routes still gate by role', async () => {
    const path = '/api/v1/guards/dashboard';
    expect((await request(app).get(path).set('Authorization', controlRoom)).status).toBe(403);
    const [row] = await rows({ action: 'ROLE_DENIED', path });
    expect(row.role).toBe('CONTROL_ROOM');
    expect(row.required).toContain('DIRECTOR');
  });

  it('a refusal raised by a route itself, through the global handler', async () => {
    const path = '/api/v1/deleted-records';
    const res = await request(app).get(path).query({ type: 'client' }).set('Authorization', controlRoom);
    expect(res.status).toBe(403);
    const [row] = await rows({ action: 'ACCESS_DENIED', path });
    expect(row.role).toBe('CONTROL_ROOM');
    // Never the query string.
    expect(row.path).not.toContain('?');
  });

  it('a protected route reached with no token', async () => {
    const path = '/api/v1/guards';
    expect((await request(app).get(path)).status).toBe(401);
    const [row] = await rows({ action: 'UNAUTHORISED_ACCESS', path });
    expect(row.userId).toBeNull();
    expect(row.role).toBeNull();
    expect((row.newValue as { reason: string }).reason).toBe('No token');
  });

  it('a forged or malformed token', async () => {
    const path = '/api/v1/sites';
    const forged = jwt.sign({ sub: 'x', role: 'DIRECTOR' }, 'not-the-secret-'.repeat(4));
    expect((await request(app).get(path).set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    expect((await request(app).get(`${path}/x`).set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);

    const found = await rows({ action: 'INVALID_TOKEN', path: { startsWith: path } }, 2);
    expect(found.map((r) => (r.newValue as { reason: string }).reason).join(' | ')).toMatch(/invalid signature/);
  });
});

describe('what is not', () => {
  it('an expired token — how every session ends', async () => {
    const path = '/api/v1/zones';
    const expired = jwt.sign(
      { sub: controlRoomId, role: 'CONTROL_ROOM', name: 'CI', email: 'ci@test.local', clientId: null },
      process.env.JWT_SECRET!, { expiresIn: -10 },
    );
    expect((await request(app).get(path).set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    await settle();
    expect(await rows({ path }, 99)).toHaveLength(0);
  });

  it('a 401 outside authenticate — /auth/refresh answers it to every signed-out visitor', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
    await settle();
    expect(await rows({ path: '/api/v1/auth/refresh' }, 99)).toHaveLength(0);
  });

  it('the same refusal again within a minute', async () => {
    const path = '/api/v1/clients/zz-sec-repeat';
    for (let i = 0; i < 3; i++) {
      await request(app).patch(path).set('Authorization', controlRoom).send({ clientName: 'x' });
    }
    await settle();
    expect(await rows({ path }, 99)).toHaveLength(1);
  });
});

describe('throttle', () => {
  it('caps an anonymous IP at 30 events a minute, across different routes', () => {
    const t = 1_000_000;
    let admitted = 0;
    for (let i = 0; i < 50; i++) if (admit(`UNAUTHORISED_ACCESS|9.9.9.9|GET /r${i}`, '9.9.9.9', true, t)) admitted++;
    expect(admitted).toBe(30);
    // A new window lets it through again.
    expect(admit('UNAUTHORISED_ACCESS|9.9.9.9|GET /later', '9.9.9.9', true, t + 61_000)).toBe(true);
  });

  it('does not cap a signed-in user across different routes', () => {
    const t = 2_000_000;
    let admitted = 0;
    for (let i = 0; i < 50; i++) if (admit(`PERMISSION_DENIED|user-1|GET /r${i}`, '8.8.8.8', false, t)) admitted++;
    expect(admitted).toBe(50);
  });
});

describe('GET /audit-logs/security', () => {
  it('lists the events with a summary by role, for audit.log holders', async () => {
    const path = '/api/v1/clients/zz-sec-endpoint';
    await request(app).patch(path).set('Authorization', controlRoom).send({ clientName: 'x' });
    await rows({ path });

    const res = await request(app).get('/api/v1/audit-logs/security')
      .query({ action: 'PERMISSION_DENIED', role: 'CONTROL_ROOM' })
      .set('Authorization', director);
    expect(res.status).toBe(200);
    const entry = res.body.data.data.find((e: { path: string }) => e.path === path);
    expect(entry).toMatchObject({ action: 'PERMISSION_DENIED', role: 'CONTROL_ROOM', required: 'clients.edit', method: 'PATCH' });
    expect(entry.user.id).toBe(controlRoomId);
    expect(res.body.data.summary.byRole.map((r: { role: string }) => r.role)).toContain('CONTROL_ROOM');
  });

  it('refuses a role without audit.log', async () => {
    expect((await request(app).get('/api/v1/audit-logs/security').set('Authorization', controlRoom)).status).toBe(403);
  });
});
