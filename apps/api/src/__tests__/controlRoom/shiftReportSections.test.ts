import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';

/**
 * Sections 8 and 9 of the handover, end to end against the real database.
 *
 * Everything is written as a DRAFT: a submitted report consumes an SHR- number
 * that is printed on a sheet, and a test must not burn one. Reports created
 * here are deleted afterwards.
 */

const BASE = '/api/v1/shift-reports';

let token = '';
const created: string[] = [];

const pendingMatter = {
  id:                'zz-pm-1',
  description:       'Gate lock at Kololo site is broken — locksmith due at 09:00',
  responsiblePerson: 'Okello Emmanuel',
  priority:          'HIGH',
  addedAt:           '2026-09-12T04:00:00.000Z',
};

const motorcycle = {
  id:           'zz-mc-1',
  zone:         'Zone 1',
  motorcycleId: 'UBD 123X',
  riderName:    'Mukasa Peter',
  unreachablePeriods: [
    { id: 'zz-u-1', from: '14:30', to: '15:15', reason: 'Phone off' },
  ],
  longParkedPeriods: [
    { id: 'zz-lp-1', from: '16:00', to: '17:30', location: 'Main gate', duration: '1h 30m' },
  ],
};

const body = (extra: Record<string, unknown> = {}) => ({
  date:     '2026-09-12',
  shift:    'DAY',
  timeFrom: '06:00',
  timeTo:   '18:00',
  status:   'DRAFT',
  deploymentRows:   [],
  incidents:        [],
  supervisionRows:  [],
  clientComms:      [],
  gunsDeployed:     [],
  disciplineIssues: [],
  ...extra,
});

beforeAll(async () => {
  // Whoever may file a report — the role list differs per deployment, and the
  // controller id is a foreign key, so the token must name a real user.
  const grant = await prisma.rolePermission.findFirst({
    where:  { permission: { key: 'shift_report.create' } },
    select: { role: true },
  });
  if (!grant) throw new Error('No role holds shift_report.create — is the database seeded?');

  const user = await prisma.user.findFirst({
    where:  { role: grant.role, status: 'ACTIVE' },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!user) throw new Error(`These tests need an active ${grant.role} account.`);

  token = `Bearer ${signAccessToken({
    sub: user.id, role: user.role, name: user.name, email: user.email, clientId: null,
  } as never)}`;
});

afterAll(async () => {
  if (created.length) {
    await prisma.shiftHandoverReport.deleteMany({ where: { id: { in: created } } });
  }
});

describe('pending matters and motorcycle report', () => {
  it('saves both sections and reads them back unchanged', async () => {
    const res = await request(app).post(BASE).set('Authorization', token)
      .send(body({ pendingMatters: [pendingMatter], motorcycleReport: [motorcycle] }));

    expect(res.status).toBe(201);
    created.push(res.body.data.id);

    expect(res.body.data.pendingMatters).toEqual([pendingMatter]);
    expect(res.body.data.motorcycleReport).toEqual([motorcycle]);

    // Read back through a second request: the create response could be echoing
    // the payload rather than what reached the column.
    const get = await request(app).get(`${BASE}/${res.body.data.id}`).set('Authorization', token);
    expect(get.status).toBe(200);
    expect(get.body.data.pendingMatters[0].priority).toBe('HIGH');
    expect(get.body.data.motorcycleReport[0].unreachablePeriods[0].reason).toBe('Phone off');
    expect(get.body.data.motorcycleReport[0].longParkedPeriods[0].duration).toBe('1h 30m');
  });

  it('returns empty arrays for a report written before these sections existed', async () => {
    // Both columns left null, as every pre-existing row has them.
    const controller = await prisma.user.findFirstOrThrow({ where: { status: 'ACTIVE' }, select: { id: true } });
    const legacy = await prisma.shiftHandoverReport.create({
      data: {
        date: new Date('2026-01-05'), shift: 'NIGHT', controllerId: controller.id,
        timeFrom: '18:00', timeTo: '06:00', status: 'DRAFT',
        deploymentRows: [], incidents: [], supervisionRows: [],
        clientComms: [], gunsDeployed: [], disciplineIssues: [],
      },
      select: { id: true, pendingMatters: true, motorcycleReport: true },
    });
    created.push(legacy.id);
    expect(legacy.pendingMatters).toBeNull();

    const res = await request(app).get(`${BASE}/${legacy.id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.pendingMatters).toEqual([]);
    expect(res.body.data.motorcycleReport).toEqual([]);
  });

  it('defaults both sections to empty when the form omits them', async () => {
    const res = await request(app).post(BASE).set('Authorization', token).send(body());
    expect(res.status).toBe(201);
    created.push(res.body.data.id);
    expect(res.body.data.pendingMatters).toEqual([]);
    expect(res.body.data.motorcycleReport).toEqual([]);
  });

  it('rejects a priority that is not one of the three levels', async () => {
    const res = await request(app).post(BASE).set('Authorization', token)
      .send(body({ pendingMatters: [{ ...pendingMatter, priority: 'URGENT' }] }));
    expect(res.status).toBe(400);
  });

  it('keeps both sections when a draft is edited', async () => {
    const draft = await request(app).post(BASE).set('Authorization', token)
      .send(body({ pendingMatters: [pendingMatter], motorcycleReport: [motorcycle] }));
    created.push(draft.body.data.id);

    const edited = await request(app).patch(`${BASE}/${draft.body.data.id}`)
      .set('Authorization', token)
      .send(body({
        pendingMatters: [{ ...pendingMatter, priority: 'LOW', responsiblePerson: 'Nakato Sarah' }],
        motorcycleReport: [{ ...motorcycle, unreachablePeriods: [] }],
      }));

    expect(edited.status).toBe(200);
    expect(edited.body.data.pendingMatters[0].priority).toBe('LOW');
    expect(edited.body.data.pendingMatters[0].responsiblePerson).toBe('Nakato Sarah');
    expect(edited.body.data.motorcycleReport[0].unreachablePeriods).toEqual([]);
    expect(edited.body.data.motorcycleReport[0].longParkedPeriods).toHaveLength(1);
  });
});
