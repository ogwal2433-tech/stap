/**
 * Requisitions as printed pages — the PDF half of the requisition export.
 *
 * Only the inner content: renderToPdf() wraps these in the Security360
 * letterhead and footer band, so neither is repeated here. Two documents share
 * this module because they read the same record: a list of requisitions under
 * the caller's filters, and one requisition in full for the detail view.
 *
 * The body sets line-height:1.3 of its own — the letterhead's global 1.7 inflates
 * table rows and spills a sliver onto a trailing blank page, the trap already
 * learned on the payroll schedule.
 */

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';

const ugx = (n: number) => `UGX ${(n ?? 0).toLocaleString()}`;

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Formats an ISO date for print; a missing date reads as an em dash. */
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDING:     { bg: '#fff3cd', fg: '#856404' },
  SUBMITTED:   { bg: '#fff3cd', fg: '#856404' },
  APPROVED:    { bg: '#d5f5e3', fg: '#1E8449' },
  ASSIGNED:    { bg: '#cff4fc', fg: '#055160' },
  IN_PROGRESS: { bg: '#e2e3f5', fg: '#2b2d77' },
  COMPLETED:   { bg: '#d5f5e3', fg: '#1E8449' },
  REJECTED:    { bg: '#f8d7da', fg: '#C0392B' },
  CANCELLED:   { bg: '#e9ecef', fg: '#495057' },
};

