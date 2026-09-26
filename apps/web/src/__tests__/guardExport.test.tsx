import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import type { GuardExportRow } from '@stap/shared';
import { exportGuardsList } from '../lib/exportToExcel';
import { FILE_PREFIX } from '../lib/branding';

/**
 * The guards export writes a workbook straight to a download, so what it puts
 * in the file is checked by reading the workbook back rather than by trusting
 * the call. The download itself is intercepted at createObjectURL.
 */

const guard = (over: Partial<GuardExportRow> = {}): GuardExportRow => ({
  systemId:         'SSLG0001',
  firstName:        'John',
  lastName:         'Okello',
  otherNames:       null,
  fullName:         'John Okello',
  gender:           'MALE',
  dateOfBirth:      '1990-04-12T00:00:00.000Z',
  nationalId:       'CM90012345',
  idType:           'OWN_ID',
  phone:            '+256700000001',
  rank:             'SENIOR_GUARD',
  employmentStatus: 'ACTIVE',
  contractType:     'PERMANENT',
  probationStatus:  'CONFIRMED',
  salaryRate:       300000,
  currentSiteName:  'Garden City',
  clientName:       'Acacia Mall Ltd',
  zoneName:         'Kampala Central',
  nextOfKinName:    'Mary Okello',
  nextOfKinPhone:   '+256700000002',
  district:         'Kampala',
  contractStart:    '2024-01-15T00:00:00.000Z',
  contractEnd:      null,
  createdAt:        '2024-01-10T00:00:00.000Z',
  ...over,
});

/** Captures the workbook handed to the browser as a download. */
let written: XLSX.WorkBook | null = null;
let filename = '';

beforeEach(() => {
  written = null;
  filename = '';

  // jsdom implements neither, so they are defined rather than spied on. The
  // workbook itself is captured from the write call below, because a jsdom Blob
  // does not hand back its bytes synchronously.
  URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

  const realWrite = XLSX.write;
  vi.spyOn(XLSX, 'write').mockImplementation(((wb: XLSX.WorkBook, opts: XLSX.WritingOptions) => {
    written = wb;
    return realWrite(wb, opts);
  }) as typeof XLSX.write);

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    filename = this.download;
  });
});

afterEach(() => { vi.restoreAllMocks(); });

const sheet = (name: string) => {
  const ws = written!.Sheets[name];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
};
const aoa = (name: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(written!.Sheets[name], { header: 1, defval: null });

describe('guard list Excel export', () => {
  it('writes the four sheets', () => {
    exportGuardsList([guard()]);
    expect(written!.SheetNames).toEqual(['Summary', 'All Guards', 'Deployed', 'Unassigned']);
  });

  it('names the file with the deployment and the export date', () => {
    exportGuardsList([guard()], new Date('2026-09-20T09:00:00Z'));
    // The prefix follows this build's product name, so a second brand on the
    // same host does not hand its users the first one's filenames.
    expect(filename).toBe(`${FILE_PREFIX}_Guards_2026-09-20.xlsx`);
    expect(FILE_PREFIX).not.toContain(' ');
  });

  it('puts the headers in row 1, so the sheet can be sorted and filtered', () => {
    exportGuardsList([guard()]);
    const rows = aoa('All Guards');
    expect(rows[0][0]).toBe('System ID');
    expect(rows[0]).toContain('Deployed Site');
    expect(written!.Sheets['All Guards']['!autofilter']).toBeTruthy();
  });

  it('carries one row per guard with the details filled in', () => {
    exportGuardsList([guard(), guard({ systemId: 'SSLG0002', fullName: 'Ann Aciro' })]);
    const rows = sheet('All Guards');

    expect(rows).toHaveLength(2);
    expect(rows[0]['Full Name']).toBe('John Okello');
    expect(rows[0]['Deployed Site']).toBe('Garden City');
    expect(rows[0]['Client']).toBe('Acacia Mall Ltd');
    expect(rows[0]['Zone']).toBe('Kampala Central');
    expect(rows[0]['Next of Kin']).toBe('Mary Okello');
  });

  it('keeps salary a number so the column can be summed', () => {
    exportGuardsList([guard({ salaryRate: 450000 })]);
    expect(sheet('All Guards')[0]['Salary (UGX)']).toBe(450000);
  });

  it('spells out the codes rather than shouting them', () => {
    exportGuardsList([guard()]);
    const row = sheet('All Guards')[0];
    expect(row['Rank']).toBe('SENIOR GUARD');
    expect(row['Status']).toBe('Active');
    expect(row['Probation']).toBe('Confirmed');
  });

  it('splits deployed from unassigned', () => {
    exportGuardsList([
      guard({ systemId: 'A', currentSiteName: 'Garden City' }),
      guard({ systemId: 'B', currentSiteName: null, clientName: null, zoneName: null }),
    ]);

    expect(sheet('Deployed')).toHaveLength(1);
    expect(sheet('Deployed')[0]['System ID']).toBe('A');

    const un = sheet('Unassigned');
    expect(un).toHaveLength(1);
    expect(un[0]['System ID']).toBe('B');
    expect(un[0]['Deployed Site']).toBe('Unassigned');
  });

  it('says so rather than leaving an empty sheet', () => {
    exportGuardsList([guard({ currentSiteName: 'Garden City' })]);
    expect(aoa('Unassigned')[0][0]).toBe('Every guard is currently deployed');
  });

  it('counts the roll on the summary sheet', () => {
    exportGuardsList([
      guard({ employmentStatus: 'ACTIVE', rank: 'GUARD', currentSiteName: 'Garden City' }),
      guard({ employmentStatus: 'ACTIVE', rank: 'GUARD', currentSiteName: null, zoneName: null }),
      guard({ employmentStatus: 'SUSPENDED', rank: 'CORPORAL', currentSiteName: null, zoneName: null }),
    ]);

    // A one-cell row is padded to the sheet width, so the blanks come off first.
    const flat = aoa('Summary').map((r) => r.filter((c) => c !== null && c !== '').join('|'));
    expect(flat).toContain('STAP SECURITY LTD');
    expect(flat).toContain('Total guards|3');
    expect(flat).toContain('Deployed|1');
    expect(flat).toContain('Unassigned|2');
    expect(flat).toContain('Active|2');
    expect(flat).toContain('GUARD|2');
    expect(flat).toContain('No zone|2');
  });

  it('uses the configured company name in the export header', () => {
    exportGuardsList([guard()], new Date('2026-09-20T09:00:00Z'), 'Example Security Ltd');
    const flat = aoa('Summary').map((r) => r.filter((c) => c !== null && c !== '').join('|'));
    expect(flat).toContain('EXAMPLE SECURITY LTD');
    expect(flat).not.toContain('STAP SECURITY LTD');
  });
});
