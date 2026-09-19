import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';
import { clearPermissionCache } from '../../middleware/permissions';

/**
 * Editing a client, end to end against the real database.
 *
 * Two things were broken. Saving a client whose contact had no phone, or a
 * phone typed with spaces, failed validation on a field with no input of its
 * own. And the edit routes checked a role list, so a role granted clients.edit
 * was refused anyway.
 *
 * The client here is shaped like one from the Excel import — placeholder
 * contact, no phone — and deleted afterwards. A grant added for the test is
 * removed again; one that already existed is left alone.
 */

const BASE = '/api/v1/clients';
const NAME = 'ZZ Edit Test Ltd';
const ROLE = 'ADMINISTRATOR';

let clientId = '';
let actorId = '';
let actorEmail = '';
let editPermissionId = '';
let addedGrant = false;

const as = (role: string) =>
  `Bearer ${signAccessToken({ sub: actorId, role, name: 'CI', email: actorEmail, clientId: null } as never)}`;

/** Exactly what ClientFormPage sends on save for an imported client. */
const formPayload = (o: Record<string, unknown> = {}) => ({
  clientName:      NAME,
  contactPerson:   'To be confirmed',
  contactPhone:    '',
  email:           '',
  physicalAddress: 'Plot 1 Test Road',
  billingAddress:  '',
  billingTerms:    45,
  contractStatus:  'ACTIVE',
  tin:             '',
  vatRegistered:   false,
  leadSource:      '',
  referredBy:      '',
  leadStatus:      'CONVERTED',
  ...o,
});

beforeAll(async () => {
  const director = await prisma.user.findFirst({
    where:  { role: 'DIRECTOR', status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (!director) throw new Error('These tests need a seeded DIRECTOR account.');
  actorId = director.id;
  actorEmail = director.email;

  const client = await prisma.client.create({
    data: {
      clientName:      NAME,
      contactPerson:   'To be confirmed',
      contactPhone:    '',
      physicalAddress: 'Plot 1 Test Road',
      billingTerms:    30,
      contractStatus:  'ACTIVE',
      leadStatus:      'CONVERTED',
      vatRegistered:   false,
      contacts: { create: [{ contactType: 'PRIMARY', name: 'To be confirmed', isPrimary: true }] },
    },
    select: { id: true },
  });
  clientId = client.id;

  editPermissionId = (await prisma.permission.findUniqueOrThrow({
    where: { key: 'clients.edit' }, select: { id: true },
  })).id;
});

afterAll(async () => {
  await prisma.clientContact.deleteMany({ where: { client: { clientName: NAME } } });
  await prisma.client.deleteMany({ where: { clientName: NAME } });
  if (addedGrant) {
    await prisma.rolePermission.deleteMany({ where: { role: ROLE, permissionId: editPermissionId } });
  }
  clearPermissionCache(ROLE);
});

describe('saving a client', () => {
  it('saves the form as sent for a client with no contact phone', async () => {
    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as('DIRECTOR')).send(formPayload());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.billingTerms).toBe(45);
  });

  it.each([
    ['0772 123 456',     '0772123456'],
    ['+256-417-444444',  '+256417444444'],
    ['(0772) 123.456',   '0772123456'],
  ])('accepts "%s" and stores the digits %s', async (typed, stored) => {
    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as('DIRECTOR')).send({ contactPhone: typed });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.contactPhone).toBe(stored);
  });

  it('still refuses something that is not a phone number, naming the field', async () => {
    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as('DIRECTOR')).send({ contactPhone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.contactPhone?.[0]).toMatch(/10 to 15 digits/);
  });

  it('changes only the fields sent', async () => {
    const before = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as('DIRECTOR')).send({ billingTerms: 60 });
    expect(res.status).toBe(200);

    const after = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.billingTerms).toBe(60);
    // A partial schema must not inject its defaults into a one-field update.
    expect(after.leadStatus).toBe(before.leadStatus);
    expect(after.contractStatus).toBe(before.contractStatus);
    expect(after.vatRegistered).toBe(before.vatRegistered);
    expect(after.contactPerson).toBe(before.contactPerson);
    expect(after.clientName).toBe(before.clientName);
  });
});

describe('who may edit — the permission, not a role list', () => {
  it('refuses a role without clients.edit, naming the permission', async () => {
    const held = await prisma.rolePermission.findUnique({
      where: { role_permissionId: { role: ROLE, permissionId: editPermissionId } },
    });
    if (held) return; // this database already grants it; the next test covers the allow

    clearPermissionCache(ROLE);
    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as(ROLE)).send({ billingTerms: 30 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Missing permission/i);
  });

  it('lets a role outside the old list edit once it is granted clients.edit', async () => {
    const held = await prisma.rolePermission.findUnique({
      where: { role_permissionId: { role: ROLE, permissionId: editPermissionId } },
    });
    if (!held) {
      await prisma.rolePermission.create({ data: { role: ROLE, permissionId: editPermissionId } });
      addedGrant = true;
    }
    clearPermissionCache(ROLE);

    const res = await request(app).patch(`${BASE}/${clientId}`)
      .set('Authorization', as(ROLE)).send({ billingTerms: 30 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('applies the same permission to the client\'s contacts', async () => {
    const res = await request(app).post(`${BASE}/${clientId}/contacts`)
      .set('Authorization', as(ROLE))
      .send({ contactType: 'OPERATIONS', name: 'Site Manager', phone: '0772 000 111', isPrimary: false });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('keeps create and edit for Marketing Head and Sales, who had them by role', async () => {
    const rows = await prisma.rolePermission.findMany({
      where:  { role: { in: ['MARKETING_HEAD', 'SALES'] }, permission: { key: { in: ['clients.create', 'clients.edit'] } } },
      select: { role: true, permission: { select: { key: true } } },
    });
    const held = new Set(rows.map((r) => `${r.role}:${r.permission.key}`));

    for (const role of ['MARKETING_HEAD', 'SALES']) {
      expect(held, `${role} lost clients.create`).toContain(`${role}:clients.create`);
      expect(held, `${role} lost clients.edit`).toContain(`${role}:clients.edit`);
    }
  });
});
