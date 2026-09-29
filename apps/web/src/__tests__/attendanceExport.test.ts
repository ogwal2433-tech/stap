import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { exportAttendanceSummary } from '../lib/exportToExcel';
import type { GuardAttendanceSummaryResponse } from '@security360/shared';

/**
 * The export is the deliverable for "report under export excel", so these
 * assert the actual workbook bytes rather than the data going in: the column
 * order supervisors read, day counts stored as numbers so Excel can sum them,
 * and a totals row.
 */

const data: GuardAttendanceSummaryResponse = {
  dateFrom:   '2026-11-02T00:00:00.000Z',
  dateTo:     '2026-11-06T23:59:59.999Z',
  totalDays:  5,
  guardCount: 2,
  summary: [
    {
      guardId: 'a', guardName: 'Alice Nakato', systemId: 'S360G001', rank: 'GUARD',
      presentDays: 2, lateDays: 1, sickDays: 1, onLeaveDays: 0, absentDays: 1, awolDays: 0,
      totalRecords: 5, attendanceRate: 60, sites: 'KCCA City Hall',
    },
    {
      guardId: 'b', guardName: 'Bob Okello', systemId: 'S360G002', rank: 'SENIOR_GUARD',
      presentDays: 2, lateDays: 0, sickDays: 0, onLeaveDays: 1, absentDays: 0, awolDays: 0,
      totalRecords: 3, attendanceRate: 67, sites: 'URA Nakawa',
    },
  ],
};

/** Grabs the bytes triggerBlob would have downloaded. */
let written: unknown = null;

beforeEach(() => {
  written = null;
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });

  const realWrite = XLSX.write;
  vi.spyOn(XLSX, 'write').mockImplementation(((wb: XLSX.WorkBook, opts: XLSX.WritingOptions) => {
    const out = realWrite(wb, opts);
    written = out;
    return out;
  }) as typeof XLSX.write);
});

function sheetRows(): unknown[][] {
  const wb = XLSX.read(written as Uint8Array, { type: 'array' });
  expect(wb.SheetNames).toContain('Attendance Summary');
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Attendance Summary'], {
    header: 1, blankrows: true, defval: '',
  });
}

describe('exportAttendanceSummary', () => {
  it('writes one row per guard under the expected column headers', () => {
    exportAttendanceSummary(data);
    const rows = sheetRows();

    expect(rows[0][0]).toBe('SECURITY360 LTD');
    expect(rows[1][0]).toBe('ATTENDANCE SUMMARY REPORT');

    const headerIdx = rows.findIndex(r => r[0] === '#' && r[1] === 'Guard Name');
    expect(rows[headerIdx]).toEqual([
      '#', 'Guard Name', 'Guard ID', 'Rank', 'Period',
      'Present Days', 'Late Days', 'Sick Days', 'On Leave Days',
      'Absent Days', 'AWOL Days', 'Days Recorded', 'Attendance Rate %', 'Sites',
    ]);

    const alice = rows[headerIdx + 1];
    expect(alice[1]).toBe('Alice Nakato');
    expect(alice[3]).toBe('GUARD');
    expect(alice[5]).toBe(2);   // present days
    expect(alice[7]).toBe(1);   // sick days
    expect(alice[12]).toBe(60); // attendance rate
  });

  it('stores day counts as numbers so the sheet can be summed', () => {
    exportAttendanceSummary(data);
    const rows = sheetRows();
    const headerIdx = rows.findIndex(r => r[0] === '#' && r[1] === 'Guard Name');

    for (const col of [5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(typeof rows[headerIdx + 1][col]).toBe('number');
    }
  });

  it('totals every day-count column across guards', () => {
    exportAttendanceSummary(data);
    const totals = sheetRows().find(r => r[1] === 'TOTAL');

    expect(totals).toBeTruthy();
    expect(totals![5]).toBe(4);   // 2 + 2 present
    expect(totals![8]).toBe(1);   // 0 + 1 on leave
    expect(totals![11]).toBe(8);  // 5 + 3 records
    expect(totals![12]).toBe(63); // (4 present + 1 late) / 8
  });

  it('still produces a readable sheet when nobody has attendance', () => {
    exportAttendanceSummary({ ...data, guardCount: 0, summary: [] });
    const rows = sheetRows();
    expect(rows.some(r => String(r[1]).includes('No attendance recorded'))).toBe(true);
  });
});
