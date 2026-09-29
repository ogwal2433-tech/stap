import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../index';
import prisma from '../../db/prisma';

const PASSWORD = 'testpass123';
const tokens: Record<string, string> = {};

const CLIENT_A_ID = 'iso-client-a';
const CLIENT_B_ID = 'iso-client-b';

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await prisma.client.createMany({
    data: [
      { id: CLIENT_A_ID, clientName: 'Isolation Co A', contactPerson: 'A Person', contactPhone: '+256700000101', physicalAddress: 'Kampala', billingTerms: 30 },
      { id: CLIENT_B_ID, clientName: 'Isolation Co B', contactPerson: 'B Person', contactPhone: '+256700000102', physicalAddress: 'Kampala', billingTerms: 30 },
    ],
    skipDuplicates: true,
  });

  await prisma.user.createMany({
    data: [
      { id: 'iso-client-user-a', name: 'Client User A', email: 'iso.client.a@security360.test', passwordHash: hash, role: 'CLIENT', status: 'ACTIVE', clientId: CLIENT_A_ID },
      { id: 'iso-client-user-b', name: 'Client User B', email: 'iso.client.b@security360.test', passwordHash: hash, role: 'CLIENT', status: 'ACTIVE', clientId: CLIENT_B_ID },
      { id: 'iso-client-unlinked', name: 'Unlinked Client', email: 'iso.client.unlinked@security360.test', passwordHash: hash, role: 'CLIENT', status: 'ACTIVE' },
      { id: 'iso-director', name: 'Iso Director', email: 'iso.director@security360.test', passwordHash: hash, role: 'DIRECTOR', status: 'ACTIVE' },
      { id: 'iso-opsupervisor', name: 'Iso Ops', email: 'iso.ops@security360.test', passwordHash: hash, role: 'OPERATIONS_SUPERVISOR', status: 'ACTIVE' },
    ],
    skipDuplicates: true,
  });

  await prisma.invoice.createMany({
    data: [
      { id: 'iso-invoice-a', clientId: CLIENT_A_ID, invoiceNumber: 'ISO-INV-A', periodStart: new Date(), periodEnd: new Date(), guardsDeployed: 1, ratePerGuard: 100, subtotal: 100, totalAmount: 100, dueDate: new Date() },
      { id: 'iso-invoice-b', clientId: CLIENT_B_ID, invoiceNumber: 'ISO-INV-B', periodStart: new Date(), periodEnd: new Date(), guardsDeployed: 1, ratePerGuard: 100, subtotal: 100, totalAmount: 100, dueDate: new Date() },
    ],
    skipDuplicates: true,
  });

  await prisma.clientComplaint.createMany({
    data: [
      { id: 'iso-complaint-a', clientId: CLIENT_A_ID, subject: 'A complaint', category: 'OTHER', description: 'desc', severity: 'LOW' },
      { id: 'iso-complaint-b', clientId: CLIENT_B_ID, subject: 'B complaint', category: 'OTHER', description: 'desc', severity: 'LOW' },
    ],
    skipDuplicates: true,
  });

  await prisma.serviceRequest.createMany({
    data: [
      { id: 'iso-sr-a', clientId: CLIENT_A_ID, subject: 'A service request', description: 'Needs more guards please', createdBy: 'iso-client-user-a' },
      { id: 'iso-sr-b', clientId: CLIENT_B_ID, subject: 'B service request', description: 'Needs fewer guards please', createdBy: 'iso-client-user-b' },
    ],
    skipDuplicates: true,
  });

  for (const [key, email] of Object.entries({
    A: 'iso.client.a@security360.test',
    B: 'iso.client.b@security360.test',
    UNLINKED: 'iso.client.unlinked@security360.test',
    DIRECTOR: 'iso.director@security360.test',
    OPS: 'iso.ops@security360.test',
  })) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.data?.accessToken;
  }
});

