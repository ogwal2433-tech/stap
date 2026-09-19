import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';

/**
 * Soft delete and invoice voiding, end to end against the real database.
 *
 * Fixtures are named "ZZ SoftDel …" (clients, sites), carry a ZZSD national id
 * (guards) or a zz-softdel email (staff), and are removed afterwards with
 * deleteMany — which the read filter does not touch, so deleted fixtures are
 * cleaned up too. The one invoice voided here is put back exactly as it was.
 */

const PREFIX = 'ZZ SoftDel';
const EMAIL  = 'zz-softdel-staff@test.local';
const NIN    = 'ZZSD';

let director = '';
let actorId  = '';
let cleanId  = '';   // a client with nothing underneath it
let busyId   = '';   // a client with a site and a contract
let siteId   = '';
let contractId = '';
let voided: { id: string; status: string; outstandingBalance: number } | null = null;

const bearer = (sub: string, role: string) =>
  `Bearer ${signAccessToken({ sub, role, name: 'CI', email: 'ci@test.local', clientId: null } as never)}`;
const as = () => ({ Authorization: director });

const client = (name: string) => prisma.client.create({
  data: {
    clientName: name, contactPerson: 'CI Contact', contactPhone: '', physicalAddress: 'Plot 1 Test Road',
    billingTerms: 30, contractStatus: 'ACTIVE', leadStatus: 'CONVERTED', vatRegistered: false,
  },
  select: { id: true },
});

beforeAll(async () => {
  const d = await prisma.user.findFirst({ where: { role: 'DIRECTOR', status: 'ACTIVE' }, select: { id: true } });
  if (!d) throw new Error('These tests need a seeded DIRECTOR account.');
  actorId  = d.id;
  director = bearer(d.id, 'DIRECTOR');

  cleanId = (await client(`${PREFIX} Clean Ltd`)).id;
  busyId  = (await client(`${PREFIX} Busy Ltd`)).id;
  siteId  = (await prisma.site.create({ data: { clientId: busyId, siteName: `${PREFIX} Gate`, location: 'Kampala' } })).id;
  contractId = (await prisma.contract.create({
    data: { clientId: busyId, contractStart: new Date('2026-01-01'), contractEnd: new Date('2026-12-31'), guardsRequired: 1 },
  })).id;
});

