import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard: {
      findMany:   vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

// Suppress error report file writes in tests
vi.mock('fs', () => ({
  default:       { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  mkdirSync:     vi.fn(),
  writeFileSync: vi.fn(),
}));

import prisma from '../../db/prisma';
import { bulkImportService } from '../../services/bulkImportService';

const mockPrisma = prisma as unknown as {
  guard: {
    findMany:   ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildExcelBuffer(dataRows: (string | number)[][]): Buffer {
  const header = [
    'First Name *', 'Last Name *', 'Other Names', 'National ID (NIN) *',
    'Phone *', 'Date of Birth (DD/MM/YYYY) *', 'Next of Kin Name *',
    'Next of Kin Phone *', 'Bank Name', 'Account Number',
    'Monthly Salary (UGX) *', 'Contract Start (DD/MM/YYYY) *',
    'Contract End (DD/MM/YYYY)', 'PSO Certificate Number',
  ];
  const ws = XLSX.utils.aoa_to_sheet([['Title Row'], header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Guards Import Template');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const VALID_ROW: (string | number)[] = [
  'Amina', 'Nakato', '', 'CM1234567890', '+256701234567',
  '20/05/1992', 'John Nakato', '+256712345678',
  'Stanbic', '987654', 480000, '01/04/2026', '', '',
];

const VALID_ROW_2: (string | number)[] = [
  'Robert', 'Ssemwogerere', '', 'CM0987654321', '+256772345678',
  '10/12/1988', 'Grace S', '+256723456789',
  '', '', 520000, '01/04/2026', '', '',
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.guard.findMany.mockResolvedValue([]);
  mockPrisma.guard.createMany.mockResolvedValue({ count: 1 });
});

// ── generateTemplate() ─────────────────────────────────────────────────────────

describe('bulkImportService.generateTemplate()', () => {
  it('returns a Buffer', async () => {
    const buf = await bulkImportService.generateTemplate();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('produces a valid Excel file parseable by SheetJS', async () => {
    const buf = await bulkImportService.generateTemplate();
    expect(() => XLSX.read(buf, { type: 'buffer' })).not.toThrow();
  });

  it('contains correct column headers in row 2', async () => {
    const buf = await bulkImportService.generateTemplate();
    const wb  = XLSX.read(buf, { type: 'buffer' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    const headerRow = rows[1];
    expect(headerRow[0]).toContain('First Name');
    expect(headerRow[3]).toContain('National ID');
    expect(headerRow[10]).toContain('Salary');
  });

  it('contains example data in rows 3-5', async () => {
    const buf = await bulkImportService.generateTemplate();
    const wb  = XLSX.read(buf, { type: 'buffer' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
    // Rows index 2-4 (0-based) should have data
    expect(String(rows[2][0]).trim()).toBeTruthy();
    expect(String(rows[3][0]).trim()).toBeTruthy();
    expect(String(rows[4][0]).trim()).toBeTruthy();
  });
});

// ── parseAndValidate() ─────────────────────────────────────────────────────────

describe('bulkImportService.parseAndValidate()', () => {
  it('valid Excel with 3 rows imports all 3', async () => {
    const row3: (string | number)[] = [
      'Samuel', 'Mugisha', '', 'CM1112223334', '+256712000001',
      '01/01/1995', 'Jane M', '+256712000002', '', '', 450000, '01/04/2026', '', '',
    ];
    mockPrisma.guard.createMany.mockResolvedValue({ count: 3 });

    const buf    = buildExcelBuffer([VALID_ROW, VALID_ROW_2, row3]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.totalRows).toBe(3);
    expect(result.successful).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('row with missing required field adds to failed', async () => {
    const badRow: (string | number)[] = ['', 'Nakato', '', '', '+256701234567',
      '20/05/1992', 'John', '+256712345678', '', '', 480000, '01/04/2026', '', ''];

    const buf    = buildExcelBuffer([badRow]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.failed).toBeGreaterThan(0);
    expect(result.successful).toBe(0);
    expect(result.results[0].status).toBe('ERROR');
  });

  it('row with invalid phone format adds to failed with descriptive error', async () => {
    const badPhone = [...VALID_ROW];
    badPhone[4] = 'not-a-phone';

    const buf    = buildExcelBuffer([badPhone as (string | number)[]]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.failed).toBe(1);
    const errors = result.results[0].errors.join(' ');
    expect(errors.toLowerCase()).toContain('phone');
  });

  it('row with invalid date format adds to failed', async () => {
    const badDate = [...VALID_ROW];
    badDate[5] = '1990-03-15'; // ISO instead of DD/MM/YYYY

    const buf    = buildExcelBuffer([badDate as (string | number)[]]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.failed).toBe(1);
    expect(result.results[0].errors.join(' ').toLowerCase()).toContain('date');
  });

  it('row with duplicate NIN is SKIPPED, not failed', async () => {
    mockPrisma.guard.findMany.mockResolvedValue([{ nationalId: 'CM1234567890' }]);

    const buf    = buildExcelBuffer([VALID_ROW]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.successful).toBe(0);
    expect(result.results[0].status).toBe('SKIPPED');
  });

  it('blank rows at end of file are silently skipped', async () => {
    const blankRow: (string | number)[] = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    mockPrisma.guard.createMany.mockResolvedValue({ count: 1 });

    const buf    = buildExcelBuffer([VALID_ROW, blankRow, blankRow]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.totalRows).toBe(1); // only the valid row
  });

  it('mix of valid and invalid returns correct counts', async () => {
    const badRow: (string | number)[] = ['', 'Only', '', '', '+256701234567',
      '20/05/1992', 'John', '+256712345678', '', '', 480000, '01/04/2026', '', ''];
    mockPrisma.guard.createMany.mockResolvedValue({ count: 1 });

    const buf    = buildExcelBuffer([VALID_ROW, badRow]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.totalRows).toBe(2);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('empty file returns zero counts', async () => {
    const buf    = buildExcelBuffer([]);
    const result = await bulkImportService.parseAndValidate(buf, 'user1');

    expect(result.totalRows).toBe(0);
    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('enqueues audit log on completion', async () => {
    mockPrisma.guard.createMany.mockResolvedValue({ count: 1 });

    const buf = buildExcelBuffer([VALID_ROW]);
    await bulkImportService.parseAndValidate(buf, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BULK_IMPORT' }),
    );
  });
});
