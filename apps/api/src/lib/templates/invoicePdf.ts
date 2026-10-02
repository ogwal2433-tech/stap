/**
 * Invoice body for the printable PDF.
 *
 * Only the inner content — renderToPdf() wraps this in the Security360 letterhead,
 * so the company details and footer are not repeated here.
 */

// formatUgx prints cents only when the figure has them, which a line rate
// derived from a monthly contract rate (÷30) usually does.
import { formatUgx as ugx } from '@security360/shared';

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';

const fmtDate = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PAID:           { bg: '#d5f5e3', fg: '#1E8449' },
  PARTIALLY_PAID: { bg: '#fff3cd', fg: '#856404' },
  OVERDUE:        { bg: '#fdecea', fg: '#C0392B' },
  PENDING:        { bg: '#e9ecef', fg: '#495057' },
};

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function buildInvoiceHtml(invoice: any, title: string): string {
  const status = invoice.status as string;
  const badge  = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;

  const rows = (invoice.lineItems ?? []).map((li: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#F8F9FA'}">
      <td style="padding:5px 8px;border-bottom:1px solid #e9ecef">${esc(li.description)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;text-align:center">${li.guardsCount}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;text-align:right">${ugx(li.ratePerGuard)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;text-align:center">${li.days}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;text-align:right;font-weight:600">${ugx(li.amount)}</td>
    </tr>`).join('');

  const paid        = invoice.paidAmount ?? 0;
  const outstanding = invoice.outstandingBalance ?? invoice.totalAmount ?? 0;

  const paymentRows = (invoice.payments ?? []).map((p: any) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0">${fmtDate(p.createdAt)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0">${esc(p.mode)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0">${esc(p.referenceNumber ?? '—')}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">${ugx(p.amountPaid)}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;font-size:10pt;line-height:1.3">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:15pt;font-weight:900;color:${NAVY};letter-spacing:0.5px">${title === 'Invoice' ? 'INVOICE' : esc(title)}</div>
        <div style="font-size:10pt;color:#6c757d;margin-top:2px">${esc(invoice.invoiceNumber)}</div>
      </div>
      <div style="text-align:right">
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:9pt;
                     font-weight:700;letter-spacing:0.4px;background:${badge.bg};color:${badge.fg}">
          ${esc(status.replace(/_/g, ' '))}
        </span>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#F2F4F7;border-left:3px solid ${AMBER};margin-bottom:10px">
      <tr>
        <td style="padding:6px 10px;vertical-align:top;width:40%">
          <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Bill To</div>
          <div style="font-weight:700;color:${NAVY};font-size:10.5pt">${esc(invoice.client?.clientName)}</div>
          ${invoice.client?.physicalAddress ? `<div style="font-size:8.5pt;color:#4A5568">${esc(invoice.client.physicalAddress)}</div>` : ''}
          ${invoice.client?.email ? `<div style="font-size:8.5pt;color:#4A5568">${esc(invoice.client.email)}</div>` : ''}
        </td>
        <td style="padding:6px 10px;vertical-align:top">
          <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Billing Period</div>
          <div style="font-weight:600">${fmtDate(invoice.periodStart)} — ${fmtDate(invoice.periodEnd)}</div>
        </td>
        <td style="padding:6px 10px;vertical-align:top">
          <div style="font-size:7.5pt;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Due Date</div>
          <div style="font-weight:600">${fmtDate(invoice.dueDate)}</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
      <thead>
        <tr style="background:${NAVY};color:#ffffff">
          <th style="padding:5px 8px;text-align:left;font-size:8pt">Description</th>
          <th style="padding:5px 8px;text-align:center;font-size:8pt;width:60px">Guards</th>
          <th style="padding:5px 8px;text-align:right;font-size:8pt;width:110px">Rate / Guard</th>
          <th style="padding:5px 8px;text-align:center;font-size:8pt;width:50px">Days</th>
          <th style="padding:5px 8px;text-align:right;font-size:8pt;width:120px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#6c757d">No line items.</td></tr>'}
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <tr>
        <td style="width:55%"></td>
        <td style="padding:4px 8px;text-align:right;color:#6c757d">Subtotal</td>
        <td style="padding:4px 8px;text-align:right;width:130px">${ugx(invoice.subtotal ?? invoice.totalAmount)}</td>
      </tr>
      ${(invoice.taxAmount ?? 0) > 0 ? `
      <tr>
        <td></td>
        <td style="padding:4px 8px;text-align:right;color:#6c757d">Tax</td>
        <td style="padding:4px 8px;text-align:right">${ugx(invoice.taxAmount)}</td>
      </tr>` : ''}
      ${paid > 0 ? `
      <tr>
        <td></td>
        <td style="padding:4px 8px;text-align:right;color:#6c757d">Paid to date</td>
        <td style="padding:4px 8px;text-align:right;color:#1E8449;font-weight:600">− ${ugx(paid)}</td>
      </tr>` : ''}
      <tr style="background:${NAVY};color:#ffffff">
        <td></td>
        <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:10.5pt">Balance Due</td>
        <td style="padding:6px 8px;text-align:right;font-weight:900;font-size:10.5pt;color:${AMBER}">${ugx(outstanding)}</td>
      </tr>
    </table>

    ${paid > 0 && outstanding > 0 ? `
    <div style="margin-top:12px;background:#fff3cd;border:1px solid #ffe69c;border-radius:4px;padding:9px 12px">
      <strong style="color:#856404">Part payment received.</strong>
      <span style="color:#856404">
        A balance of ${ugx(outstanding)} remains and will be carried onto the next invoice if not settled.
      </span>
    </div>` : ''}

    ${paymentRows ? `
    <div style="margin-top:14px;page-break-inside:avoid">
      <div style="font-size:8.5pt;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">
        Payments Received
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt">
        <thead>
          <tr style="background:#F2F4F7">
            <th style="padding:4px 8px;text-align:left">Date</th>
            <th style="padding:4px 8px;text-align:left">Method</th>
            <th style="padding:4px 8px;text-align:left">Reference</th>
            <th style="padding:4px 8px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </div>` : ''}

    <div style="margin-top:12px;padding-top:8px;border-top:1px solid #e9ecef;font-size:8.5pt;color:#6c757d">
      Thank you for your business. Please quote invoice ${esc(invoice.invoiceNumber)} with your payment.
    </div>
  </div>`;
}
