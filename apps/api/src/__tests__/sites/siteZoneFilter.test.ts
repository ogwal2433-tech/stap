import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * GET /sites?zoneId= backs the attendance page's site picker.
 *
 * It lists every site in a zone, not only those with someone deployed today —
 * a supervisor checking whether a site was rostered at all has to be able to
 * pick it and see that it is empty. The daily sheet cannot answer that, because
 * a site with no deployments is simply absent from it.
 */

const ROLE = 'ZZ_SITE_ZONE_FILTER';

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;

const token = bearer(`ci-${ROLE}`, ROLE);
let viewPermissionId = '';

beforeAll(async () => {
  viewPermissionId = (
    await prisma.permission.findUniqueOrThrow({ where: { key: 'sites.view' }, select: { id: true } })
  ).id;
  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.role.create({
    data: { name: ROLE, label: 'Site Zone Filter Test', isSystem: false, isActive: true },
  });
  await prisma.rolePermission.create({ data: { role: ROLE, permissionId: viewPermissionId } });
  clearPermissionCache(ROLE);
});

afterAll(async () => {
  await prisma.role.deleteMany({ where: { name: ROLE } });
  clearPermissionCache(ROLE);
});

describe('GET /api/v1/sites — zone filter', () => {
  it('returns every site when no zone is asked for', async () => {
    const res = await request(app)
      .get('/api/v1/sites')
      .query({ limit: 500 })
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(await prisma.site.count());
  });

  it('narrows to one zone when asked', async () => {
    const zone = await prisma.zone.findFirst({ select: { id: true } });
    if (!zone) return;

    const res = await request(app)
      .get('/api/v1/sites')
      .query({ zoneId: zone.id, limit: 500 })
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(
      await prisma.site.count({ where: { zoneId: zone.id } }),
    );
    for (const site of res.body.data) {
      expect(site.zone?.id ?? null, site.siteName).toBe(zone.id);
    }
  });

  it('lists a site in the zone even with nobody deployed there today', async () => {
    const zone = await prisma.zone.findFirst({ select: { id: true } });
    if (!zone) return;

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const quiet = await prisma.site.findFirst({
      where: {
        zoneId:      zone.id,
        deployments: { none: { date: { gte: start, lt: end } } },
      },
      select: { id: true, siteName: true },
    });
    if (!quiet) return; // every site in this zone is deployed today

    const res = await request(app)
      .get('/api/v1/sites')
      .query({ zoneId: zone.id, limit: 500 })
      .set('Authorization', token);

    // This is the case the daily sheet cannot serve.
    expect(res.body.data.map((s: { id: string }) => s.id)).toContain(quiet.id);
  });

  it('still answers "unzoned" when both are given, as the narrower request', async () => {
    const zone = await prisma.zone.findFirst({ select: { id: true } });
    if (!zone) return;

    const res = await request(app)
      .get('/api/v1/sites')
      .query({ zoneId: zone.id, unzoned: 'true', limit: 500 })
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(await prisma.site.count({ where: { zoneId: null } }));
  });

  it('refuses a role without sites.view', async () => {
    await prisma.rolePermission.deleteMany({ where: { role: ROLE } });
    clearPermissionCache(ROLE);

    const res = await request(app).get('/api/v1/sites').set('Authorization', token);
    expect(res.status).toBe(403);

    await prisma.rolePermission.create({ data: { role: ROLE, permissionId: viewPermissionId } });
    clearPermissionCache(ROLE);
  });
});
