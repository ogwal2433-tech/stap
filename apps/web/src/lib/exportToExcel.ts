import * as XLSX from 'xlsx';
import type { DailySheetResponse } from '@stap/shared';

// ── Company constants ──────────────────────────────────────────────────────────

const CO_NAME    = 'STAP SECURITY LTD';
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

function fmtTime(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return '';
  try {
    return new Date(isoOrNull).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fmtRank(rank: string | null | undefined): string {
  return (rank ?? 'GUARD').replace(/_/g, ' ');
}

function fmtShift(s: string): string {
  return s === 'DAY' ? 'Day' : s === 'NIGHT' ? 'Night' : '24hr';
}

function shiftLabel(s: string): string {
  return s === 'DAY'     ? 'Day Shift   (06:00 – 18:00)'
       : s === 'NIGHT'   ? 'Night Shift (18:00 – 06:00)'
       :                   '24-Hour     (06:00 – 06:00)';
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
  // Column definitions: #, Guard Name, Rank, Shift, Status, Time In, Time Out, Notes
  const NUM_COLS = 8;
  const wch      = [4, 26, 18, 7, 12, 9, 9, 32];

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
      rows.push(['#', 'GUARD NAME', 'RANK', 'SHIFT', 'STATUS', 'TIME IN', 'TIME OUT', 'NOTES']);
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
          fmtTime(att?.timeIn),
          fmtTime(att?.timeOut),
          att?.notes ?? '',
        ]);
        rowHeights.push(15);
      }

      // Site totals (spans cols 1–7)
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
  triggerBlob(wb, `STAP_Attendance_${date.replace(/-/g, '')}.xlsx`);
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
  triggerBlob(wb, `STAP_Roster_${siteSlug}_${data.date.replace(/-/g, '')}.xlsx`);
}