afterAll(async () => {
  await prisma.serviceRequest.deleteMany({ where: { clientId: { in: [CLIENT_A_ID, CLIENT_B_ID] } } });
  await prisma.clientComplaint.deleteMany({ where: { clientId: { in: [CLIENT_A_ID, CLIENT_B_ID] } } });
  await prisma.invoice.deleteMany({ where: { clientId: { in: [CLIENT_A_ID, CLIENT_B_ID] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@security360.test' }, id: { startsWith: 'iso-' } } });
  await prisma.client.deleteMany({ where: { id: { in: [CLIENT_A_ID, CLIENT_B_ID] } } });
});

describe('JWT payload', () => {
  it('includes clientId for a CLIENT user', () => {
    const decoded = jwt.decode(tokens.A) as any;
    expect(decoded.role).toBe('CLIENT');
    expect(decoded.clientId).toBe(CLIENT_A_ID);
  });

  it('is null for internal staff', () => {
    const decoded = jwt.decode(tokens.DIRECTOR) as any;
    expect(decoded.role).toBe('DIRECTOR');
    expect(decoded.clientId).toBeNull();
  });
});

describe('Client portal data isolation', () => {
  it('GET /portal/invoices — client A sees only their own invoice', async () => {
    const res = await request(app).get('/api/v1/portal/invoices').set('Authorization', `Bearer ${tokens.A}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((inv: any) => inv.clientId === CLIENT_A_ID)).toBe(true);
    expect(res.body.data.some((inv: any) => inv.clientId === CLIENT_B_ID)).toBe(false);
  });

  it('GET /portal/complaints — client A sees only their own complaint', async () => {
    const res = await request(app).get('/api/v1/portal/complaints').set('Authorization', `Bearer ${tokens.A}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((c: any) => c.clientId === CLIENT_A_ID)).toBe(true);
    expect(res.body.data.some((c: any) => c.clientId === CLIENT_B_ID)).toBe(false);
  });

  it('GET /portal/invoices/:id — client A cannot fetch client B\'s invoice (404)', async () => {
    const res = await request(app).get('/api/v1/portal/invoices/iso-invoice-b').set('Authorization', `Bearer ${tokens.A}`);
    expect(res.status).toBe(404);
  });

  it('a CLIENT user with no linked company gets 403, not an empty/leaked result', async () => {
    const res = await request(app).get('/api/v1/portal/invoices').set('Authorization', `Bearer ${tokens.UNLINKED}`);
    expect(res.status).toBe(403);
  });

  it('staff (DIRECTOR) cannot use the client portal at all', async () => {
    const res = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(403);
  });
});

describe('Service request isolation', () => {
  it('GET /portal/service-requests — client A returns only their own requests', async () => {
    const res = await request(app).get('/api/v1/portal/service-requests').set('Authorization', `Bearer ${tokens.A}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((sr: any) => sr.clientId === CLIENT_A_ID)).toBe(true);
    expect(res.body.data.some((sr: any) => sr.clientId === CLIENT_B_ID)).toBe(false);
  });

  it('GET /portal/service-requests — client B returns only their own requests', async () => {
    const res = await request(app).get('/api/v1/portal/service-requests').set('Authorization', `Bearer ${tokens.B}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((sr: any) => sr.clientId === CLIENT_B_ID)).toBe(true);
  });

  it('POST /portal/service-requests — creates the request under the caller\'s own clientId, ignoring any spoofed clientId in the body', async () => {
    const res = await request(app)
      .post('/api/v1/portal/service-requests')
      .set('Authorization', `Bearer ${tokens.A}`)
      .send({ clientId: CLIENT_B_ID, type: 'OTHER', subject: 'Spoof attempt', description: 'Trying to create as company B' });

    expect(res.status).toBe(201);
    expect(res.body.data.clientId).toBe(CLIENT_A_ID);

    await prisma.serviceRequest.delete({ where: { id: res.body.data.id } });
  });

  // Staff answering client requests is the point of the feature; what stays
  // walled off is one client seeing another, and either seeing internal notes.
  it('DIRECTOR can list service requests across every client', async () => {
    const res = await request(app).get('/api/v1/service-requests').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(200);
    const clientIds = new Set(res.body.data.map((sr: any) => sr.clientId));
    expect(clientIds.has(CLIENT_A_ID)).toBe(true);
    expect(clientIds.has(CLIENT_B_ID)).toBe(true);
  });

  it('a CLIENT cannot reach the staff service-request endpoints', async () => {
    for (const path of ['/api/v1/service-requests', '/api/v1/service-requests/summary']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${tokens.A}`);
      expect(res.status).toBe(403);
    }
  });

  it('a CLIENT cannot change a request\'s status', async () => {
    const res = await request(app)
      .patch('/api/v1/service-requests/any-id/status')
      .set('Authorization', `Bearer ${tokens.A}`)
      .send({ status: 'COMPLETED', staffResponse: 'approving my own request' });
    expect(res.status).toBe(403);
  });

  it('internal staff notes never appear on the client portal', async () => {
    const res = await request(app).get('/api/v1/portal/service-requests').set('Authorization', `Bearer ${tokens.A}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((sr: any) => !('staffNotes' in sr))).toBe(true);
  });

  it('DIRECTOR cannot reach service requests via the client portal either', async () => {
    const res = await request(app).get('/api/v1/portal/service-requests').set('Authorization', `Bearer ${tokens.DIRECTOR}`);
    expect(res.status).toBe(403);
  });

  it('OPERATIONS_SUPERVISOR cannot view service requests', async () => {
    const res = await request(app).get('/api/v1/portal/service-requests').set('Authorization', `Bearer ${tokens.OPS}`);
    expect(res.status).toBe(403);
  });
});
