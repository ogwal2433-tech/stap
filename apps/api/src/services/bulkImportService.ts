import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { BulkImportRowSchema } from '@stap/shared';
import type { BulkImportResult, BulkImportResultRow, BulkImportRow } from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse DD/MM/YYYY → ISO datetime string. Returns null if invalid. */
function parseDMY(value: string): string | null {
  const str = String(value ?? '').trim();
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00.000Z`;
  if (isNaN(Date.parse(iso))) return null;
  return iso;
}

const COLUMNS = [
  'firstName', 'lastName', 'otherNames', 'nationalId', 'phone',
  'dateOfBirth', 'nextOfKinName', 'nextOfKinPhone', 'bankName',
  'accountNumber', 'salaryRate', 'contractStart', 'contractEnd', 'psoCertNumber',
] as const;

const HEADERS = [
  'First Name *', 'Last Name *', 'Other Names', 'National ID (NIN) *',
  'Phone *', 'Date of Birth (DD/MM/YYYY) *', 'Next of Kin Name *',
  'Next of Kin Phone *', 'Bank Name', 'Account Number',
  'Monthly Salary (UGX) *', 'Contract Start (DD/MM/YYYY) *',
  'Contract End (DD/MM/YYYY)', 'PSO Certificate Number',
];

const EXAMPLE_ROWS = [
  ['David', 'Ochieng', '', 'CM90210198412', '+256772345678', '15/03/1990',
   'Mary Ochieng', '+256701234567', 'Centenary Bank', '1234567890',
   450000, '01/01/2026', '31/12/2026', 'PSO/2024/001'],
  ['Amina', 'Nakato', '', 'CM80115197534', '+256782456789', '22/07/1985',
   'Robert Nakato', '+256711234567', 'Stanbic Bank', '9876543210',
   520000, '01/02/2026', '31/01/2027', 'PSO/2024/022'],
  ['Samuel', 'Mugisha', 'Patrick', 'CM91330200145', '+256701567890', '10/11/1991',
   'Grace Mugisha', '+256723456789', '', '',
   480000, '01/03/2026', '', ''],
];

const COLUMN_WIDTHS = [14, 14, 14, 18, 16, 24, 18, 18, 16, 16, 20, 24, 22, 20];

// ── Styles ─────────────────────────────────────────────────────────────────────

const NAVY  = '1B3A6B';
const TEAL  = '0F7173';
const GREY  = 'F5F5F5';
const WHITE = 'FFFFFF';

function boldCell(value: string, fill: string, fontColor = WHITE): XLSX.CellObject {
  return {
    v: value, t: 's',
    s: {
      font:      { bold: true, color: { rgb: fontColor }, sz: 11 },
      fill:      { fgColor: { rgb: fill } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border:    { bottom: { style: 'thin', color: { rgb: 'CCCCCC' } } },
    },
  };
}

// ── BulkImportService ──────────────────────────────────────────────────────────

class BulkImportService {
  async generateTemplate(): Promise<Buffer> {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Template ──────────────────────────────────────────────────────
    const ws: XLSX.WorkSheet = {};

    // Row 1: Title (merged A1:N1)
    ws['A1'] = {
      v: 'STAP Security Ltd — Guard Import Template', t: 's',
      s: {
        font:      { bold: true, color: { rgb: WHITE }, sz: 13 },
        fill:      { fgColor: { rgb: NAVY } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMNS.length - 1 } }];

    // Row 2: Column headers
    HEADERS.forEach((h, c) => {
      const addr = XLSX.utils.encode_cell({ r: 1, c });
      ws[addr] = boldCell(h, TEAL);
    });

    // Rows 3-5: Example data (greyed)
    EXAMPLE_ROWS.forEach((row, ri) => {
      row.forEach((val, ci) => {
        const addr = XLSX.utils.encode_cell({ r: ri + 2, c: ci });
        ws[addr] = {
          v: val, t: typeof val === 'number' ? 'n' : 's',
          s: {
            fill:      { fgColor: { rgb: GREY } },
            font:      { color: { rgb: '888888' }, italic: true },
            alignment: { vertical: 'center' },
          },
        };
      });
    });

    // Rows 6-105: Empty guide rows
    for (let r = 5; r < 105; r++) {
      COLUMNS.forEach((_, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = {
          v: '', t: 's',
          s: { fill: { fgColor: { rgb: r % 2 === 0 ? 'FAFAFA' : WHITE } } },
        };
      });
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 104, c: COLUMNS.length - 1 } });
    ws['!cols'] = COLUMN_WIDTHS.map((w) => ({ wch: w }));
    ws['!rows'] = [{ hpt: 28 }, { hpt: 36 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Guards Import Template');

    // ── Sheet 2: Instructions ──────────────────────────────────────────────────
    const instructions = [
      ['STAP Security Ltd — Guard Import Instructions'],
      [''],
      ['HOW TO USE THIS TEMPLATE'],
      ['1. Do not change column headers or their order.'],
      ['2. Do not delete example rows — simply overwrite them with real data.'],
      ['3. Start entering guard data from row 3 onwards.'],
      ['4. Save the file in .xlsx format before uploading.'],
      [''],
      ['REQUIRED COLUMNS (marked with *)'],
      ['First Name, Last Name, National ID (NIN), Phone,'],
      ['Date of Birth, Next of Kin Name, Next of Kin Phone,'],
      ['Monthly Salary, Contract Start'],
      [''],
      ['OPTIONAL COLUMNS'],
      ['Other Names, Bank Name, Account Number,'],
      ['Contract End, PSO Certificate Number'],
      [''],
      ['FORMAT RULES'],
      ['Phone:         +256XXXXXXXXX (10–15 digits, optional leading +)'],
      ['Date fields:   DD/MM/YYYY (e.g. 15/03/1990)'],
      ['Salary:        Whole number in UGX — no commas (e.g. 480000)'],
      ['NIN:           Must be unique — duplicates will be skipped'],
      [''],
      ['EXAMPLE'],
      ['First Name: David   Last Name: Ochieng'],
      ['Phone: +256772345678   DOB: 15/03/1990'],
      ['Salary: 450000   Contract Start: 01/01/2026'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
    wsInstr['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ── parseAndValidate ─────────────────────────────────────────────────────────

  async parseAndValidate(fileBuffer: Buffer, uploadedBy: string): Promise<BulkImportResult> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: [...COLUMNS],
      range:  2,   // skip title + header rows
      defval: '',
    });

    // Filter blank rows (all key fields empty)
    const KEY_FIELDS: (keyof BulkImportRow)[] = [
      'firstName', 'lastName', 'nationalId', 'phone',
    ];
    const dataRows = rawRows.filter((row) =>
      KEY_FIELDS.some((f) => String(row[f] ?? '').trim() !== ''),
    );

    if (dataRows.length === 0) {
      return { totalRows: 0, successful: 0, failed: 0, skipped: 0, results: [] };
    }

    // Batch NIN uniqueness check
    const nids = dataRows
      .map((r) => String(r.nationalId ?? '').trim())
      .filter(Boolean);
    const existing = await prisma.guard.findMany({
      where: { nationalId: { in: nids } },
      select: { nationalId: true },
    });
    const existingNids = new Set(existing.map((g) => g.nationalId));

    // Validate each row
    const results: BulkImportResultRow[] = [];
    const validGuards: import('@prisma/client').Prisma.GuardCreateManyInput[] = [];

    dataRows.forEach((raw, idx) => {
      const rowNumber = idx + 3; // Excel row (1-indexed, +2 header rows)
      const errors: string[] = [];
      const partial: Partial<BulkImportRow> = {};

      // Copy raw values for error reporting
      (COLUMNS as readonly string[]).forEach((col) => {
        (partial as Record<string, unknown>)[col] = raw[col];
      });

      const nid = String(raw.nationalId ?? '').trim();

      // Check NIN uniqueness
      if (existingNids.has(nid)) {
        results.push({
          rowNumber,
          status:  'SKIPPED',
          errors:  [`National ID "${nid}" already exists in the system`],
          data:    partial,
        });
        return;
      }

      // Zod validation
      const parsed = BulkImportRowSchema.safeParse(raw);
      if (!parsed.success) {
        parsed.error.errors.forEach((e) =>
          errors.push(`${e.path.join('.')}: ${e.message}`),
        );
      }

      // Date parsing
      const dobIso = parseDMY(String(raw.dateOfBirth ?? ''));
      if (!dobIso) errors.push('dateOfBirth: Invalid date (use DD/MM/YYYY)');

      const contractStartIso = parseDMY(String(raw.contractStart ?? ''));
      if (!contractStartIso) errors.push('contractStart: Invalid date (use DD/MM/YYYY)');

      const contractEndRaw = String(raw.contractEnd ?? '').trim();
      let contractEndIso: string | null = null;
      if (contractEndRaw) {
        contractEndIso = parseDMY(contractEndRaw);
        if (!contractEndIso) errors.push('contractEnd: Invalid date (use DD/MM/YYYY)');
      }

      const firstName  = String(raw.firstName  ?? '').trim();
      const lastName   = String(raw.lastName   ?? '').trim();
      const guardName  = [firstName, lastName].filter(Boolean).join(' ');

      if (errors.length > 0) {
        results.push({ rowNumber, status: 'ERROR', guardName, errors, data: partial });
        return;
      }

      const row = parsed.data!;
      validGuards.push({
        firstName:      row.firstName,
        lastName:       row.lastName,
        otherNames:     row.otherNames ?? null,
        nationalId:     row.nationalId,
        phone:          row.phone,
        dateOfBirth:    new Date(dobIso!),
        nextOfKinName:  row.nextOfKinName,
        nextOfKinPhone: row.nextOfKinPhone,
        bankName:       row.bankName ?? null,
        accountNumber:  row.accountNumber ?? null,
        salaryRate:     row.salaryRate,
        contractStart:  new Date(contractStartIso!),
        contractEnd:    contractEndIso ? new Date(contractEndIso) : null,
        psoCertNumber:  row.psoCertNumber ?? null,
      });

      results.push({ rowNumber, status: 'SUCCESS', guardName, errors: [], data: partial });
    });

    // Batch insert
    let successful = 0;
    if (validGuards.length > 0) {
      const inserted = await prisma.guard.createMany({
        data:           validGuards,
        skipDuplicates: true,
      });
      successful = inserted.count;
    }

    const failed  = results.filter((r) => r.status === 'ERROR').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED').length;
    const result: BulkImportResult = {
      totalRows:  dataRows.length,
      successful,
      failed,
      skipped,
      results,
    };

    // Generate error report if any failures
    if (failed > 0) {
      result.downloadUrl = await this.generateErrorReport(results);
    }

    await QueueService.logAudit({
      userId:   uploadedBy,
      action:   'BULK_IMPORT',
      entity:   'guard',
      entityId: 'bulk',
      newValue: { total: dataRows.length, successful, failed, skipped },
    });

    return result;
  }

  // ── Error report ─────────────────────────────────────────────────────────────

  private async generateErrorReport(results: BulkImportResultRow[]): Promise<string> {
    const errorRows = results.filter((r) => r.status === 'ERROR');

    const data = [
      ['Row #', ...HEADERS, 'Errors'],
      ...errorRows.map((r) => [
        r.rowNumber,
        ...(COLUMNS.map((c) => r.data[c] ?? '') as unknown[]),
        r.errors.join('; '),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, ...COLUMN_WIDTHS.map((w) => ({ wch: w })), { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');

    const dir = './public/uploads/import-errors';
    fs.mkdirSync(dir, { recursive: true });

    const filename  = `import-errors-${Date.now()}.xlsx`;
    const filepath  = path.join(dir, filename);
    const xlsxBuf   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    fs.writeFileSync(filepath, xlsxBuf);

    return `/uploads/import-errors/${filename}`;
  }
}

export const bulkImportService = new BulkImportService();
