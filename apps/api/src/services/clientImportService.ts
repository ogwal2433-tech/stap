import * as XLSX from 'xlsx';
import prisma from '../db/prisma';
import { clientService } from './clientService';
import { contractService } from './contractService';
import { QueueService } from '../jobs/QueueService';
import { AppError } from '../errors/AppError';
import {
  CLIENT_IMPORT_ADDRESS_PLACEHOLDER,
  CLIENT_IMPORT_BILLING_TERMS,
  CLIENT_IMPORT_CONTACT_PLACEHOLDER,
  CLIENT_IMPORT_CONTRACT_MONTHS,
  CLIENT_IMPORT_HEADERS,
} from '@stap/shared';
import type {
  ClientImportPreview,
  ClientImportResult,
  ClientImportResultRow,
  ClientImportRow,
} from '@stap/shared';

/**
 * Bulk client import from the spreadsheet the company already keeps.
 *
 * Seven columns come in: client name, guns deployed, location, contract status,
 * guards deployed, start date, monthly amount. Three things a record needs are
 * not among them — a contact person, billing terms and a contract end date — so
 * each is filled with a stated default and reported on the row that used it.
 * Nothing is guessed silently.
 */

// ── Cell readers ─────────────────────────────────────────────────────────────

const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/** Digits only: "1,250" and "1 250" are how counts and money are typed by hand. */
const stripThousands = (s: string) => s.replace(/[,\s ]/g, '').replace(/ugx/gi, '');

function readCount(v: unknown, label: string, errors: string[]): number | null {
  const s = text(v);
  if (s === null) return null;
  const n = Number(stripThousands(s));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    errors.push(`${label} must be a whole number of 0 or more (found "${s}")`);
    return null;
  }
  return n;
}

function readMoney(v: unknown, errors: string[]): number | null {
  const s = text(v);
  if (s === null) return null;
  const n = Number(stripThousands(s));
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`Amount must be a number of 0 or more (found "${s}")`);
    return null;
  }
  // UGX has no minor unit in practice, and the rate column is an integer.
  return Math.round(n);
}

/**
 * Accepts a real Excel date cell, an Excel serial number, DD/MM/YYYY and
 * YYYY-MM-DD. A slash date is read day-first: the company writes 01/02/2026 for
 * 1 February, and reading it month-first would move a contract eleven months.
 */
