/**
 * Integration tests for the one-deployment-per-guard-per-date rule.
 *
 * These tests hit the real database and real Express app — no mocking.
 * They verify that both the service layer and the DB unique constraint
 * enforce the rule end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

// ── IDs used for all seeded data ───────────────────────────────────────────────
const IDS = {
  director:   'depint-director',
  supervisor: 'depint-supervisor',
  guard1:     'depint-guard1',
  guard2:     'depint-guard2',
  client:     'depint-client',
  site:       'depint-site',
  shiftCode:  'INTTEST',
};

// Use a far-future date so the test data never conflicts with real deployments
const TEST_DATE  = '2099-06-15T00:00:00.000Z';
const TEST_DATE2 = '2099-06-16T00:00:00.000Z';

let directorToken: string;

const ROSTER_BODY = (guardIds: string[], date = TEST_DATE) => ({
  siteId:         IDS.site,
  guardIds,
  supervisorId:   IDS.supervisor,
  shiftType:      IDS.shiftCode,
  startDate:      date,
  deploymentType: 'UNARMED',
  recurring:      false,
});

// ── Seed data ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);

  // Director — used for the API token
  await prisma.user.upsert({
    where:  { id: IDS.director },
    create: { id: IDS.director, name: 'DepInt Director', email: 'depint.director@security360.test', passwordHash: hash, role: 'DIRECTOR', status: 'ACTIVE' },
    update: {},
  });

  // Operations supervisor — required by createRoster() role validation
  await prisma.user.upsert({
    where:  { id: IDS.supervisor },
    create: { id: IDS.supervisor, name: 'DepInt Supervisor', email: 'depint.supervisor@security360.test', passwordHash: hash, role: 'OPERATIONS_SUPERVISOR', status: 'ACTIVE' },
    update: {},
  });

  // Shift type — must exist and be active
  await prisma.shiftTypeConfig.upsert({
    where:  { code: IDS.shiftCode },
    create: { code: IDS.shiftCode, name: 'Integration Test Shift', isActive: true, displayOrder: 99 },
    update: { isActive: true },
  });

  // Client
  await prisma.client.upsert({
    where:  { id: IDS.client },
    create: {
      id:              IDS.client,
      clientName:      'DepInt Client',
      contactPerson:   'Contact Person',
      contactPhone:    '+256700000099',
      physicalAddress: '1 Test Street',
      billingTerms:    30,
    },
    update: {},
  });

  // Site
  await prisma.site.upsert({
    where:  { id: IDS.site },
    create: {
      id:               IDS.site,
      clientId:         IDS.client,
      siteName:         'DepInt Test Site',
      location:         'Test Location',
      allowedShiftTypes: [],
    },
    update: {},
  });

  // Guard 1
  await prisma.guard.upsert({
    where:  { id: IDS.guard1 },
    create: {
      id:               IDS.guard1,
      firstName:        'DepIntA',
      lastName:         'Guard',
      phone:            '+256700000091',
      dateOfBirth:      new Date('1990-01-01'),
      nextOfKinName:    'Kin A',
      nextOfKinPhone:   '+256700000092',
      salaryRate:       400000,
      contractStart:    new Date('2026-01-01'),
      employmentStatus: 'ACTIVE',
    },
    update: {},
  });

  // Guard 2 (fresh, never deployed on test dates)
  await prisma.guard.upsert({
    where:  { id: IDS.guard2 },
    create: {
      id:               IDS.guard2,
      firstName:        'DepIntB',
      lastName:         'Guard',
      phone:            '+256700000093',
      dateOfBirth:      new Date('1990-01-01'),
      nextOfKinName:    'Kin B',
      nextOfKinPhone:   '+256700000094',
      salaryRate:       400000,
      contractStart:    new Date('2026-01-01'),
      employmentStatus: 'ACTIVE',
    },
    update: {},
  });

  // Obtain director token
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'depint.director@security360.test', password: 'testpass123' });
  directorToken = res.body.data?.accessToken;
});

afterAll(async () => {
  // Cleanup in dependency order
  await prisma.deployment.deleteMany({
    where: { OR: [{ guardId: IDS.guard1 }, { guardId: IDS.guard2 }] },
  });
  await prisma.deploymentHistory.deleteMany({
    where: { OR: [{ guardId: IDS.guard1 }, { guardId: IDS.guard2 }] },
  });
  await prisma.guard.deleteMany({ where: { id: { in: [IDS.guard1, IDS.guard2] } } });
  await prisma.site.deleteMany({ where: { id: IDS.site } });
  await prisma.client.deleteMany({ where: { id: IDS.client } });
  await prisma.shiftTypeConfig.deleteMany({ where: { code: IDS.shiftCode } });
  await prisma.user.deleteMany({ where: { id: { in: [IDS.director, IDS.supervisor] } } });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Deployment uniqueness rule — integration', () => {
  it('TEST A: first deployment for a guard succeeds → 201, created=1', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/roster')
      .set('Authorization', `Bearer ${directorToken}`)
      .send(ROSTER_BODY([IDS.guard1]));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.conflicts).toHaveLength(0);
  });

  it('TEST B: second deployment for same guard on same date → 409, created=0 with conflict detail', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/roster')
      .set('Authorization', `Bearer ${directorToken}`)
      .send(ROSTER_BODY([IDS.guard1])); // same guard, same date as TEST A

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.conflicts).toHaveLength(1);
    expect(res.body.data.conflicts[0].guardId).toBe(IDS.guard1);
    expect(res.body.data.conflicts[0].guardName).toContain('DepIntA');
    expect(res.body.data.conflicts[0].existingSite).toBe('DepInt Test Site');
  });

  it('TEST C: same guard deployed on a different date → 201, created=1', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/roster')
      .set('Authorization', `Bearer ${directorToken}`)
      .send(ROSTER_BODY([IDS.guard1], TEST_DATE2)); // different date

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.conflicts).toHaveLength(0);
  });

  it('TEST D: two guards, one already deployed → 200, created=1, conflicts=[1 entry]', async () => {
    // Guard1 was deployed on TEST_DATE in TEST A; Guard2 is fresh
    const res = await request(app)
      .post('/api/v1/attendance/roster')
      .set('Authorization', `Bearer ${directorToken}`)
      .send(ROSTER_BODY([IDS.guard1, IDS.guard2], TEST_DATE));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.conflicts).toHaveLength(1);
    expect(res.body.data.conflicts[0].guardId).toBe(IDS.guard1);
    expect(res.body.data.skipped).toBe(1);
  });

  it('TEST E: DB unique constraint rejects a direct duplicate insert (P2002)', async () => {
    const targetDate = new Date('2099-06-17T00:00:00.000Z');

    // First insert — must succeed
    await prisma.deployment.create({
      data: {
        guardId:      IDS.guard2,
        siteId:       IDS.site,
        supervisorId: IDS.supervisor,
        shiftType:    IDS.shiftCode,
        date:         targetDate,
        deploymentType: 'UNARMED',
      },
    });

    // Second insert with identical guardId + date — DB must reject it
    await expect(
      prisma.deployment.create({
        data: {
          guardId:      IDS.guard2,
          siteId:       IDS.site,
          supervisorId: IDS.supervisor,
          shiftType:    IDS.shiftCode,
          date:         targetDate,
          deploymentType: 'UNARMED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
