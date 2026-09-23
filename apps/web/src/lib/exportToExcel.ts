import * as XLSX from 'xlsx';
import { COMPANY_NAME_UPPER, FILE_PREFIX } from './branding';
import type {
  DailySheetResponse, GuardAttendanceSummaryResponse, GuardExportRow, GuardResponse,
} from '@stap/shared';

// ── Company constants ──────────────────────────────────────────────────────────

const CO_NAME    = COMPANY_NAME_UPPER;
const CO_ADDRESS = 'Kampala, Uganda';
const CO_LINE2   = 'Security Guards · Investigations · Event Security';

// ── Internal helpers ───────────────────────────────────────────────────────────

type CellValue = string | number | null | undefined;

function triggerBlob(wb: XLSX.WorkBook, filename: string) {
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtRank(rank: string | null | undefined): string {
  return (rank ?? 'GUARD').replace(/_/g, ' ');
}

function fmtShift(s: string): string {
  return s === 'DAY' ? 'Day' : s === 'NIGHT' ? 'Night' : '24hr';
}

function shiftLabel(s: string): string {
  return s === 'DAY'     ? 'Day Shift   (06:00 - 18:00)'
       : s === 'NIGHT'   ? 'Night Shift (18:00 - 06:00)'
       :                   '24-Hour     (06:00 - 06:00)';
}

// Build a WorkSheet from AOA rows, column widths, merges, and optional row heights.
function buildSheet(
  rows:       CellValue[][],
  wch:        number[],
  merges:     XLSX.Range[],
  rowHeights: number[],
): XLSX.WorkSheet {
  const ws         = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']      = wch.map((w) => ({ wch: w }));
  ws['!merges']    = merges;
  ws['!rows']      = rowHeights.map((h) => ({ hpt: h }));
  return ws;
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE SHEET EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export function exportAttendanceSheet(sheet: DailySheetResponse, date: string): void {
  // Column definitions: #, Guard Name, Rank, Shift, Status, Notes
  const NUM_COLS = 6;
  const wch      = [4, 26, 18, 7, 12, 32];

  const rows:       CellValue[][] = [];
  const merges:     XLSX.Range[]  = [];
  const rowHeights: number[]      = [];

  // Helper: append a full-width merged row
  const addBanner = (text: string, hpt: number) => {
    const r = rows.length;
    rows.push([text]);
    merges.push({ s: { r, c: 0 }, e: { r, c: NUM_COLS - 1 } });
    rowHeights.push(hpt);
  };

  const addBlank = (hpt = 6) => { rows.push([]); rowHeights.push(hpt); };

  // ── Letterhead ─────────────────────────────────────────────────────────────
  addBanner(CO_NAME, 22);
  addBanner(CO_ADDRESS, 14);
  addBanner(CO_LINE2, 12);
  addBlank();
  addBanner('DAILY DEPLOYMENT & ATTENDANCE SHEET', 18);
  addBanner(`Date:  ${fmtDate(date)}`, 14);
  // Generated timestamp (right-aligned by putting it in last column)
  {
    const r = rows.length;
    const row: CellValue[] = new Array(NUM_COLS).fill(null);
    row[0] = 'Generated:';
    row[NUM_COLS - 1] = new Date().toLocaleString('en-GB');
    rows.push(row);
    rowHeights.push(12);
    merges.push({ s: { r, c: NUM_COLS - 1 }, e: { r, c: NUM_COLS - 1 } });
  }
  addBlank(8);

  // ── Overall summary ────────────────────────────────────────────────────────
  const allDeps   = sheet.zones.flatMap((z) => z.sites).flatMap((s) => s.deployments);
  const totPres   = allDeps.filter((d) => d.attendance?.status === 'PRESENT').length;
  const totAbs    = allDeps.filter((d) => ['ABSENT', 'AWOL'].includes(d.attendance?.status ?? '')).length;
  const totUnmark = allDeps.filter((d) => !d.attendance).length;

  addBanner(
    `SUMMARY  —  ${allDeps.length} guards deployed  |  ✓ ${totPres} present  |  ✗ ${totAbs} absent  |  ⏳ ${totUnmark} unmarked`,
    14,
  );
  addBlank(10);

  const multiZone = sheet.zones.some((z) => z.zoneId !== null);

  // ── Zone & site groups ─────────────────────────────────────────────────────
  for (const zone of sheet.zones) {
    if (multiZone) {
      addBanner(`ZONE:  ${zone.zoneName ?? 'NO ZONE ASSIGNED'}`, 16);
      addBlank(4);
    }

    for (const sg of zone.sites) {
      const { site, deployments, presentCount, absentCount, unmarkedCount } = sg;

      // Site header (single merged row)
      addBanner(
        `SITE: ${site.siteName}   |   Client: ${site.client.clientName}   |   📍 ${site.location}   |   Required: ${site.guardsRequired} guard(s)`,
        16,
      );

      // Column headers
      rows.push(['#', 'GUARD NAME', 'RANK', 'SHIFT', 'STATUS', 'NOTES']);
      rowHeights.push(14);

      // Guard rows
      for (let i = 0; i < deployments.length; i++) {
        const dep = deployments[i];
        const att = dep.attendance;
        rows.push([
          i + 1,
          dep.guard.fullName,
          fmtRank(dep.guard.rank),
          fmtShift(dep.shiftType),
          att?.status ?? '—',
          att?.notes ?? '',
        ]);
        rowHeights.push(15);
      }

      // Site totals (spans cols 1-7)
      {
        const r    = rows.length;
        const row: CellValue[] = new Array(NUM_COLS).fill(null);
        row[1] = `Total: ${deployments.length}  |  ✓ ${presentCount} present  |  ✗ ${absentCount} absent  |  ⏳ ${unmarkedCount} unmarked`;
        rows.push(row);
        merges.push({ s: { r, c: 1 }, e: { r, c: NUM_COLS - 1 } });
        rowHeights.push(13);
      }

      addBlank(6);
    }

    if (multiZone) addBlank(6);
  }

  const ws = buildSheet(rows, wch, merges, rowHeights);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');
  triggerBlob(wb, `${FILE_PREFIX}_Attendance_${date.replace(/-/g, '')}.xlsx`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ROSTER DRAFT EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export interface RosterExportData {
  zoneName:       string;
  siteName:       string;
  clientName:     string;
  location:       string;
  date:           string;          // YYYY-MM-DD
  shiftType:      string;          // DAY | NIGHT | FULL_24
  supervisorName: string;
  guardsRequired: number;
  guards: { firstName: string; lastName: string; rank: string | null }[];
}

export function exportRosterDraft(data: RosterExportData): void {
  // Columns: #, Guard Name, Rank, Signature
  const NUM_COLS = 4;
  const wch      = [4, 30, 20, 28];

  const rows:       CellValue[][] = [];
  const merges:     XLSX.Range[]  = [];
  const rowHeights: number[]      = [];

  const addBanner = (text: string, hpt: number) => {
    const r = rows.length;
    rows.push([text]);
    merges.push({ s: { r, c: 0 }, e: { r, c: NUM_COLS - 1 } });
    rowHeights.push(hpt);
  };

  const addBlank = (hpt = 6) => { rows.push([]); rowHeights.push(hpt); };

  const kv = (k: string, v: CellValue, k2: string, v2: CellValue): CellValue[] =>
    [k, v, k2, v2];

  const staffed = data.guards.length >= data.guardsRequired && data.guardsRequired > 0
    ? 'FULLY STAFFED'
    : data.guardsRequired > 0
    ? `UNDER-STAFFED  (${data.guardsRequired - data.guards.length} short)`
    : 'NO LIMIT SET';

  // ── Letterhead ─────────────────────────────────────────────────────────────
  addBanner(CO_NAME, 22);
  addBanner(CO_ADDRESS, 13);
  addBanner(CO_LINE2, 11);
  addBlank();
  addBanner('DEPLOYMENT ROSTER', 18);
  addBlank(8);

  // ── Metadata block ─────────────────────────────────────────────────────────
  rows.push(kv('Zone:',        data.zoneName,                   'Date:',          fmtDate(data.date)));  rowHeights.push(14);
  rows.push(kv('Site:',        data.siteName,                   'Client:',        data.clientName));      rowHeights.push(14);
  rows.push(kv('Location:',    data.location,                   'Shift:',         shiftLabel(data.shiftType))); rowHeights.push(14);
  rows.push(kv('Supervisor:',  data.supervisorName,             'Req. Guards:',   data.guardsRequired));  rowHeights.push(14);
  rows.push(kv('Assigned:',    data.guards.length,              'Status:',        staffed));               rowHeights.push(14);
  addBlank(10);

  // ── Guard table ────────────────────────────────────────────────────────────
  rows.push(['#', 'GUARD NAME', 'RANK', 'SIGNATURE']);
  rowHeights.push(15);

  for (let i = 0; i < data.guards.length; i++) {
    const g = data.guards[i];
    rows.push([i + 1, `${g.firstName} ${g.lastName}`, fmtRank(g.rank), '']);
    rowHeights.push(16);
  }

  addBlank(12);
  addBlank(8);

  // ── Signature block ────────────────────────────────────────────────────────
  addBanner('FOR OFFICIAL USE', 12);
  addBlank(6);
  rows.push(kv('Prepared by:', '', 'Approved by:', ''));    rowHeights.push(13);
  rows.push(kv('Name:',        '________________________________', 'Name:',      '________________________________')); rowHeights.push(22);
  rows.push(kv('Date:',        '________________________________', 'Date:',      '________________________________')); rowHeights.push(22);
  rows.push(kv('Signature:',   '________________________________', 'Signature:', '________________________________')); rowHeights.push(22);

  const ws = buildSheet(rows, wch, merges, rowHeights);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Deployment Roster');

  const siteSlug = data.siteName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  triggerBlob(wb, `${FILE_PREFIX}_Roster_${siteSlug}_${data.date.replace(/-/g, '')}.xlsx`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE SUMMARY EXPORT (per guard, over a date range)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * One row per guard for the selected period — the "overall status of the
 * guards attendance" report. Day counts are written as numbers, not text, so
 * the sheet can be summed and sorted in Excel.
 */
export function exportAttendanceSummary(data: GuardAttendanceSummaryResponse): void {
  const from = data.dateFrom.slice(0, 10);
  const to   = data.dateTo.slice(0, 10);
  const periodLabel = `${fmtDate(from)} to ${fmtDate(to)}`;

  const header: CellValue[][] = [
    [CO_NAME],
    ['ATTENDANCE SUMMARY REPORT'],
    [CO_ADDRESS],
    [CO_LINE2],
    [],
    ['Period:', periodLabel, '', 'Calendar days:', data.totalDays],
    ['Guards:', data.guardCount, '', 'Generated:', new Date().toLocaleString('en-GB')],
    [],
  ];

  const columns = [
    '#', 'Guard Name', 'Guard ID', 'Rank', 'Period',
    'Present Days', 'Late Days', 'Sick Days', 'On Leave Days',
    'Absent Days', 'AWOL Days', 'Days Recorded', 'Attendance Rate %', 'Sites',
  ];

  const body: CellValue[][] = data.summary.map((g, i) => [
    i + 1,
    g.guardName,
    g.systemId ?? '—',
    fmtRank(g.rank),
    periodLabel,
    g.presentDays,
    g.lateDays,
    g.sickDays,
    g.onLeaveDays,
    g.absentDays,
    g.awolDays,
    g.totalRecords,
    g.attendanceRate,
    g.sites,
  ]);

  // Column totals, so the sheet answers "how did the whole team do".
  const sum = (pick: (g: GuardAttendanceSummaryResponse['summary'][number]) => number) =>
    data.summary.reduce((acc, g) => acc + pick(g), 0);

  const totalRecords = sum(g => g.totalRecords);
  const totals: CellValue[] = [
    '', 'TOTAL', '', '', '',
    sum(g => g.presentDays),
    sum(g => g.lateDays),
    sum(g => g.sickDays),
    sum(g => g.onLeaveDays),
    sum(g => g.absentDays),
    sum(g => g.awolDays),
    totalRecords,
    totalRecords > 0
      ? Math.round(((sum(g => g.presentDays) + sum(g => g.lateDays)) / totalRecords) * 100)
      : 0,
    '',
  ];

  const rows: CellValue[][] = data.summary.length
    ? [...header, columns, ...body, [], totals]
    : [...header, columns, ['', 'No attendance recorded for this period.']];

  const widths = [4, 26, 12, 18, 26, 13, 11, 11, 14, 12, 11, 14, 17, 40];
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 13 } },
  ];

  const ws = buildSheet(rows, widths, merges, [22, 20, 14, 14, 8]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Summary');

  triggerBlob(wb, `${FILE_PREFIX}_Attendance_${from.replace(/-/g, '')}_to_${to.replace(/-/g, '')}.xlsx`);
}


// ══════════════════════════════════════════════════════════════════════════════
// GUARD LIST EXPORT
// ══════════════════════════════════════════════════════════════════════════════

/** Columns of the guard roll, in the order they appear in the sheet. */
const GUARD_COLUMNS: { header: string; width: number; value: (g: GuardExportRow) => CellValue }[] = [
  { header: 'System ID',    width: 12, value: (g) => g.systemId },
  { header: 'Full Name',    width: 26, value: (g) => g.fullName },
  { header: 'First Name',   width: 15, value: (g) => g.firstName },
  { header: 'Last Name',    width: 15, value: (g) => g.lastName },
  { header: 'Gender',       width: 9,  value: (g) => g.gender },
  { header: 'Date of Birth', width: 13, value: (g) => fmtDay(g.dateOfBirth) },
  { header: 'National ID',  width: 18, value: (g) => g.nationalId },
  { header: 'ID Type',      width: 15, value: (g) => fmtCode(g.idType) },
  { header: 'Phone',        width: 15, value: (g) => g.phone },
  { header: 'Rank',         width: 15, value: (g) => fmtRank(g.rank) },
  { header: 'Status',       width: 13, value: (g) => fmtCode(g.employmentStatus) },
  { header: 'Contract Type', width: 13, value: (g) => fmtCode(g.contractType) },
  { header: 'Probation',    width: 14, value: (g) => fmtCode(g.probationStatus) },
  // A number, not a formatted string, so the column can be summed in Excel.
  { header: 'Salary (UGX)', width: 14, value: (g) => g.salaryRate },
  { header: 'Deployed Site', width: 26, value: (g) => g.currentSiteName ?? 'Unassigned' },
  { header: 'Client',       width: 26, value: (g) => g.clientName },
  { header: 'Zone',         width: 16, value: (g) => g.zoneName ?? 'No zone' },
  { header: 'Next of Kin',  width: 22, value: (g) => g.nextOfKinName },
  { header: 'Next of Kin Phone', width: 16, value: (g) => g.nextOfKinPhone },
  { header: 'District',     width: 16, value: (g) => g.district },
  { header: 'Contract Start', width: 13, value: (g) => fmtDay(g.contractStart) },
  { header: 'Contract End', width: 13, value: (g) => fmtDay(g.contractEnd) },
  { header: 'Date Added',   width: 13, value: (g) => fmtDay(g.createdAt) },
];

function fmtDay(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB') : '';
}

/** TITLE_CASE codes read as words in a spreadsheet: ON_PROBATION → On Probation. */
function fmtCode(code: string | null | undefined): string {
  if (!code) return '';
  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Counts by one field, highest first — the shape the Summary sheet wants. */
function tally(rows: GuardExportRow[], pick: (g: GuardExportRow) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row) || 'Unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** A plain data sheet: headers in row 1, so it sorts and filters in Excel. */
function guardSheet(rows: GuardExportRow[], emptyNote: string): XLSX.WorkSheet {
  if (rows.length === 0) {
    return buildSheet([[emptyNote]], [40], [], [14]);
  }

  const aoa: CellValue[][] = [
    GUARD_COLUMNS.map((c) => c.header),
    ...rows.map((g) => GUARD_COLUMNS.map((c) => c.value(g))),
  ];

  const ws = buildSheet(aoa, GUARD_COLUMNS.map((c) => c.width), [], [16]);
  // Freeze the header and turn on the filter dropdowns — this is a sheet people
  // sort and slice, not one they print.
  ws['!freeze'] = { xSplit: '0', ySplit: '1' };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: GUARD_COLUMNS.length - 1 },
  }) };
  return ws;
}

/**
 * The whole guard roll as a workbook: the full list, a summary, and the list
 * split by whether the guard is currently deployed.
 *
 * The letterhead sits on the Summary sheet rather than above the data. Banner
 * rows above a table push the headers out of row 1, which stops Excel's filter
 * and sort from reading the columns — and this is a sheet meant to be worked,
 * not printed.
 */
export function exportGuardsList(guards: GuardExportRow[], exportedAt = new Date()): void {
  const wb = XLSX.utils.book_new();

  const deployed   = guards.filter((g) => g.currentSiteName);
  const unassigned = guards.filter((g) => !g.currentSiteName);

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary: CellValue[][] = [
    [CO_NAME],
    [CO_ADDRESS],
    [CO_LINE2],
    [],
    ['GUARD LIST EXPORT'],
    ['Generated', exportedAt.toLocaleString('en-GB')],
    ['Total guards', guards.length],
    ['Deployed', deployed.length],
    ['Unassigned', unassigned.length],
    [],
    ['BY STATUS', 'COUNT'],
    ...tally(guards, (g) => fmtCode(g.employmentStatus)),
    [],
    ['BY RANK', 'COUNT'],
    ...tally(guards, (g) => fmtRank(g.rank)),
    [],
    ['BY ZONE', 'COUNT'],
    ...tally(guards, (g) => g.zoneName ?? 'No zone'),
  ];

  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(summary, [28, 14], [], [22, 14, 12, 8, 18, 14]),
    'Summary',
  );

  XLSX.utils.book_append_sheet(wb, guardSheet(guards, 'No guards to export'), 'All Guards');
  XLSX.utils.book_append_sheet(wb, guardSheet(deployed, 'No guards are currently deployed'), 'Deployed');
  XLSX.utils.book_append_sheet(wb, guardSheet(unassigned, 'Every guard is currently deployed'), 'Unassigned');

  const stamp = exportedAt.toISOString().slice(0, 10);
  triggerBlob(wb, `${FILE_PREFIX}_Guards_${stamp}.xlsx`);
}