function statusBadge(status: string): string {
  const s = STATUS_STYLE[status] ?? { bg: '#e9ecef', fg: '#495057' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:8px;font-size:7.5pt;` +
    `font-weight:700;background:${s.bg};color:${s.fg}">${esc(status.replace(/_/g, ' '))}</span>`;
}

function metaCell(label: string, value: string): string {
  return `
    <td style="padding:5px 10px;vertical-align:top">
      <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">${esc(label)}</div>
      <div style="font-weight:700;color:${NAVY};font-size:9.5pt">${esc(value)}</div>
    </td>`;
}

function signatureBlock(role: string): string {
  return `
    <div style="flex:1">
      <div style="border-bottom:1px solid #4A5568;height:24px;margin-bottom:3px"></div>
      <div style="font-size:8pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">${esc(role)}</div>
      <div style="font-size:8pt;color:#adb5bd">Name / Date / Signature</div>
    </div>`;
}

// ── List ───────────────────────────────────────────────────────────────────────

export interface RequisitionListPdfRow {
  index:         number;
  date:          string;
  particulars:    string;
  amount:        number;
  requestedBy:   string;
  assignedTo:    string | null;
  status:        string;
  dispatched:    number;
}

export interface RequisitionListPdfData {
  title:        string;
  printDate:    string;
  generatedBy:  string;
  /** The filters the list was taken under, in words; 'All requisitions' when none. */
  selection:    string;
  count:        number;
  totalAmount:  number;
  totalDispatched: number;
  rows:         RequisitionListPdfRow[];
}

export function buildRequisitionListPdfHtml(data: RequisitionListPdfData): string {
  const rows = data.rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#F8F9FA'}">
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${r.index}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;white-space:nowrap">${esc(fmtDate(r.date))}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef">${esc(r.particulars)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:right;font-weight:600">${ugx(r.amount)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef">${esc(r.requestedBy || '—')}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef">${r.assignedTo ? esc(r.assignedTo) : '<span style="color:#adb5bd">Not assigned</span>'}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${statusBadge(r.status)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:right;color:${r.dispatched > 0 ? '#055160' : '#6c757d'}">${r.dispatched > 0 ? ugx(r.dispatched) : '—'}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;font-size:10pt;line-height:1.3">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:15pt;font-weight:900;color:${NAVY};letter-spacing:0.5px">${esc(data.title)}</div>
        <div style="font-size:10pt;color:#6c757d;margin-top:2px">${esc(data.selection)}</div>
      </div>
      <div style="text-align:right;font-size:8.5pt;color:#6c757d">${esc(data.printDate)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#F2F4F7;border-left:3px solid ${AMBER};margin-bottom:10px;page-break-inside:avoid">
      <tr>
        ${metaCell('Requisitions In This List', String(data.count))}
        ${metaCell('Total Requested', ugx(data.totalAmount))}
        ${metaCell('Total Dispatched', ugx(data.totalDispatched))}
      </tr>
      <tr>
        ${metaCell('Selection', data.selection)}
        ${metaCell('Printed', data.printDate)}
        ${metaCell('Generated By', data.generatedBy)}
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
      <thead>
        <tr style="background:${NAVY};color:#ffffff">
          <th style="padding:5px 8px;text-align:center;font-size:8pt;width:26px">#</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;width:78px">Date</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt">Particulars</th>
          <th style="padding:5px 8px;text-align:right;font-size:8pt;width:96px">Amount (UGX)</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;width:110px">Requested By</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;width:110px">Assigned To</th>
          <th style="padding:5px 8px;text-align:center;font-size:8pt;width:88px">Status</th>
          <th style="padding:5px 8px;text-align:right;font-size:8pt;width:96px">Dispatched</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" style="padding:12px;text-align:center;color:#6c757d">No requisition matches this selection.</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background:${NAVY};color:#ffffff;font-weight:900">
          <td colspan="3" style="padding:6px 8px;text-align:right;font-size:10pt">TOTALS</td>
          <td style="padding:6px 8px;text-align:right">${ugx(data.totalAmount)}</td>
          <td colspan="3"></td>
          <td style="padding:6px 8px;text-align:right;color:${AMBER}">${ugx(data.totalDispatched)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:16px;display:flex;gap:28px;page-break-inside:avoid">
      ${signatureBlock('Prepared By')}
      ${signatureBlock('Approved By')}
      ${signatureBlock('Accounts')}
    </div>

    <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e9ecef;font-size:8.5pt;color:#6c757d">
      ${esc(data.generatedBy)} printed ${esc(data.printDate)} from ${esc(data.selection)}. Amounts in Uganda Shillings (UGX).
    </div>
  </div>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────────

export interface RequisitionDetailPdfData {
  reference:      string;
  printDate:      string;
  generatedBy:    string;
  date:           string;
  particulars:     string;
  amount:         number;
  status:         string;
  categoryItems:  { category: string; quantity: number; unit: string | null }[];
  requestedBy:    string;
  assignedTo:     string | null;
  hrApprovedBy:   string | null;
  hrApprovedAt:   string | null;
  dirApprovedBy:  string | null;
  dirApprovedAt:  string | null;
  progress:       string | null;
  remarks:        string | null;
  accountName:    string | null;
  accountDetails: string | null;
  bankName:       string | null;
  totalDispatched: number;
  dispatchStatus: string;
  purchaseOrders: { supplierName: string | null; quantity: number; unitCost: number; totalCost: number; status: string }[];
}

function detailField(label: string, value: string, spanFull = false): string {
  return `
    <div style="flex:${spanFull ? '1 1 100%' : '1 1 46%'};margin-bottom:8px">
      <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">${esc(label)}</div>
      <div style="font-weight:600;color:#1A1A1A;font-size:9.5pt">${value}</div>
    </div>`;
}

export function buildRequisitionDetailPdfHtml(data: RequisitionDetailPdfData): string {
  const catRows = data.categoryItems.map((c) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef">${esc(c.category)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${c.quantity}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${c.unit ? esc(c.unit) : '—'}</td>
    </tr>`).join('');

  const poRows = data.purchaseOrders.map((po) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef">${po.supplierName ? esc(po.supplierName) : '<span style="color:#adb5bd">No supplier</span>'}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${po.quantity}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:right">${ugx(po.unitCost)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:right;font-weight:600">${ugx(po.totalCost)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e9ecef;text-align:center">${esc(po.status)}</td>
    </tr>`).join('');

  const yes = (name: string | null, at: string | null) =>
    at ? `✓ ${esc(name ?? '')} on ${esc(fmtDate(at))}` : '<span style="color:#856404">Pending</span>';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;font-size:10pt;line-height:1.3">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:16pt;font-weight:900;color:${NAVY};letter-spacing:0.5px">REQUISITION</div>
        <div style="font-size:9pt;color:#6c757d;margin-top:2px">${esc(data.reference)} · ${esc(fmtDate(data.date))}</div>
      </div>
      <div style="text-align:right">
        ${statusBadge(data.status)}
        <div style="font-size:13pt;font-weight:900;color:${NAVY};margin-top:6px">${ugx(data.amount)}</div>
      </div>
    </div>

    <div style="border:1px solid #e9ecef;border-radius:6px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Particulars</div>
      <div style="font-weight:600;font-size:10.5pt;margin-top:2px">${esc(data.particulars)}</div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:16px 24px;margin-bottom:12px">
      ${detailField('Requested By', esc(data.requestedBy || '—'))}
      ${detailField('Assigned To', data.assignedTo ? esc(data.assignedTo) : '<span style="color:#adb5bd">Not assigned</span>')}
      ${detailField('HR Approval', yes(data.hrApprovedBy, data.hrApprovedAt))}
      ${detailField('Director Approval', yes(data.dirApprovedBy, data.dirApprovedAt))}
      ${detailField('Dispatched', data.totalDispatched > 0 ? `${ugx(data.totalDispatched)} — ${esc(data.dispatchStatus.replace(/_/g, ' '))}` : 'None yet')}
    </div>

    ${data.categoryItems.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:9pt;font-weight:700;color:${NAVY};margin-bottom:4px">Category Breakdown</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:${NAVY};color:#ffffff">
            <th style="padding:5px 8px;text-align:left;font-size:8pt">Category</th>
            <th style="padding:5px 8px;text-align:center;font-size:8pt;width:100px">Quantity</th>
            <th style="padding:5px 8px;text-align:center;font-size:8pt;width:120px">Unit</th>
          </tr>
        </thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>` : ''}

    ${(data.remarks || data.progress) ? `
    <div style="margin-bottom:10px">
      ${data.remarks ? detailField('Remarks', esc(data.remarks), true) : ''}
      ${data.progress ? detailField('Progress', esc(data.progress), true) : ''}
    </div>` : ''}

    ${(data.accountName || data.accountDetails || data.bankName) ? `
    <div style="background:#F2F4F7;border-left:3px solid ${AMBER};border-radius:4px;padding:10px 12px;margin-bottom:12px">
      <div style="font-size:8pt;font-weight:700;color:${NAVY};margin-bottom:4px">Payment Account</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 24px">
        ${detailField('Account Name', esc(data.accountName ?? '—'))}
        ${detailField('Account Details', esc(data.accountDetails ?? '—'))}
        ${detailField('Bank', esc(data.bankName ?? '—'))}
      </div>
    </div>` : ''}

    ${data.purchaseOrders.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:9pt;font-weight:700;color:${NAVY};margin-bottom:4px">Purchase Orders</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:${NAVY};color:#ffffff">
            <th style="padding:5px 8px;text-align:left;font-size:8pt">Supplier</th>
            <th style="padding:5px 8px;text-align:center;font-size:8pt;width:70px">Qty</th>
            <th style="padding:5px 8px;text-align:right;font-size:8pt;width:100px">Unit Cost</th>
            <th style="padding:5px 8px;text-align:right;font-size:8pt;width:100px">Total</th>
            <th style="padding:5px 8px;text-align:center;font-size:8pt;width:90px">Status</th>
          </tr>
        </thead>
        <tbody>${poRows}</tbody>
      </table>
    </div>` : ''}

    <div style="margin-top:20px;display:flex;gap:28px;page-break-inside:avoid">
      ${signatureBlock('Requested By')}
      ${signatureBlock('HR Approved')}
      ${signatureBlock('Director Approved')}
    </div>

    <div style="margin-top:12px;padding-top:8px;border-top:1px solid #e9ecef;font-size:8.5pt;color:#6c757d">
      ${esc(data.generatedBy)} printed ${esc(data.printDate)}. Amounts in Uganda Shillings (UGX).
    </div>
  </div>`;
}