afterAll(async () => {
  const byClient = { client: { clientName: { startsWith: PREFIX } } };
  await prisma.contract.deleteMany({ where: byClient });
  await prisma.site.deleteMany({ where: byClient });
  await prisma.clientContact.deleteMany({ where: byClient });
  await prisma.client.deleteMany({ where: { clientName: { startsWith: PREFIX } } });
  await prisma.guard.deleteMany({ where: { nationalId: { startsWith: NIN } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  if (voided) {
    await prisma.invoice.update({
      where: { id: voided.id },
      data:  { status: voided.status, outstandingBalance: voided.outstandingBalance, voidedAt: null, voidedById: null, voidReason: null },
    });
  }
});

describe('the read filter', () => {
  it('hides a deleted client from every read, unless the query names deletedAt', async () => {
    await prisma.client.update({ where: { id: cleanId }, data: { deletedAt: new Date() } });
    try {
      expect(await prisma.client.findUnique({ where: { id: cleanId } })).toBeNull();
      expect(await prisma.client.findMany({ where: { clientName: `${PREFIX} Clean Ltd` } })).toHaveLength(0);
      expect(await prisma.client.count({ where: { id: cleanId } })).toBe(0);
      // The two ways past it: ask for deleted rows, or for every row.
      expect(await prisma.client.findFirst({ where: { id: cleanId, deletedAt: { not: null } } })).not.toBeNull();
      expect(await prisma.client.findFirst({ where: { id: cleanId, deletedAt: undefined } })).not.toBeNull();
    } finally {
      await prisma.client.update({ where: { id: cleanId }, data: { deletedAt: null } });
    }
  });
});

describe('clients', () => {
  it('refuses a role without clients.delete', async () => {
    const res = await request(app).delete(`/api/v1/clients/${cleanId}`)
      .set('Authorization', bearer('ci-am', 'ASSISTANT_MANAGER'));
    expect(res.status).toBe(403);
  });

  it('refuses while anything is live, naming what', async () => {
    const res = await request(app).delete(`/api/v1/clients/${busyId}`).set(as());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 site/);
    expect(res.body.error).toMatch(/1 open contract/);
  });

  it('deletes a client with nothing underneath, hides it, lists it, and restores it', async () => {
    const del = await request(app).delete(`/api/v1/clients/${cleanId}`).set(as());
    expect(del.status, JSON.stringify(del.body)).toBe(200);

    expect((await request(app).get(`/api/v1/clients/${cleanId}`).set(as())).status).toBe(404);
    const list = await request(app).get('/api/v1/clients').query({ search: `${PREFIX} Clean` }).set(as());
    expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(cleanId);

    const bin = await request(app).get('/api/v1/deleted-records').query({ type: 'client' }).set(as());
    expect(bin.body.data.map((r: { id: string }) => r.id)).toContain(cleanId);

    // Kept, with who and when.
    const row = await prisma.client.findFirst({ where: { id: cleanId, deletedAt: { not: null } } });
    expect(row?.deletedById).toBe(actorId);

    expect((await request(app).post(`/api/v1/clients/${cleanId}/restore`).set(as())).status).toBe(200);
    expect((await request(app).get(`/api/v1/clients/${cleanId}`).set(as())).status).toBe(200);
    expect((await request(app).post(`/api/v1/clients/${cleanId}/restore`).set(as())).status).toBe(400);
  });
});

describe('contracts and sites', () => {
  it('soft-deletes a contract and restores it; the row is kept', async () => {
    expect((await request(app).delete(`/api/v1/contracts/${contractId}`).set(as())).status).toBe(200);
    expect(await prisma.contract.findFirst({ where: { id: contractId, deletedAt: { not: null } } })).not.toBeNull();
    expect((await request(app).post(`/api/v1/contracts/${contractId}/restore`).set(as())).status).toBe(200);
  });

  it('will not restore a site while its client is deleted', async () => {
    expect((await request(app).delete(`/api/v1/clients/sites/${siteId}`).set(as())).status).toBe(200);
    expect((await request(app).delete(`/api/v1/contracts/${contractId}`).set(as())).status).toBe(200);
    // Nothing live now, so the client can go.
    expect((await request(app).delete(`/api/v1/clients/${busyId}`).set(as())).status).toBe(200);

    const early = await request(app).post(`/api/v1/clients/sites/${siteId}/restore`).set(as());
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/Restore the client first/);

    expect((await request(app).post(`/api/v1/clients/${busyId}/restore`).set(as())).status).toBe(200);
    expect((await request(app).post(`/api/v1/clients/sites/${siteId}/restore`).set(as())).status).toBe(200);
    expect((await request(app).post(`/api/v1/contracts/${contractId}/restore`).set(as())).status).toBe(200);
  });
});

describe('guards', () => {
  it('deletes and restores a guard added by mistake', async () => {
    const created = await request(app).post('/api/v1/guards').set(as()).send({
      firstName: 'Mistake', lastName: 'Entry', nationalId: `${NIN}${Date.now().toString().slice(-8)}`,
      phone: '+256700000321', dateOfBirth: '1995-04-12T00:00:00.000Z',
      nextOfKinName: 'Kin', nextOfKinPhone: '+256700000654',
      salaryRate: 300_000, contractStart: '2026-09-01T00:00:00.000Z',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id;

    expect((await request(app).delete(`/api/v1/guards/${id}`).set(as())).status).toBe(200);
    expect((await request(app).get(`/api/v1/guards/${id}`).set(as())).status).toBe(404);
    expect((await request(app).post(`/api/v1/guards/${id}/restore`).set(as())).status).toBe(200);
    expect((await request(app).get(`/api/v1/guards/${id}`).set(as())).status).toBe(200);
  });

  it('refuses a guard with history and points to termination', async () => {
    const worked = await prisma.guard.findFirst({ where: { deployments: { some: {} }, userId: null }, select: { id: true } });
    if (!worked) return;
    const res = await request(app).delete(`/api/v1/guards/${worked.id}`).set(as());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Terminated/);
  });
});

describe('staff', () => {
  it('deletes and restores an account that never signed in', async () => {
    const u = await prisma.user.create({
      data: { name: 'Zz Mistake Account', email: EMAIL, passwordHash: 'x', role: 'ACCOUNTS_OFFICER' },
      select: { id: true },
    });
    expect((await request(app).delete(`/api/v1/staff/${u.id}`).set(as())).status).toBe(200);
    expect((await request(app).get(`/api/v1/staff/${u.id}`).set(as())).status).toBe(404);
    expect((await request(app).post(`/api/v1/staff/${u.id}/restore`).set(as())).status).toBe(200);
  });

  it('refuses anyone who has signed in, and yourself', async () => {
    const used = await prisma.user.findFirst({
      where:  { lastLoginAt: { not: null }, role: { notIn: ['GUARD', 'CLIENT', 'DIRECTOR'] } },
      select: { id: true },
    });
    if (used) {
      const res = await request(app).delete(`/api/v1/staff/${used.id}`).set(as());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Deactivate it instead/);
    }
    expect((await request(app).delete(`/api/v1/staff/${actorId}`).set(as())).status).toBe(400);
  });
});

describe('invoices are voided, never deleted', () => {
  it('refuses an invoice with payments recorded against it', async () => {
    const paid = await prisma.invoice.findFirst({ where: { paidAmount: { gt: 0 } }, select: { id: true } });
    if (!paid) return;
    const res = await request(app).post(`/api/v1/finance/invoices/${paid.id}/void`).set(as()).send({ reason: 'Test refusal' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/payments recorded/);
  });

  it('needs a reason', async () => {
    const any = await prisma.invoice.findFirst({ select: { id: true } });
    if (!any) return;
    const res = await request(app).post(`/api/v1/finance/invoices/${any.id}/void`).set(as()).send({ reason: 'no' });
    expect(res.status).toBe(400);
  });

  it('voids a clean invoice: kept, marked VOID, owing nothing', async () => {
    const candidates = await prisma.invoice.findMany({
      where:  { status: { in: ['PENDING', 'OVERDUE'] }, paidAmount: 0, payments: { none: {} } },
      select: { id: true, status: true, outstandingBalance: true },
    });
    let target: (typeof candidates)[number] | undefined;
    for (const c of candidates) {
      const momo = await prisma.invoicePayment.count({ where: { invoiceId: c.id, status: { in: ['PENDING', 'SUCCESS'] } } });
      const cf   = await prisma.invoiceCarryForward.count({ where: { OR: [{ fromInvoiceId: c.id }, { toInvoiceId: c.id }] } });
      if (!momo && !cf) { target = c; break; }
    }
    if (!target) return;
    voided = { id: target.id, status: target.status, outstandingBalance: target.outstandingBalance };

    const res = await request(app).post(`/api/v1/finance/invoices/${target.id}/void`).set(as())
      .send({ reason: '  Raised against the wrong contract  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } });
    expect(inv.status).toBe('VOID');
    expect(inv.outstandingBalance).toBe(0);
    expect(inv.voidReason).toBe('Raised against the wrong contract');
    expect(inv.voidedById).toBe(actorId);

    expect((await request(app).post(`/api/v1/finance/invoices/${target.id}/void`).set(as()).send({ reason: 'Again please' })).status).toBe(400);
  });
});
