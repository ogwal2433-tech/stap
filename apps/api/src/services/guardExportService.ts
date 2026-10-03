import { FILE_PREFIX } from '../config/branding';
import { renderToPdf } from '../lib/pdfBase';
import { guardService } from './guardService';
import {
  FINANCE_ROLES,
  GUARD_CONTRACT_TYPES,
  guardIdTypeConfig,
  guardStatusLabel,
  type GuardExportQuery,
  type UserRole,
} from '@security360/shared';
import {
  buildGuardRollPdfHtml,
  type GuardRollPdfData,
  type GuardRollPdfRow,
} from '../lib/templates/guardRollPdf';

/**
 * Printable exports of the guard roll.
 *
 * The Excel half is built in the browser from GET /guards/export; this service
 * draws the same rows on the letterhead. Both ask guardService for the roll
 * under the caller's filters, so the two files and the table on screen are three
 * views of one answer rather than three questions.
 */

// Salary is a finance-only column on the guards table; a printed copy of the
// roll keeps that rule, because the printout leaves the building.
const SALARY_VISIBLE_ROLES: UserRole[] = FINANCE_ROLES;

function fmtPrintDate(d: Date): string {
  return d.toLocaleString('en-GB', {
    day:    'numeric',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

/**
 * The filters in words, printed on the page so a reader knows which question
 * this list answers. Kept beside the code that builds the query rather than in
 * the template, so the wording cannot drift from what the filter actually did.
 */
function describeSelection(query: GuardExportQuery): string {
  const parts: string[] = [];

  if (query.search)            parts.push(`name / ID / phone matching “${query.search}”`);
  if (query.status)            parts.push(guardStatusLabel(query.status));
  if (query.rank)              parts.push(`rank ${query.rank.replace(/_/g, ' ')}`);
  if (query.contractType)      parts.push(GUARD_CONTRACT_TYPES[query.contractType] ?? query.contractType);
  if (query.probationStatus)   parts.push(query.probationStatus === 'ON_PROBATION' ? 'on probation' : 'confirmed');

  // nidStatus and isIncompleteNID are two spellings of the same filter; the
  // page sends the second, so it is the one that reads best here.
  const nid = query.nidStatus ?? (query.isIncompleteNID === undefined
    ? undefined
    : query.isIncompleteNID ? 'PENDING' : 'PROVIDED');
  if (nid === 'PENDING')  parts.push('NID pending');
  if (nid === 'PROVIDED') parts.push('NID on file');

  if (query.idType) {
    parts.push(query.idType === 'NONE'
      ? 'with no document on file'
      : `document: ${guardIdTypeConfig(query.idType)?.label ?? query.idType}`);
  }

  if (query.onLeave !== undefined) parts.push(query.onLeave ? 'currently on leave' : 'not on leave');

  return parts.length ? `Filtered — ${parts.join(' · ')}` : 'All guards';
}

class GuardExportService {
  async buildRollPdf(
    query: GuardExportQuery,
    opts: { generatedBy: string; viewerRole: UserRole },
  ): Promise<{ pdf: Buffer; filename: string }> {
    const rows = await guardService.listForExport(query);
    const printDate = fmtPrintDate(new Date());

    const pdfData: GuardRollPdfData = {
      printDate,
      generatedBy: opts.generatedBy,
      guardCount:  rows.length,
      // The open deployment is what says a guard is posted; see listForExport.
      postedCount: rows.filter((r) => r.currentSiteName).length,
      selection:   describeSelection(query),
      showSalary:  SALARY_VISIBLE_ROLES.includes(opts.viewerRole),
      rows: rows.map<GuardRollPdfRow>((g, i) => ({
        index:      i + 1,
        systemId:   g.systemId,
        fullName:   g.fullName,
        rank:       g.rank,
        status:     g.employmentStatus,
        phone:      g.phone,
        site:       g.currentSiteName,
        client:     g.clientName,
        salaryRate: g.salaryRate,
      })),
    };

    // The same identity the payroll schedule and the invoice carry: the tiger
    // logo alone in the band, no watermark — this is a working document meant to
    // be read, and the letterhead's sales watermark adds nothing to a name list.
    const pdf = await renderToPdf(buildGuardRollPdfHtml(pdfData), {
      logoFile:  'tiger_logo.jpeg',
      watermark: false,
      logoOnly:  true,
    });

    return { pdf, filename: `${FILE_PREFIX}_Guards_${new Date().toISOString().slice(0, 10)}.pdf` };
  }
}

export const guardExportService = new GuardExportService();