/**
 * One guard as a profile sheet — the detail page's counterpart to the roll.
 *
 * Laid out as label/value pairs rather than a table: a single record read down
 * the page, not a row to be sorted. The bank account number is left out here
 * too, for the same reason it is left out of the roll.
 */
export function exportGuardProfile(guard: GuardResponse, exportedAt = new Date()): void {
  const rows: CellValue[][] = [
    [CO_NAME],
    [CO_ADDRESS],
    [],
    ['GUARD PROFILE'],
    ['Generated', exportedAt.toLocaleString('en-GB')],
    [],
    ['System ID',        guard.systemId],
    ['Full Name',        guard.fullName],
    ['Gender',           guard.gender],
    ['Date of Birth',    fmtDay(guard.dateOfBirth)],
    ['National ID',      guard.nationalId],
    ['ID Type',          fmtCode(guard.idType)],
    ['Phone',            guard.phone],
    [],
    ['Rank',             fmtRank(guard.rank)],
    ['Status',           fmtCode(guard.employmentStatus)],
    ['Contract Type',    fmtCode(guard.contractType)],
    ['Probation',        fmtCode(guard.probationStatus)],
    ['Salary (UGX)',     guard.salaryRate],
    ['Contract Start',   fmtDay(guard.contractStart)],
    ['Contract End',     fmtDay(guard.contractEnd)],
    ['Deployed Site',    guard.currentSiteName ?? 'Unassigned'],
    [],
    ['Next of Kin',      guard.nextOfKinName],
    ['Next of Kin Phone', guard.nextOfKinPhone],
    ['District',         guard.district],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(rows, [22, 34], [], [22, 14, 8, 18]), 'Guard Profile');

  const who = guard.systemId ?? guard.lastName;
  triggerBlob(wb, `${FILE_PREFIX}_Guard_${who}_${exportedAt.toISOString().slice(0, 10)}.xlsx`);
}
