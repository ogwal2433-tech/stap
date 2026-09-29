import { DEFAULT_COMPANY_NAME } from '@security360/shared';

export interface LetterHtmlOptions {
  refNumber:    string;
  issueDate:    string;
  body:         string;
  directorName: string;
  employeeName: string;
  skipSigBlock?: boolean;
  companyName?: string;
}

/**
 * Returns the inner content HTML for a structured letter (COMMITMENT_AGREEMENT, etc.).
 * Does NOT include DOCTYPE/html/head/body — pass the result to renderToPdf() from pdfBase.ts.
 */
export function buildLetterHtml(opts: LetterHtmlOptions): string {
  const companyName = opts.companyName?.trim() || DEFAULT_COMPANY_NAME;
  return `<style>
    .date-ref {
      display: flex;
      justify-content: space-between;
      font-size: 9.5pt;
      color: #444;
      margin-bottom: 20px;
    }
    .letter-body { margin-bottom: 10px; }
    .letter-body p { margin-bottom: 12px; }
    .sig-block {
      margin-top: 44px;
      display: flex;
      gap: 60px;
    }
    .sig-col { flex: 1; }
    .sig-line {
      border-top: 1px solid #333;
      width: 180px;
      margin-top: 36px;
      margin-bottom: 4px;
    }
    .sig-label { font-size: 9pt; color: #444; }
  </style>
  <div class="date-ref">
    <span>Ref: ${opts.refNumber}</span>
    <span>${opts.issueDate}</span>
  </div>
  <div class="letter-body">
    ${opts.body}
  </div>
  ${opts.skipSigBlock ? '' : `<div class="sig-block">
    <div class="sig-col">
      <div class="sig-label">Employee</div>
      <div class="sig-line"></div>
      <div><strong>${opts.employeeName}</strong></div>
      <div class="sig-label">Signature &amp; Date: _______________</div>
    </div>
    <div class="sig-col">
    <div class="sig-label">For ${companyName}</div>
      <div class="sig-line"></div>
      <div><strong>${opts.directorName}</strong></div>
      <div class="sig-label">Director &nbsp;&nbsp; Date: _______________</div>
    </div>
  </div>`}`;
}
