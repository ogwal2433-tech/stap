import { FILE_PREFIX } from '../config/branding';
import { renderToPdf } from '../lib/pdfBase';
import { requisitionService } from './requisitionService';
import type { RequisitionExportQuery, RequisitionResponse } from '@security360/shared';
import {
  buildRequisitionListPdfHtml,
  buildRequisitionDetailPdfHtml,
  type RequisitionListPdfData,
  type RequisitionListPdfRow,
  type RequisitionDetailPdfData,
} from '../lib/templates/requisitionPdf';

/**
 * Printable exports of requisitions.
 *
 * Both halves ask requisitionService for the record(s) under the caller's role
 * and filters, so the printed page and the table on screen are two views of one
 * answer rather than two questions. The list export shares the list's filter
 * contract (GET /requisitions vs GET /requisitions/export/pdf), and the detail
 * export reuses the same ownership scoping the detail view is subject to.
 */

function fmtPrintDate(d: Date): string {
  return d.toLocaleString('en-GB', {
    day:    'numeric',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Kampala',
  });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The filters in words, printed on the page so a reader knows which question the
 * list answers. Kept beside the code that builds the query rather than in the
 * template, so the wording cannot drift from what the filter actually did.
 */
function describeSelection(query: RequisitionExportQuery): string {
  const parts: string[] = [];
  if (query.status) {
    // A comma list reads as one phrase — "approved at any stage" rather than
    // four statuses strung together.
    const list = query.status.split(',').map((s) => s.trim().replace(/_/g, ' '));
    parts.push(list.length > 1 ? `${list[0]} at any stage` : list[0]);
  }
  if (query.overdue === 'true') parts.push('with an overdue delivery');
  if (query.requestedById) parts.push('raised by a specific requester');
  if (query.from && query.to)   parts.push(`dated ${fmtDay(query.from)} – ${fmtDay(query.to)}`);
  else if (query.from)          parts.push(`dated from ${fmtDay(query.from)}`);
  else if (query.to)            parts.push(`dated up to ${fmtDay(query.to)}`);
  return parts.length ? `Filtered — ${parts.join(' · ')}` : 'All requisitions';
}

class RequisitionExportService {
  async buildListPdf(
    query: RequisitionExportQuery,
    opts: { generatedBy: string; viewerRole: string; viewerId: string },
  ): Promise<{ pdf: Buffer; filename: string }> {
    const reqs = await requisitionService.listForExport(query, opts.viewerRole, opts.viewerId);
    const printDate = fmtPrintDate(new Date());

    const rows = reqs.map<RequisitionListPdfRow>((r, i) => ({
      index:         i + 1,
      date:          r.date,
      particulars:    r.particulars,
      amount:        r.amount,
      requestedBy:   r.requestedBy.name,
      assignedTo:    r.assignedTo?.name ?? null,
      status:        r.status,
      dispatched:    r.totalDispatched,
    }));

    const data: RequisitionListPdfData = {
      title:           'REQUISITIONS',
      printDate,
      generatedBy:     opts.generatedBy,
      selection:       describeSelection(query),
      count:           reqs.length,
      totalAmount:     reqs.reduce((s, r) => s + r.amount, 0),
      totalDispatched: reqs.reduce((s, r) => s + r.totalDispatched, 0),
      rows,
    };

    // Same header/footer as an invoice: a white band carrying the company name
    // and contact details (so a reader knows who raised it), closing with the
    // software credit rather than the letterhead's sales line.
    const pdf = await renderToPdf(buildRequisitionListPdfHtml(data), {
      logoFile:    'tiger_logo.jpeg',
      watermark:   false,
      plainHeader: true,
      footerText:  'POWERED BY: Biiteek Globe Ltd',
    });

    return { pdf, filename: `${FILE_PREFIX}_Requisitions_${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  async buildDetailPdf(
    id: string,
    opts: { generatedBy: string; viewerRole: string; viewerId: string },
  ): Promise<{ pdf: Buffer; filename: string }> {
    const r: RequisitionResponse = await requisitionService.getForPrint(id, opts.viewerRole, opts.viewerId);
    const printDate = fmtPrintDate(new Date());

    const data: RequisitionDetailPdfData = {
      reference:      `REQ-${r.id.slice(-8).toUpperCase()}`,
      printDate,
      generatedBy:    opts.generatedBy,
      date:           r.date,
      particulars:     r.particulars,
      amount:         r.amount,
      status:         r.status,
      categoryItems:  r.categoryItems.map((c) => ({ category: c.category, quantity: c.quantity, unit: c.unit })),
      requestedBy:    r.requestedBy.name,
      assignedTo:     r.assignedTo?.name ?? null,
      hrApprovedBy:   r.hrApproved.by?.name ?? null,
      hrApprovedAt:   r.hrApproved.at,
      dirApprovedBy:  r.directorApproved.by?.name ?? null,
      dirApprovedAt:  r.directorApproved.at,
      progress:       r.progress,
      remarks:        r.remarks,
      accountName:    r.accountName,
      accountDetails: r.accountDetails,
      bankName:       r.bankName,
      totalDispatched: r.totalDispatched,
      dispatchStatus: r.dispatchStatus,
      purchaseOrders: r.purchaseOrders.map((po) => ({
        supplierName: po.supplierName,
        quantity:     po.quantity,
        unitCost:     po.unitCost,
        totalCost:    po.totalCost,
        status:       po.status,
      })),
    };

    const pdf = await renderToPdf(buildRequisitionDetailPdfHtml(data), {
      logoFile:    'tiger_logo.jpeg',
      watermark:   false,
      plainHeader: true,
      footerText:  'POWERED BY: Biiteek Globe Ltd',
    });

    const day = new Date(r.date).toISOString().slice(0, 10);
    return { pdf, filename: `${FILE_PREFIX}_Requisition_${day}.pdf` };
  }
}

export const requisitionExportService = new RequisitionExportService();
