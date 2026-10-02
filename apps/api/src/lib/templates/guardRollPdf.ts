/**
 * The guard list as a printed page — the PDF half of the guards export.
 *
 * Only the inner content: renderToPdf() wraps this in the letterhead and the
 * footer band, so neither is repeated here.
 *
 * Narrower on purpose than the spreadsheet. The Excel file carries all 23
 * columns because it is meant to be sorted and sliced; this is meant to be read
 * and signed, so it holds who the guard is, where they are posted and how they
 * stand. The National ID stays out — a printed list travels further than a
 * laptop does.
 */

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const ugx = (n: number) => `UGX ${(n ?? 0).toLocaleString()}`;

export interface GuardRollPdfRow {
  index:      number;
  systemId:   string | null;
  fullName:   string;
  rank:       string;
  status:     string;
  phone:      string | null;
  /** The open deployment, or null when the guard holds none. */
  site:       string | null;
  client:     string | null;
  salaryRate: number;
}

export interface GuardRollPdfData {
  printDate:   string;
  generatedBy: string;
  /** How many rows this list holds, and how many of them are posted somewhere. */
  guardCount:  number;
  postedCount: number;
  /** The filters the list was taken under, in words; 'All guards' when none. */
  selection:   string;
  /** Salary is a finance-only column on screen, so it prints only for them. */
  showSalary:  boolean;
  rows:        GuardRollPdfRow[];
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ACTIVE:      { bg: '#d5f5e3', fg: '#1E8449' },
  ON_LEAVE:    { bg: '#cff4fc', fg: '#055160' },
  SUSPENDED:   { bg: '#fff3cd', fg: '#856404' },
  RESIGNED:    { bg: '#e9ecef', fg: '#495057' },
  TERMINATED:  { bg: '#f8d7da', fg: '#C0392B' },
};

function metaCell(label: string, value: string): string {
  return `
    <td style="padding:5px 10px;vertical-align:top">
      <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">${esc(label)}</div>
      <div style="font-weight:700;color:${NAVY};font-size:9.5pt">${esc(value)}</div>
    </td>`;
}

/**
 * Column widths, in rough points, held to the A4 width the letterhead leaves
 * once its side padding is taken off. Salary only joins when it is allowed to
 * print, and the name column gives way to make room.
 */
const COLS = {
  index:  26,
  sysId:  62,
  name:   150,
  nameWithSalary: 118,
  rank:   78,
  status: 66,
  phone:  72,
  site:   108,
  client: 108,
  salary: 86,
};

function headCell(label: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  return `<th style="padding:5px 6px;text-align:${align};font-size:8pt;width:${width}px">${esc(label)}</th>`;
}

function bodyCell(value: string, style = ''): string {
  return `<td style="padding:4px 6px;border-bottom:1px solid #e9ecef;${style}">${value}</td>`;
}

export function buildGuardRollPdfHtml(data: GuardRollPdfData): string {
  // Salary is the ninth column, and it is the one that decides whether this
  // page may be left on a desk.
  const NUM_COLS = data.showSalary ? 9 : 8;

  const header = [
    headCell('#', COLS.index, 'center'),
    headCell('Sys ID', COLS.sysId),
    headCell('Guard Name', data.showSalary ? COLS.nameWithSalary : COLS.name),
    headCell('Rank', COLS.rank),
    headCell('Status', COLS.status, 'center'),
    headCell('Phone', COLS.phone),
    headCell('Posted Site', COLS.site),
    headCell('Client', COLS.client),
    ...(data.showSalary ? [headCell('Salary (UGX)', COLS.salary, 'right')] : []),
  ].join('');

  const rows = data.rows
    .map((r, i) => {
      const badge = STATUS_STYLE[r.status] ?? { bg: '#e9ecef', fg: '#495057' };
      const cells = [
        bodyCell(String(r.index), 'text-align:center'),
        bodyCell(esc(r.systemId || '—')),
        bodyCell(esc(r.fullName), 'font-weight:600'),
        bodyCell(esc(r.rank.replace(/_/g, ' '))),
        bodyCell(
          `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:7.5pt;` +
            `font-weight:700;background:${badge.bg};color:${badge.fg}">${esc(r.status.replace(/_/g, ' '))}</span>`,
          'text-align:center',
        ),
        bodyCell(esc(r.phone || '—')),
        bodyCell(r.site ? esc(r.site) : `<span style="color:#adb5bd">Unassigned</span>`),
        bodyCell(r.client ? esc(r.client) : `<span style="color:#adb5bd">—</span>`),
        ...(data.showSalary ? [bodyCell(ugx(r.salaryRate), 'text-align:right')] : []),
      ];
      return `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#F8F9FA'}">${cells.join('')}</tr>`;
    })
    .join('');

  const signatureBlock = (role: string) => `
    <div style="flex:1">
      <div style="border-bottom:1px solid #4A5568;height:24px;margin-bottom:3px"></div>
      <div style="font-size:8pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">${esc(role)}</div>
      <div style="font-size:8pt;color:#adb5bd">Name / Date / Signature</div>
    </div>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;font-size:10pt;line-height:1.3">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:15pt;font-weight:900;color:${NAVY};letter-spacing:0.5px">GUARD LIST</div>
        <div style="font-size:10pt;color:#6c757d;margin-top:2px">${esc(data.selection)}</div>
      </div>
      <div style="text-align:right;font-size:8.5pt;color:#6c757d">
        ${esc(data.printDate)}
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#F2F4F7;border-left:3px solid ${AMBER};margin-bottom:10px;page-break-inside:avoid">
      <tr>
        ${metaCell('Guards In This List', String(data.guardCount))}
        ${metaCell('Currently Posted', String(data.postedCount))}
        ${metaCell('Unassigned', String(data.guardCount - data.postedCount))}
      </tr>
      <tr>
        ${metaCell('Selection', data.selection)}
        ${metaCell('Printed', data.printDate)}
        ${metaCell('Generated By', data.generatedBy)}
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
      <thead>
        <tr style="background:${NAVY};color:#ffffff">${header}</tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${NUM_COLS}" style="padding:12px;text-align:center;color:#6c757d">No guard matches this selection.</td></tr>`}
      </tbody>
    </table>

    <div style="margin-top:16px;display:flex;gap:28px;page-break-inside:avoid">
      ${signatureBlock('Prepared By')}
      ${signatureBlock('Checked By')}
      ${signatureBlock('Approved By')}
    </div>

    <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e9ecef;font-size:8.5pt;color:#6c757d">
      ${esc(data.generatedBy)} printed ${esc(data.printDate)} from ${esc(data.selection)}.
      A guard's posting is the assignment they hold now, not necessarily today's roster.
    </div>
  </div>`;
}
