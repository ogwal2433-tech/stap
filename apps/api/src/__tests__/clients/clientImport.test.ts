import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import app from '../../index';
import prisma from '../../db/prisma';
import { signAccessToken } from '../../lib/jwt';

/**
 * Client bulk import, end to end against the real database.
 *
 * Every client created here is named "ZZ Import …" and removed afterwards,
 * along with the contracts underneath it.
 */

const BASE   = '/api/v1/clients';
const PREFIX = 'ZZ Import';

let token = '';

/** A workbook shaped like the generated template: title row, headers, then data. */
function workbook(rows: (string | number | null)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['STAP Security Ltd — Client Import Template'],
    ['Client Name *', 'Guns Deployed', 'Location', 'Contract Status',
     'No. of Guards Deployed', 'Start Date (DD/MM/YYYY)', 'Amount — Monthly (UGX)'],
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const upload = (buffer: Buffer) =>
  request(app).post(`${BASE}/import/preview`)
    .set('Authorization', token)
    .attach('file', buffer, 'clients.xlsx');

beforeAll(async () => {
  const grant = await prisma.rolePermission.findFirst({
    where:  { permission: { key: 'clients.create' } },
    select: { role: true },
  });
  if (!grant) throw new Error('No role holds clients.create — is the database seeded?');

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
  const clients = await prisma.client.findMany({
    where:  { clientName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((c) => c.id);
  if (ids.length) {
    await prisma.contract.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
  }
});

describe('preview', () => {
  it('reads the seven columns and skips the title row', async () => {
    const res = await upload(workbook([
      [`${PREFIX} Alpha Ltd`, 2, 'Plot 14 Kira Road', 'Active', 6, '01/02/2026', 4_800_000],
    ]));

    expect(res.status).toBe(200);
    // The banner above the headers must not become a client.
    expect(res.body.data.totalRows).toBe(1);

    const row = res.body.data.rows[0];
    expect(row.clientName).toBe(`${PREFIX} Alpha Ltd`);
    expect(row.gunsDeployed).toBe(2);
    expect(row.guardsDeployed).toBe(6);
    expect(row.amount).toBe(4_800_000);
    expect(row.isValid).toBe(true);
    expect(row.willCreateContract).toBe(true);
    // Day-first: 01/02/2026 is 1 February, not 2 January.
    expect(row.startDate.startsWith('2026-02-01')).toBe(true);
  });

  it('rejects a row with no client name and reports the row number', async () => {
    const res = await upload(workbook([
      [`${PREFIX} Beta Ltd`, null, 'Kampala', 'Active', 2, '01/01/2026', 1_000_000],
      [null,                 null, 'Jinja',   'Active', 2, '01/01/2026', 1_000_000],
    ]));

    expect(res.body.data.validCount).toBe(1);
    expect(res.body.data.invalidCount).toBe(1);

    const bad = res.body.data.rows.find((r: { isValid: boolean }) => !r.isValid);
    expect(bad.errors).toContain('Client name is required');
    expect(bad.rowNumber).toBe(4); // title + header + one good row above it
  });

  it('refuses a date that does not exist', async () => {
    const res = await upload(workbook([
      [`${PREFIX} Gamma Ltd`, null, 'Kampala', 'Active', 2, '31/02/2026', 1_000_000],
    ]));
    expect(res.body.data.rows[0].isValid).toBe(false);
    expect(res.body.data.rows[0].errors.join(' ')).toMatch(/not a real date/i);
  });

  it('warns when the amount does not divide evenly across the guards', async () => {
    const res = await upload(workbook([
      [`${PREFIX} Delta Ltd`, null, 'Kampala', 'Active', 3, '01/01/2026', 1_000_000],
    ]));
    const row = res.body.data.rows[0];
    expect(row.isValid).toBe(true);
    expect(row.warnings.join(' ')).toMatch(/does not divide evenly/i);
  });

  it('imports a client without a contract when the billing figures are missing', async () => {
    const res = await upload(workbook([
      [`${PREFIX} Epsilon Ltd`, null, 'Kampala', 'Active', null, null, null],
    ]));
    const row = res.body.data.rows[0];
    expect(row.isValid).toBe(true);
    expect(row.willCreateContract).toBe(false);
  });

  it('400s on a file that is not a spreadsheet', async () => {
    const res = await request(app).post(`${BASE}/import/preview`)
      .set('Authorization', token)
      .attach('file', Buffer.from('not a spreadsheet'), 'notes.txt');
    expect(res.status).toBe(400);
  });

  it('401s without a token', async () => {
    const res = await request(app).post(`${BASE}/import/preview`)
      .attach('file', workbook([[`${PREFIX} Zeta`, null, null, null, null, null, null]]), 'c.xlsx');
    expect(res.status).toBe(401);
  });
});

describe('confirm', () => {
  const row = (o: Record<string, unknown> = {}) => ({
    rowNumber: 3,
    clientName: `${PREFIX} Omega Ltd`,
    gunsDeployed: 2,
    location: 'Plot 9 Lugogo Bypass',
    contractStatus: 'Active',
    guardsDeployed: 4,
    startDate: '2026-03-01T00:00:00.000Z',
    amount: 3_200_000,
    isValid: true,
    errors: [],
    warnings: [],
    willCreateContract: true,
    ...o,
  });

  it('creates the client and a contract whose totals come from the rate line', async () => {
    const res = await request(app).post(`${BASE}/import/confirm`)
      .set('Authorization', token).send({ rows: [row()] });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.contractsCreated).toBe(1);

    const client = await prisma.client.findFirstOrThrow({
      where:   { clientName: `${PREFIX} Omega Ltd` },
      include: { contracts: { include: { guardRates: true } }, contacts: true },
    });

    // Went through clientService, so the record is complete rather than a bare row.
    expect(client.systemId).toBeTruthy();
    expect(client.physicalAddress).toBe('Plot 9 Lugogo Bypass');
    expect(client.billingTerms).toBe(30);
    expect(client.contacts.length).toBeGreaterThan(0);

    const contract = client.contracts[0];
    expect(contract.guardsRequired).toBe(4);
    expect(contract.totalMonthlyValue).toBe(3_200_000);
    expect(contract.weaponsAllocation).toBe(2);
    expect(contract.guardRates[0].ratePerGuard).toBe(800_000);
    // End date is assumed 12 months out — the sheet has no column for it.
    expect(contract.contractEnd.getUTCFullYear()).toBe(2027);
    expect(contract.contractEnd.getUTCMonth()).toBe(2);
  });

  it('skips a name already on file instead of duplicating it', async () => {
    const res = await request(app).post(`${BASE}/import/confirm`)
      .set('Authorization', token).send({ rows: [row()] });

    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.rows[0].note).toMatch(/already on file/i);
    expect(await prisma.client.count({ where: { clientName: `${PREFIX} Omega Ltd` } })).toBe(1);
  });

  it('maps a sheet status of "Expired" onto both records', async () => {
    await request(app).post(`${BASE}/import/confirm`).set('Authorization', token)
      .send({ rows: [row({ clientName: `${PREFIX} Expired Ltd`, contractStatus: 'Expired' })] });

    const client = await prisma.client.findFirstOrThrow({
      where:   { clientName: `${PREFIX} Expired Ltd` },
      include: { contracts: true },
    });
    expect(client.contractStatus).toBe('EXPIRED');
    expect(client.contracts[0].status).toBe('EXPIRED');
  });

  it('creates the client alone when guards or amount are missing', async () => {
    await request(app).post(`${BASE}/import/confirm`).set('Authorization', token)
      .send({ rows: [row({
        clientName: `${PREFIX} NoContract Ltd`, guardsDeployed: null, amount: null, willCreateContract: false,
      })] });

    const client = await prisma.client.findFirstOrThrow({
      where:   { clientName: `${PREFIX} NoContract Ltd` },
      include: { contracts: true },
    });
    expect(client.contracts).toHaveLength(0);
    expect(client.physicalAddress).toBe('Plot 9 Lugogo Bypass');
  });

  it('does not trust the browser: a row claiming isValid with no name fails', async () => {
    const res = await request(app).post(`${BASE}/import/confirm`)
      .set('Authorization', token)
      .send({ rows: [row({ clientName: null, isValid: true })] });

    expect(res.status).toBe(200);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.imported).toBe(0);
  });

  it('400s on an empty row list', async () => {
    const res = await request(app).post(`${BASE}/import/confirm`)
      .set('Authorization', token).send({ rows: [] });
    expect(res.status).toBe(400);
  });
});

describe('template', () => {
  it('serves a workbook carrying the seven headers and an instructions sheet', async () => {
    const res = await request(app).get(`${BASE}/import/template`)
      .set('Authorization', token)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    const wb = XLSX.read(res.body as Buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Instructions');

    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(String(grid[1]?.[0])).toMatch(/client name/i);
    expect(grid[1]).toHaveLength(7);
  });
});
