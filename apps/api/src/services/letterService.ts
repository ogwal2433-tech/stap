import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import type { LetterGenerationInput } from '@stap/shared';

// ── Letter data shape ──────────────────────────────────────────────────────────

interface LetterData {
  guardName: string;
  nationalId: string;
  position: string;
  incidentDate?: string;
  reason?: string;
  outcome?: string;
  salaryRate?: string;
  newSalaryRate?: string;
  oldSalaryRate?: string;
  salaryChangePercent?: string;
  contractStart?: string;
  contractEnd?: string;
  newContractEnd?: string;
  directorName: string;
  issueDate: string;
  refNumber: string;
  [key: string]: string | undefined;
}

// ── Common HTML styles ─────────────────────────────────────────────────────────

const COMMON_STYLES = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12pt;
      color: #222;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #1B3A6B;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .company-name {
      font-size: 20pt;
      font-weight: bold;
      color: #1B3A6B;
      letter-spacing: 1px;
    }
    .company-address {
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }
    .date-ref {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
      font-size: 10pt;
    }
    .subject {
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 16px;
      font-size: 12pt;
    }
    .body-text { margin-bottom: 14px; }
    .signature-block { margin-top: 40px; }
    .signature-line { border-top: 1px solid #333; width: 200px; margin-bottom: 4px; margin-top: 30px; }
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 9pt;
      color: #888;
      border-top: 1px solid #ddd;
      padding: 6px 0;
    }
    .warning-box {
      border: 2px solid #dc3545;
      background: #fff5f5;
      padding: 12px 16px;
      margin: 20px 0;
      border-radius: 4px;
      color: #dc3545;
      font-weight: bold;
    }
    .salutation { margin-bottom: 16px; }
  </style>
`;

const COMPANY_HEADER = `
  <div class="header">
    <div class="company-name">STAP SECURITY LTD</div>
    <div class="company-address">
      Plot 45, Kampala Road, Kampala, Uganda &nbsp;|&nbsp;
      Tel: +256 414 000 000 &nbsp;|&nbsp;
      Email: info@stapsecurity.co.ug
    </div>
  </div>
`;

function wrapLetter(body: string, data: LetterData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8">${COMMON_STYLES}</head>
    <body>
      ${COMPANY_HEADER}
      <div class="date-ref">
        <span>Ref: ${data.refNumber}</span>
        <span>${data.issueDate}</span>
      </div>
      ${body}
      <div class="footer">STAP Security Ltd — Confidential &nbsp;|&nbsp; Page <span class="pageNumber"></span></div>
    </body>
    </html>
  `;
}

// ── Letter templates ───────────────────────────────────────────────────────────