function readDate(v: unknown, errors: string[]): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();

  const s = text(v);
  if (s === null) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00.000Z`);
    // Round-trip check: 31/02/2026 parses to 3 March, which is not what was typed.
    if (!isNaN(d.getTime()) && d.getUTCDate() === Number(dd) && d.getUTCMonth() + 1 === Number(mm)) {
      return d.toISOString();
    }
    errors.push(`Start date "${s}" is not a real date`);
    return null;
  }

  // Excel serial: days since 1899-12-30, which is what a raw numeric cell holds.
  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 0 && serial < 100_000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  errors.push(`Start date "${s}" is not a date — use DD/MM/YYYY`);
  return null;
}

// ── Status mapping ───────────────────────────────────────────────────────────
//
// The sheet's status is free text. A client row and a contract row have
// different vocabularies in this schema, so each word maps to both.

/** Client.contractStatus — ACTIVE | INACTIVE | EXPIRED. */
function clientStatusFrom(raw: string | null): 'ACTIVE' | 'INACTIVE' | 'EXPIRED' {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('EXPIR')) return 'EXPIRED';
  if (s.includes('TERMINAT') || s.includes('CANCEL') || s.includes('INACTIVE') || s.includes('DORMANT')) {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

/** Contract.status — DRAFT | ACTIVE | EXPIRING | EXPIRED. There is no TERMINATED. */
function contractStatusFrom(raw: string | null): 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('EXPIRING')) return 'EXPIRING';
  if (s.includes('EXPIR') || s.includes('TERMINAT') || s.includes('CANCEL')) return 'EXPIRED';
  if (s.includes('PENDING') || s.includes('DRAFT') || s.includes('PROPOS')) return 'DRAFT';
  return 'ACTIVE';
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const target = new Date(d);
  target.setUTCMonth(target.getUTCMonth() + months);
  return target.toISOString();
}

// ── Row shaping ──────────────────────────────────────────────────────────────

const HEADER_HINT = /client\s*name/i;

/**
 * The generated template carries a title row above the headers, and a sheet
 * exported from elsewhere may not. Finding the header row by its first cell
 * means neither the title nor a stray banner is read as a client.
 */
function findHeaderIndex(rows: unknown[][]): number {
  const i = rows.findIndex((r) => Array.isArray(r) && r.some((c) => HEADER_HINT.test(String(c ?? ''))));
  return i === -1 ? 0 : i;
}

function shapeRow(raw: unknown[], rowNumber: number): ClientImportRow {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const clientName = text(raw[0]);
  if (!clientName) errors.push('Client name is required');

  const gunsDeployed   = readCount(raw[1], 'Guns deployed', errors);
  const location       = text(raw[2]);
  const contractStatus = text(raw[3]);
  const guardsDeployed = readCount(raw[4], 'Guards deployed', errors);
  const startDate      = readDate(raw[5], errors);
  const amount         = readMoney(raw[6], errors);

  if (!location) warnings.push(`No location — address will read "${CLIENT_IMPORT_ADDRESS_PLACEHOLDER}"`);

  // A contract bills only through a guard rate line, which needs at least one
  // guard and a rate above zero. Without both there is nothing to bill, so the
  // client is created alone rather than carrying a contract worth nothing.
  const willCreateContract = (guardsDeployed ?? 0) > 0 && (amount ?? 0) > 0;

  if (!willCreateContract && (guardsDeployed || amount || startDate)) {
    warnings.push('No contract created — that needs both a guard count above 0 and an amount above 0');
  }

  if (willCreateContract) {
    if (!startDate) warnings.push('No start date — the contract will start today');
    warnings.push(`Contract end assumed ${CLIENT_IMPORT_CONTRACT_MONTHS} months after the start date`);

    const rate    = Math.round(amount! / guardsDeployed!);
    const derived = rate * guardsDeployed!;
    if (derived !== amount) {
      warnings.push(
        `${amount!.toLocaleString()} does not divide evenly by ${guardsDeployed} guards — ` +
        `billed as ${guardsDeployed} × ${rate.toLocaleString()} = ${derived.toLocaleString()} UGX`,
      );
    }
    if (rate < 1) errors.push('Amount is too small to split across that many guards');
  }

  return {
    rowNumber,
    clientName,
    gunsDeployed,
    location,
    contractStatus,
    guardsDeployed,
    startDate,
    amount,
    isValid: errors.length === 0,
    errors,
    warnings,
    willCreateContract,
  };
}

// ── Template ─────────────────────────────────────────────────────────────────

const NAVY  = '1B3A6B';
const TEAL  = '0F7173';
const GREY  = 'F5F5F5';
const WHITE = 'FFFFFF';

const COLUMN_WIDTHS = [32, 15, 30, 20, 24, 24, 24];

const EXAMPLE_ROWS: (string | number)[][] = [
  ['Kampala Heights Ltd', 2, 'Plot 14 Kira Road, Kampala', 'Active',   6, '01/01/2026', 4_800_000],
  ['Nakawa Business Park', 0, 'Nakawa, Kampala',            'Expired',  3, '15/03/2025', 2_100_000],
  ['Entebbe Grand Hotel',  1, 'Entebbe Road, Wakiso',       'Pending',  4, '01/02/2026', 3_200_000],
];

class ClientImportService {
  async generateTemplate(): Promise<Buffer> {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {};

    ws['A1'] = {
      v: 'STAP Security Ltd — Client Import Template', t: 's',
      s: {
        font:      { bold: true, color: { rgb: WHITE }, sz: 13 },
        fill:      { fgColor: { rgb: NAVY } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: CLIENT_IMPORT_HEADERS.length - 1 } }];

    CLIENT_IMPORT_HEADERS.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 1, c })] = {
        v: h, t: 's',
        s: {
          font:      { bold: true, color: { rgb: WHITE }, sz: 11 },
          fill:      { fgColor: { rgb: TEAL } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        },
      };
    });

    EXAMPLE_ROWS.forEach((row, ri) => {
      row.forEach((val, ci) => {
        ws[XLSX.utils.encode_cell({ r: ri + 2, c: ci })] = {
          v: val, t: typeof val === 'number' ? 'n' : 's',
          s: { fill: { fgColor: { rgb: GREY } }, font: { color: { rgb: '888888' }, italic: true } },
        };
      });
    });

    for (let r = 5; r < 105; r++) {
      CLIENT_IMPORT_HEADERS.forEach((_, c) => {
        ws[XLSX.utils.encode_cell({ r, c })] = {
          v: '', t: 's',
          s: { fill: { fgColor: { rgb: r % 2 === 0 ? 'FAFAFA' : WHITE } } },
        };
      });
    }

    ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 104, c: CLIENT_IMPORT_HEADERS.length - 1 } });
    ws['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));
    ws['!rows'] = [{ hpt: 28 }, { hpt: 36 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Clients Import Template');

    const instructions = [
      ['STAP Security Ltd — Client Import Instructions'],
      [''],
      ['HOW TO USE THIS TEMPLATE'],
      ['1. Do not change the column headers or their order.'],
      ['2. Overwrite the three grey example rows with real data.'],
      ['3. One client per row. Save as .xlsx before uploading.'],
      ['4. Upload from Clients → Import from Excel. You will see a preview before anything is saved.'],
      [''],
      ['COLUMNS'],
      ['A  Client Name *            Required. A name already on file is skipped, not duplicated.'],
      ['B  Guns Deployed            Whole number. Stored as the contract\'s weapons allocation.'],
      ['C  Location                 Becomes the client\'s physical address.'],
      ['D  Contract Status          Active | Expired | Terminated | Pending. Anything else is read as Active.'],
      ['E  No. of Guards Deployed   Whole number. A contract needs at least 1.'],
      ['F  Start Date               DD/MM/YYYY, e.g. 01/02/2026 is 1 February 2026.'],
      ['G  Amount — Monthly (UGX)   Total monthly value. No commas needed.'],
      [''],
      ['WHAT THE IMPORT ASSUMES'],
      [`Contact person:  "${CLIENT_IMPORT_CONTACT_PLACEHOLDER}" — the sheet has no column for it. Fill it in afterwards.`],
      [`Billing terms:   ${CLIENT_IMPORT_BILLING_TERMS} days.`],
      [`Contract end:    ${CLIENT_IMPORT_CONTRACT_MONTHS} months after the start date.`],
      [`Address:         "${CLIENT_IMPORT_ADDRESS_PLACEHOLDER}" when Location is blank.`],
      ['Billing:         The amount is split evenly across the guards as a monthly rate per guard.'],
      ['                 An amount that does not divide evenly is flagged in the preview.'],
      [''],
      ['WHEN NO CONTRACT IS CREATED'],
      ['A row with no guard count or no amount still creates the client — without a contract,'],
      ['because a contract bills only through a guard rate line. The preview says so per row.'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
    wsInstr['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  /** Parses and validates without writing anything. */
  async preview(fileBuffer: Buffer): Promise<ClientImportPreview> {
    let sheet: XLSX.WorkSheet | undefined;
    try {
      const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
      sheet = wb.Sheets[wb.SheetNames[0]];
    } catch {
      throw new AppError('That file could not be read as a spreadsheet', 400);
    }
    if (!sheet) throw new AppError('The spreadsheet has no sheets', 400);

    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false });
    const headerIndex = findHeaderIndex(grid);

    const rows: ClientImportRow[] = [];
    grid.slice(headerIndex + 1).forEach((raw, i) => {
      const cells = Array.isArray(raw) ? raw : [];
      const empty = cells.every((c) => String(c ?? '').trim() === '');
      if (empty) return;
      // +2: past the header row, and Excel numbers its rows from 1.
      rows.push(shapeRow(cells, headerIndex + i + 2));
    });

    if (rows.length === 0) {
      throw new AppError('No data rows found. Check that the first column holds client names.', 400);
    }

    // Names already on file, and names repeated inside the sheet itself.
    const names = rows.map((r) => r.clientName).filter((n): n is string => !!n);
    const existing = names.length
      ? await prisma.client.findMany({
          where:  { clientName: { in: names, mode: 'insensitive' } },
          select: { clientName: true },
        })
      : [];
    const onFile = new Set(existing.map((c) => c.clientName.toLowerCase()));
    const seen   = new Set<string>();

    for (const row of rows) {
      const key = row.clientName?.toLowerCase();
      if (!key) continue;
      if (onFile.has(key)) {
        row.warnings.push('A client with this name is already on file — this row will be skipped');
      }
      if (seen.has(key)) {
        row.warnings.push('This name appears more than once in the sheet — only the first row is imported');
      }
      seen.add(key);
    }

    return {
      totalRows:    rows.length,
      validCount:   rows.filter((r) => r.isValid).length,
      invalidCount: rows.filter((r) => !r.isValid).length,
      rows,
    };
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  /**
   * Writes the selected rows. Goes through clientService and contractService
   * rather than prisma directly: they issue the system id, create the contact
   * row that invoices read, derive the contract totals from the rate line and
   * write the audit entries. A raw insert would produce a client with none of
   * that and no sign anything was missing.
   */
  async confirm(rows: ClientImportRow[], userId: string): Promise<ClientImportResult> {
    const results: ClientImportResultRow[] = [];
    const done = new Set<string>();

    for (const row of rows) {
      const name = row.clientName?.trim();

      if (!name) {
        results.push({ rowNumber: row.rowNumber, name: '—', status: 'FAILED', note: 'Client name is required', contractCreated: false });
        continue;
      }

      const key = name.toLowerCase();
      if (done.has(key)) {
        results.push({ rowNumber: row.rowNumber, name, status: 'SKIPPED', note: 'Repeated in this file — imported once', contractCreated: false });
        continue;
      }

      try {
        const clash = await prisma.client.findFirst({
          where:  { clientName: { equals: name, mode: 'insensitive' } },
          select: { id: true },
        });
        if (clash) {
          done.add(key);
          results.push({ rowNumber: row.rowNumber, name, status: 'SKIPPED', note: 'Already on file', clientId: clash.id, contractCreated: false });
          continue;
        }

        const client = await clientService.create({
          clientName:      name,
          physicalAddress: row.location?.trim() || CLIENT_IMPORT_ADDRESS_PLACEHOLDER,
          contactPerson:   CLIENT_IMPORT_CONTACT_PLACEHOLDER,
          billingTerms:    CLIENT_IMPORT_BILLING_TERMS,
          contractStatus:  clientStatusFrom(row.contractStatus),
          leadStatus:      'CONVERTED',
        }, userId);

        done.add(key);

        // Re-decided here rather than trusting the flag the browser sent back.
        const guards = row.guardsDeployed ?? 0;
        const amount = row.amount ?? 0;
        const rate   = guards > 0 ? Math.round(amount / guards) : 0;

        if (guards > 0 && amount > 0 && rate > 0) {
          try {
            const start = row.startDate ?? new Date().toISOString();
            const contract = await contractService.create({
              clientId:          client.id,
              contractStart:     start,
              contractEnd:       addMonths(start, CLIENT_IMPORT_CONTRACT_MONTHS),
              weaponsAllocation: row.gunsDeployed ?? undefined,
              guardRates:        [{ guardType: 'Guard', guardsCount: guards, ratePerGuard: rate }],
            }, userId);

            // contractService.create always writes ACTIVE; the sheet may say otherwise.
            const status = contractStatusFrom(row.contractStatus);
            if (status !== 'ACTIVE') {
              await prisma.contract.update({ where: { id: contract.id }, data: { status } });
            }

            results.push({
              rowNumber: row.rowNumber, name, status: 'IMPORTED',
              note: `Client and contract created — ${guards} × ${rate.toLocaleString()} UGX/month`,
              clientId: client.id, contractCreated: true,
            });
          } catch (err) {
            // The client is already saved. Saying so beats implying nothing happened.
            results.push({
              rowNumber: row.rowNumber, name, status: 'IMPORTED',
              note: `Client created, but the contract failed: ${err instanceof Error ? err.message : 'unknown error'}`,
              clientId: client.id, contractCreated: false,
            });
          }
        } else {
          results.push({
            rowNumber: row.rowNumber, name, status: 'IMPORTED',
            note: 'Client created without a contract — needs a guard count and an amount',
            clientId: client.id, contractCreated: false,
          });
        }
      } catch (err) {
        results.push({
          rowNumber: row.rowNumber, name, status: 'FAILED',
          note: err instanceof Error ? err.message : 'Unknown error',
          contractCreated: false,
        });
      }
    }

    const result: ClientImportResult = {
      imported:         results.filter((r) => r.status === 'IMPORTED').length,
      skipped:          results.filter((r) => r.status === 'SKIPPED').length,
      failed:           results.filter((r) => r.status === 'FAILED').length,
      contractsCreated: results.filter((r) => r.contractCreated).length,
      rows:             results,
    };

    await QueueService.logAudit({
      userId,
      action:   'CLIENTS_BULK_IMPORTED',
      entity:   'client',
      entityId: 'bulk',
      newValue: {
        submitted: rows.length,
        imported:  result.imported,
        skipped:   result.skipped,
        failed:    result.failed,
        contracts: result.contractsCreated,
      },
    });

    return result;
  }
}

export const clientImportService = new ClientImportService();
