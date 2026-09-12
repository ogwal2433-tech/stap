import { renderToPdf } from './pdfBase';
import { computeDuration, PRIORITY_LEVELS } from '@stap/shared';
import type { MotorcycleReport, PendingMatter } from '@stap/shared';

type Row = Record<string, string>;

const NAVY = '#1B3A6B';
const TEAL = '#0F7B6C';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// break-after:avoid keeps a section header on the same page as its table —
// without it a heading can end a page and its rows begin the next.
const section = (n: number, title: string) => `
  <div style="background:${NAVY};color:#fff;padding:5px 10px;font-weight:700;
              font-size:9.5pt;letter-spacing:.4px;margin:14px 0 6px;
              break-after:avoid;page-break-after:avoid;">
    ${n}. ${esc(title)}
  </div>`;

/** A table, or a line saying the section was left empty — never a bare header. */
function table(cols: { key: string; label: string; width?: string }[], rows: Row[]): string {
  if (!rows.length) {
    return `<div style="font-size:8.5pt;color:#666;font-style:italic;padding:3px 0 8px;">
              Nothing recorded for this section.
            </div>`;
  }
  const th = cols.map((c) =>
    `<th style="border:1px solid #b9c2cf;padding:4px 6px;background:#eef1f6;
                font-size:8pt;text-align:left;${c.width ? `width:${c.width};` : ''}">
       ${esc(c.label)}</th>`).join('');
  const tr = rows.map((r) =>
    `<tr>${cols.map((c) =>
      `<td style="border:1px solid #b9c2cf;padding:4px 6px;font-size:8.5pt;
                  vertical-align:top;">${esc(r[c.key]) || '&nbsp;'}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;
                     break-inside:avoid;page-break-inside:avoid;">
            <thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

const field = (label: string, value: unknown) => `
  <td style="padding:2px 8px 2px 0;font-size:8.5pt;">
    <span style="color:#666;">${esc(label)}:</span>
    <strong>${esc(value) || '—'}</strong>
  </td>`;

const freeText = (label: string, value: unknown) => `
  <div style="margin-bottom:10px;">
    <div style="font-size:8pt;color:#666;margin-bottom:2px;">${esc(label)}</div>
    <div style="border:1px solid #b9c2cf;padding:6px 8px;font-size:8.5pt;min-height:26px;
                white-space:pre-wrap;">${esc(value) || '&nbsp;'}</div>
  </div>`;

export interface ShiftReportPdfData {
  systemId:          string | null;
  date:              string;
  shift:             string;
  controllerName:    string;
  timeFrom:          string;
  timeTo:            string;
  status:            string;
  deploymentRows:    Row[];
  deploymentRemarks: string | null;
  incidents:         Row[];
  supervisionRows:   Row[];
  clientComms:       Row[];
  gunsDeployed:      Row[];
  disciplineIssues:  Row[];
  pendingMatters:    PendingMatter[];
  motorcycleReport:  MotorcycleReport[];
  totalIncidents:    number;
  totalClientCalls:  number;
  totalAbsentees:    number;
  totalReplacements: number;
  majorIssue:             string | null;
  outgoingControllerName: string | null;
  outgoingTime:           string | null;
  incomingControllerName: string | null;
  incomingTime:           string | null;
  acknowledgedBy:         string | null;
  acknowledgedAt:         string | null;
}

/**
 * Section 9 prints one block per motorcycle: the zone line, then only the
 * period tables that have rows. A motorcycle with a quiet shift says so — an
 * empty table beneath a plate number reads as missing data rather than a
 * clean shift.
 */
function motorcycleBlock(mc: MotorcycleReport): string {
  const head = [mc.zone, mc.motorcycleId, mc.riderName ? `(${mc.riderName})` : '']
    .filter(Boolean).map(esc).join(' — ');

  const periods = (
    label: string, colour: string, bg: string,
    rows: { from: string; to: string; tail: string }[],
  ) => rows.length === 0 ? '' : `
    <div style="font-size:8pt;font-weight:700;color:${colour};margin:4px 0 2px;">${label}</div>
    ${rows.map((p) => `
      <div style="font-size:8.5pt;background:${bg};border-radius:3px;padding:3px 6px;
                  margin-bottom:2px;color:${colour};">
        ${esc(p.from) || '—'} – ${esc(p.to) || '—'}
        ${p.from && p.to ? `(${esc(computeDuration(p.from, p.to))})` : ''}
        ${p.tail ? ` · ${esc(p.tail)}` : ''}
      </div>`).join('')}`;

  const unreachable = periods('Unreachable periods', '#C0392B', '#FDF2F2',
    (mc.unreachablePeriods ?? []).map((u) => ({ from: u.from, to: u.to, tail: u.reason })));
  const parked = periods('Long parked periods', '#856404', '#FEF9E7',
    (mc.longParkedPeriods ?? []).map((p) => ({ from: p.from, to: p.to, tail: p.location })));

  return `
    <div style="border:1px solid #A9DFBF;border-radius:4px;margin-bottom:6px;
                break-inside:avoid;page-break-inside:avoid;">
      <div style="background:#E8F8F5;padding:4px 8px;font-size:8.5pt;font-weight:700;color:${TEAL};">
        ${head || 'Motorcycle'}
      </div>
      <div style="padding:4px 8px;">
        ${unreachable || parked
          ? `${unreachable}${parked}`
          : `<div style="font-size:8pt;color:#666;font-style:italic;">
               No unreachable or long parking periods recorded.
             </div>`}
      </div>
    </div>`;
}

/** Renders the handover onto the STAP letterhead, laid out as the paper form. */
export async function renderShiftReportPdf(r: ShiftReportPdfData): Promise<Buffer> {
  const dateStr = new Date(r.date).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'long', year: 'numeric' });

  // The four totals and the handover block each read as one unit.
  const totals = [
    ['Total Incidents',    r.totalIncidents],
    ['Total Client Calls', r.totalClientCalls],
    ['Total Absentees',    r.totalAbsentees],
    ['Total Replacements', r.totalReplacements],
  ].map(([l, v]) => `
    <td style="border:1px solid #b9c2cf;padding:6px;text-align:center;width:25%;">
      <div style="font-size:7.5pt;color:#666;">${esc(l)}</div>
      <div style="font-size:13pt;font-weight:700;color:${NAVY};">${esc(v)}</div>
    </td>`).join('');

  const content = `
    <div style="text-align:center;border-bottom:2px solid ${NAVY};
                padding-bottom:6px;margin-bottom:10px;">
      <div style="font-size:11pt;font-weight:700;color:${NAVY};letter-spacing:.6px;">
        CONTROL ROOM SHIFT HANDOVER REPORT
      </div>
      ${r.systemId ? `<div style="font-size:8.5pt;color:#666;">${esc(r.systemId)}</div>` : ''}
    </div>

    <table style="width:100%;margin-bottom:6px;"><tr>
      ${field('Date', dateStr)}
      ${field('Shift', r.shift === 'NIGHT' ? 'Night (N)' : 'Day (D)')}
      ${field('From', r.timeFrom)}
      ${field('To', r.timeTo)}
      ${field('Controller', r.controllerName)}
    </tr></table>

    ${section(1, 'DEPLOYMENT STATUS')}
    ${table([
      { key: 'label',       label: 'Description' },
      { key: 'number',      label: 'Number', width: '60px' },
      { key: 'siteDetails', label: 'Any site details' },
    ], r.deploymentRows)}
    ${freeText('Deployment Remarks', r.deploymentRemarks)}

    ${section(2, 'INCIDENTS / OCCURRENCES')}
    ${table([
      { key: 'time',            label: 'Time', width: '55px' },
      { key: 'site',            label: 'Site' },
      { key: 'incident',        label: 'Incident' },
      { key: 'staffResponding', label: 'Staff responding' },
      { key: 'status',          label: 'Status', width: '70px' },
    ], r.incidents)}

    ${section(3, 'SUPERVISION REPORTS RECEIVED')}
    ${table([
      { key: 'zone',          label: 'Zone (D/N)' },
      { key: 'physicalCount', label: 'Covered physically', width: '95px' },
      { key: 'phoneCount',    label: 'Covered by phone', width: '95px' },
      { key: 'challenges',    label: 'Challenges reported' },
    ], r.supervisionRows)}

    ${section(4, 'CLIENT COMMUNICATIONS')}
    ${table([
      { key: 'time',             label: 'Time', width: '55px' },
      { key: 'clientSite',       label: 'Client / Site' },
      { key: 'issueRaised',      label: 'Issue raised' },
      { key: 'staffResponsible', label: 'Staff responsible' },
    ], r.clientComms)}

    ${section(5, 'GUNS DEPLOYED')}
    ${table([
      { key: 'zone',       label: 'Zone' },
      { key: 'numGuns',    label: 'No. guns', width: '65px' },
      { key: 'numBullets', label: 'No. bullets', width: '75px' },
      { key: 'status',     label: 'Status' },
    ], r.gunsDeployed)}

    ${section(6, 'GUARD DISCIPLINE ISSUES')}
    ${table([
      { key: 'site',          label: 'Site' },
      { key: 'guardName',     label: 'Guard name' },
      { key: 'issue',         label: 'Issue' },
      { key: 'actionTakenBy', label: 'Action taken and by who' },
    ], r.disciplineIssues)}

    ${section(7, 'SHIFT SUMMARY')}
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;
                  break-inside:avoid;page-break-inside:avoid;">
      <tr>${totals}</tr>
    </table>
    ${freeText('Major Issue of the Shift', r.majorIssue)}

    ${section(8, 'PENDING MATTERS FOR NEXT SHIFT')}
    ${table([
      { key: 'priority',          label: 'Priority', width: '60px' },
      { key: 'description',       label: 'Matter' },
      { key: 'responsiblePerson', label: 'Responsible', width: '150px' },
    ], (r.pendingMatters ?? []).map((m) => ({
      priority: PRIORITY_LEVELS.find((p) => p.value === m.priority)?.label ?? '',
      description:       m.description,
      responsiblePerson: m.responsiblePerson,
    })))}

    ${section(9, 'SUPERVISOR MOTORCYCLE REPORT')}
    ${(r.motorcycleReport ?? []).length === 0
      ? `<div style="font-size:8.5pt;color:#666;font-style:italic;padding:3px 0 8px;">
           Nothing recorded for this section.
         </div>`
      : (r.motorcycleReport ?? []).map(motorcycleBlock).join('')}

    <div style="border:1.5px solid ${NAVY};padding:8px 10px;margin-top:6px;
                break-inside:avoid;page-break-inside:avoid;">
      <div style="font-weight:700;color:${NAVY};font-size:9pt;margin-bottom:6px;">HANDOVER</div>
      <table style="width:100%;font-size:8.5pt;">
        <tr>
          ${field('Outgoing Controller', r.outgoingControllerName)}
          ${field('Time', r.outgoingTime)}
          ${field('Incoming Controller', r.incomingControllerName)}
          ${field('Time', r.incomingTime)}
        </tr>
      </table>
      ${r.acknowledgedBy ? `
        <div style="margin-top:6px;font-size:8pt;color:#1E8449;">
          Acknowledged by ${esc(r.acknowledgedBy)}${
            r.acknowledgedAt
              ? ` on ${new Date(r.acknowledgedAt).toLocaleString('en-GB')}`
              : ''}
        </div>` : ''}
    </div>`;

  return renderToPdf(content);
}