class LetterService {
  getLetterTemplate(letterType: string, data: LetterData): string {
    switch (letterType) {
      case 'VERBAL_WARNING':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">VERBAL WARNING — ${data.reason ? data.reason.substring(0, 80).toUpperCase() : 'MISCONDUCT'}</div>
          <p class="body-text">This letter serves as formal documentation of a verbal warning issued to you on <strong>${data.issueDate}</strong>.</p>
          <p class="body-text">On <strong>${data.incidentDate ?? data.issueDate}</strong>, the matter of the following was brought to management's attention:</p>
          <p class="body-text" style="padding-left:16px; border-left: 3px solid #1B3A6B;"><em>${data.reason ?? 'Conduct contrary to company policy'}</em></p>
          <p class="body-text">You were verbally informed of this matter and reminded of the conduct standards required of all STAP Security Ltd employees. You are expected to improve your conduct with immediate effect.</p>
          <p class="body-text"><strong>Outcome:</strong> ${data.outcome ?? 'Verbal warning issued. No further action at this time.'}</p>
          <p class="body-text"><strong>Please note:</strong> Should a similar incident recur, a written warning will be issued. Repeated misconduct may result in suspension or termination of employment.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'FIRST_WARNING':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">FIRST WRITTEN WARNING</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">This letter constitutes your <strong>First Written Warning</strong> in accordance with the company disciplinary procedure.</p>
          <p class="body-text">On <strong>${data.incidentDate ?? data.issueDate}</strong>, the following misconduct was reported:</p>
          <p class="body-text" style="padding-left:16px; border-left: 3px solid #1B3A6B;"><em>${data.reason ?? 'Conduct contrary to company policy'}</em></p>
          <p class="body-text"><strong>Outcome / Action Taken:</strong> ${data.outcome ?? 'First written warning issued.'}</p>
          <p class="body-text">You are required to improve your conduct immediately. This written warning will remain on your employment record. A further breach of company policy may result in a final written warning, suspension, or termination of employment.</p>
          <p class="body-text">You have the right to appeal this decision in writing within seven (7) working days of receiving this letter.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'FINAL_WARNING':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">FINAL WRITTEN WARNING</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">This letter constitutes your <strong>FINAL Written Warning</strong>. This is the last warning you will receive before the company takes further disciplinary action, up to and including termination of your employment.</p>
          <p class="body-text">On <strong>${data.incidentDate ?? data.issueDate}</strong>, the following serious misconduct was reported:</p>
          <p class="body-text" style="padding-left:16px; border-left: 3px solid #dc3545;"><em>${data.reason ?? 'Serious conduct contrary to company policy'}</em></p>
          <p class="body-text"><strong>Outcome / Action Taken:</strong> ${data.outcome ?? 'Final written warning issued.'}</p>
          <p class="body-text">You are hereby placed on final notice. Any further breach of company policy, no matter how minor, will result in your immediate suspension pending investigation and likely termination of employment without further warning.</p>
          <p class="body-text">You have the right to appeal this decision in writing within seven (7) working days of receiving this letter.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'TERMINATION_NOTICE':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">NOTICE OF TERMINATION OF EMPLOYMENT</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <div class="warning-box">⚠ This letter terminates your employment with STAP Security Ltd effective immediately.</div>
          <p class="body-text">After careful consideration and following the company's disciplinary procedure, STAP Security Ltd has resolved to terminate your contract of employment with effect from <strong>${data.issueDate}</strong>.</p>
          <p class="body-text"><strong>Reason for Termination:</strong></p>
          <p class="body-text" style="padding-left:16px; border-left: 3px solid #dc3545;"><em>${data.reason ?? 'Serious misconduct'}</em></p>
          <p class="body-text">You are required to:</p>
          <ul style="margin: 0 0 14px 24px;">
            <li>Return all company property (uniform, equipment, access cards) immediately.</li>
            <li>Your final salary and any accrued leave entitlements will be calculated and paid through the normal payroll process.</li>
            <li>Surrender your company identification without delay.</li>
          </ul>
          <p class="body-text">You have the right to appeal this decision in writing within seven (7) working days of receiving this letter. Appeals should be addressed to the Human Resources Office.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'APPOINTMENT_LETTER':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId}</div>
          <div class="subject">LETTER OF APPOINTMENT — SECURITY GUARD</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">We are pleased to offer you employment with <strong>STAP Security Ltd</strong> on the following terms and conditions:</p>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding:4px 8px; font-weight:bold; width:40%;">Position:</td><td style="padding:4px 8px;">Security Guard</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Start Date:</td><td style="padding:4px 8px;">${data.contractStart ?? data.issueDate}</td></tr>
            <tr><td style="padding:4px 8px; font-weight:bold;">Monthly Salary:</td><td style="padding:4px 8px;">${data.salaryRate ?? 'As agreed'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Reporting To:</td><td style="padding:4px 8px;">Operations Supervisor / Director</td></tr>
            <tr><td style="padding:4px 8px; font-weight:bold;">Probation Period:</td><td style="padding:4px 8px;">Three (3) months from start date</td></tr>
          </table>
          <p class="body-text">A valid PSO Certificate issued by the Internal Security Organisation (ISO) is a condition of your employment. Failure to maintain a valid certificate may result in immediate suspension.</p>
          <p class="body-text">Your employment is subject to the STAP Security Ltd Staff Handbook, which you will receive separately. Please sign and return a copy of this letter to acknowledge acceptance of these terms.</p>
          <p class="body-text">We welcome you to the team and look forward to your contribution to STAP Security Ltd.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
            <br/>
            <p>I, <strong>${data.guardName}</strong>, accept the above terms of employment.</p>
            <div class="signature-line"></div>
            <p>Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date: _______________</p>
          </div>
          `,
          data,
        );

      case 'CONTRACT_EXTENSION':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">CONTRACT EXTENSION NOTICE</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">We are pleased to inform you that your contract of employment with STAP Security Ltd has been extended on the following terms:</p>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding:4px 8px; font-weight:bold; width:40%;">Original Contract Start:</td><td style="padding:4px 8px;">${data.contractStart ?? '—'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Previous Contract End:</td><td style="padding:4px 8px;">${data.contractEnd ?? '—'}</td></tr>
            <tr><td style="padding:4px 8px; font-weight:bold;">New Contract End Date:</td><td style="padding:4px 8px;"><strong>${data.newContractEnd ?? '—'}</strong></td></tr>
          </table>
          <p class="body-text">All other terms and conditions of your original employment contract remain unchanged and continue to apply during the extended period.</p>
          <p class="body-text">Please sign and return a copy of this letter to acknowledge your acceptance of the extension.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'CONFIRMATION_OF_EMPLOYMENT':
        return wrapLetter(
          `
          <div class="salutation">To Whom It May Concern</div>
          <div class="subject">CONFIRMATION OF EMPLOYMENT</div>
          <p class="body-text">This is to confirm that <strong>${data.guardName}</strong> (NIN: ${data.nationalId}) is a bonafide employee of STAP Security Ltd.</p>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding:4px 8px; font-weight:bold; width:40%;">Position:</td><td style="padding:4px 8px;">${data.position}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Employment Start Date:</td><td style="padding:4px 8px;">${data.contractStart ?? '—'}</td></tr>
            <tr><td style="padding:4px 8px; font-weight:bold;">Monthly Salary:</td><td style="padding:4px 8px;">${data.salaryRate ?? 'Confidential'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Employment Status:</td><td style="padding:4px 8px;">Active / Permanent</td></tr>
          </table>
          <p class="body-text">This letter is issued at the request of the employee for official purposes.</p>
          <p class="body-text">For any verification, please contact our offices at the address above.</p>
          <div class="signature-block">
            <p>Yours faithfully,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      case 'SALARY_REVIEW':
        return wrapLetter(
          `
          <div class="salutation">To: <strong>${data.guardName}</strong> &nbsp;|&nbsp; NIN: ${data.nationalId} &nbsp;|&nbsp; Position: ${data.position}</div>
          <div class="subject">SALARY REVIEW NOTIFICATION</div>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">Following the annual salary review, we are pleased to inform you of an adjustment to your monthly remuneration with effect from <strong>${data.issueDate}</strong>.</p>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding:4px 8px; font-weight:bold; width:40%;">Previous Salary:</td><td style="padding:4px 8px;">${data.oldSalaryRate ?? '—'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">New Salary:</td><td style="padding:4px 8px;"><strong>${data.newSalaryRate ?? data.salaryRate ?? '—'}</strong></td></tr>
            <tr><td style="padding:4px 8px; font-weight:bold;">Change:</td><td style="padding:4px 8px;">${data.salaryChangePercent ?? '—'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:4px 8px; font-weight:bold;">Effective Date:</td><td style="padding:4px 8px;">${data.issueDate}</td></tr>
          </table>
          <p class="body-text">All other terms and conditions of your employment remain unchanged. We thank you for your continued dedication to STAP Security Ltd.</p>
          <div class="signature-block">
            <p>Yours sincerely,</p>
            <div class="signature-line"></div>
            <p><strong>${data.directorName}</strong></p>
            <p>For: STAP Security Ltd</p>
          </div>
          `,
          data,
        );

      default:
        throw new Error(`Unknown letter type: ${letterType}`);
    }
  }

  // ── Generate letter ────────────────────────────────────────────────────────

  async generateLetter(
    input: LetterGenerationInput,
    generatedBy: string,
  ): Promise<{ filePath: string; fileName: string; documentId: string }> {
    // Fetch guard
    const guard = await prisma.guard.findUnique({
      where: { id: input.guardId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        nationalId: true,
        salaryRate: true,
        contractStart: true,
        contractEnd: true,
      },
    });
    if (!guard) throw new NotFoundError(`Guard ${input.guardId} not found`);

    const guardName = [guard.firstName, guard.otherNames, guard.lastName]
      .filter(Boolean)
      .join(' ');

    // Fetch disciplinary record if provided
    let discRecord: {
      incidentDate: Date;
      reason: string;
      outcome: string;
    } | null = null;

    if (input.disciplinaryRecordId) {
      discRecord = await prisma.disciplinaryRecord.findUnique({
        where: { id: input.disciplinaryRecordId },
        select: { incidentDate: true, reason: true, outcome: true },
      });
    }

    // Build issue date string
    const now = new Date();
    const issueDate = now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Generate ref number
    const year = now.getFullYear();
    const typeShort = input.letterType.substring(0, 3).toUpperCase();
    const refNumber = `STAP/${year}/${typeShort}/${now.getTime()}`;

    // Build template data
    const data: LetterData = {
      guardName,
      nationalId: guard.nationalId,
      position: 'Security Guard',
      directorName: input.directorName,
      issueDate,
      refNumber,
      salaryRate: `UGX ${guard.salaryRate.toLocaleString()}`,
      contractStart: guard.contractStart
        ? guard.contractStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : undefined,
      contractEnd: guard.contractEnd
        ? guard.contractEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : undefined,
      ...(discRecord
        ? {
            incidentDate: discRecord.incidentDate.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            reason: discRecord.reason,
            outcome: discRecord.outcome,
          }
        : {}),
      ...(input.customFields ?? {}),
    };

    // Render HTML
    const html = this.getLetterTemplate(input.letterType, data);

    // Ensure output directory exists
    const letterDir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'guards',
      guard.id,
      'letters',
    );
    fs.mkdirSync(letterDir, { recursive: true });

    const timestamp = now.getTime();
    const fileName = `${input.letterType}-${guard.id}-${timestamp}.pdf`;
    const filePath = path.join(letterDir, fileName);
    const publicPath = `/uploads/guards/${guard.id}/letters/${fileName}`;

    // Generate PDF with Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        printBackground: true,
      });
    } finally {
      await browser.close();
    }

    // Determine document type for GuardDocument record
    const WARNING_TYPES = ['VERBAL_WARNING', 'FIRST_WARNING', 'FINAL_WARNING', 'TERMINATION_NOTICE'];
    const CONTRACT_TYPES = ['APPOINTMENT_LETTER', 'CONTRACT_EXTENSION'];
    let documentType: 'WARNING_LETTER' | 'CONTRACT' | 'OTHER' = 'OTHER';
    if (WARNING_TYPES.includes(input.letterType)) documentType = 'WARNING_LETTER';
    else if (CONTRACT_TYPES.includes(input.letterType)) documentType = 'CONTRACT';

    // Get next version for this guard + document type
    const existingCount = await prisma.guardDocument.count({
      where: { guardId: guard.id, documentType },
    });

    // Create GuardDocument record
    const guardDoc = await prisma.guardDocument.create({
      data: {
        guardId: guard.id,
        documentType,
        filePath: publicPath,
        version: existingCount + 1,
        uploadedBy: generatedBy,
      },
    });

    // Link letter to disciplinary record if applicable
    if (input.disciplinaryRecordId) {
      await prisma.disciplinaryRecord.update({
        where: { id: input.disciplinaryRecordId },
        data: { letterPath: publicPath },
      });
    }

    await QueueService.logAudit({
      userId: generatedBy,
      action: 'LETTER_GENERATED',
      entity: 'guardDocument',
      entityId: guardDoc.id,
      newValue: { letterType: input.letterType, guardId: guard.id, filePath: publicPath },
    });

    return { filePath: publicPath, fileName, documentId: guardDoc.id };
  }
}

export const letterService = new LetterService();
