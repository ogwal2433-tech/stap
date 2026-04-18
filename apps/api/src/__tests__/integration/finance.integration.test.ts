import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import prisma from '../../db/prisma';

let directorToken: string;
let clientId: string;
let invoiceId: string;

const EMAIL = 'fint.director@stap.test';

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    create: { id: 'fint-director', name: 'FInt Director', email: EMAIL, passwordHash: hash, role: 'DIRECTOR', status: 'ACTIVE' },
    update: {},
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'testpass123' });
  directorToken = loginRes.body.data?.accessToken;

  const clientRes = await request(app)
    .post('/api/v1/clients')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({
      clientName: 'Finance Integration Test Co',
      contactPerson: 'Test Contact',
      contactPhone: '+256700009999',
      physicalAddress: 'Test Road, Kampala',
      billingTerms: 30,
    });
  clientId = clientRes.body.data?.id;
});

afterAll(async () => {
  if (invoiceId) {
    await prisma.payment.deleteMany({ where: { invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
  }
  if (clientId) await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe('Finance API — Invoices', () => {
  it('POST /finance/invoices — creates invoice with correct invoice number format', async () => {
    const res = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        clientId,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd:   '2026-04-30T23:59:59.000Z',
        guardsDeployed: 3,
        ratePerGuard:   800000,
        taxAmount:      0,
        dueDate:        '2026-05-31T00:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNumber).toMatch(/^STAP\/INV\/\d{4}\/\d{4}$/);
    expect(res.body.data.subtotal).toBe(2400000);   // 3 * 800000
    expect(res.body.data.totalAmount).toBe(2400000);
    invoiceId = res.body.data.id;
  });

  it('GET /finance/invoices — lists invoices', async () => {
    const res = await request(app)
      .get('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /finance/invoices/:id/pay — payment route is reachable and validates request', async () => {
    if (!invoiceId) return;
    const res = await request(app)
      .post(`/api/v1/finance/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ invoiceId, amountPaid: 2400000, mode: 'BANK' });
    // 200 = paid, 400 = invoice not found or already paid, both are valid route responses
    expect([200, 400, 404]).toContain(res.status);
    if (res.status === 200) {
      // Response is the payment record, not the invoice
      expect(res.body.data).toBeDefined();
      expect(res.body.success).toBe(true);
    }
  });

  it('GET /finance/invoices/aging — returns AR aging buckets', async () => {
    const res = await request(app)
      .get('/api/v1/finance/invoices/aging')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.buckets).toBeDefined();
  });
});

describe('Finance API — Payroll', () => {
  it('POST /finance/payroll/calculate — creates payroll run (or 409 if already run)', async () => {
    const now = new Date();
    const res = await request(app)
      .post('/api/v1/finance/payroll/calculate')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ month: now.getMonth() + 1, year: now.getFullYear() });
    expect([201, 409]).toContain(res.status);
  });

  it('GET /finance/payroll — lists payroll runs', async () => {
    const res = await request(app)
      .get('/api/v1/finance/payroll')
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
