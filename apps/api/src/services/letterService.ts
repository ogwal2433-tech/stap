import fs from 'fs';
import path from 'path';
import prisma from '../db/prisma';
import { renderToPdf } from '../lib/pdfBase';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { sendEmail } from '../lib/mailer';
import { buildLetterHtml } from '../lib/templates/letterBase';
import type {
  LetterGenerationInput,
  GenerateLetterInput,
  ApproveLetterInput,
  GeneratedLetterResponse,
  PaginatedResponse,
} from '@stap/shared';

// ── Letter data shape ──────────────────────────────────────────────────────────

interface LetterData {
  guardName: string;
  nationalId: string | undefined;
  position: string;
  incidentDate?: string;
  reason?: string;
  outcome?: string;
  salaryRate?: string;
  contractStart?: string;
  directorName: string;
  issueDate: string;
  refNumber: string;
  [key: string]: string | undefined;
}

// ── Letter HTML builder ────────────────────────────────────────────────────────
// Returns inner content HTML only — wrapWithLetterhead() in pdfBase.ts adds the
// full page wrapper, background image, and base body styles.

function wrapLetter(body: string, data: LetterData): string {
  return `<style>
    .date-ref { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 10pt; }
    .subject { font-weight: bold; text-decoration: underline; margin-bottom: 16px; }
    .body-text { margin-bottom: 14px; }
    .signature-block { margin-top: 40px; }
    .signature-line { border-top: 1px solid #333; width: 200px; margin-bottom: 4px; margin-top: 30px; }
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
  <div class="date-ref">
    <span>Ref: ${data.refNumber}</span>
    <span>${data.issueDate}</span>
  </div>
  ${body}`;
}

// ── Letter templates ───────────────────────────────────────────────────────────

class LetterService {
  getLetterTemplate(letterType: string, data: LetterData): string {
    switch (letterType) {
      case 'WARNING':
      case 'VERBAL_WARNING':
      case 'FIRST_WARNING':
      case 'FINAL_WARNING':
        return wrapLetter(
          `
          <div class="subject" style="text-align:center;">WARNING LETTER</div>
          <p class="body-text">To: <strong>${data.guardName}</strong></p>
          <p class="body-text">Position: ${data.position}</p>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">This letter serves as a formal warning regarding <strong>${data.reason ?? 'misconduct contrary to company policy'}</strong>. You are expected to improve your conduct immediately. Further violations may result in suspension or termination.</p>
          <div class="signature-block">
            <p>Approved by:</p>
            <div class="signature-line"></div>
            <div class="signature-line" style="margin-top:10px;"></div>
          </div>
          `,
          data,
        );

      case 'TERMINATION_NOTICE':
        return wrapLetter(
          `
          <div class="subject" style="text-align:center;">TERMINATION LETTER</div>
          <p class="body-text">To: <strong>${data.guardName}</strong></p>
          <p class="body-text">Position: ${data.position}</p>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">We regret to inform you that your employment with STAP Security Ltd is terminated effective <strong>${data.issueDate}</strong> due to <strong>${data.reason ?? 'reasons stated by management'}</strong>. Please return all company property immediately.</p>
          <div class="signature-block">
            <p>Approved by:</p>
            <div class="signature-line"></div>
            <div class="signature-line" style="margin-top:10px;"></div>
          </div>
          `,
          data,
        );

      case 'REINSTATEMENT':
        return wrapLetter(
          `
          <div class="subject" style="text-align:center;">REINSTATEMENT LETTER</div>
          <p class="body-text">To: <strong>${data.guardName}</strong></p>
          <p class="body-text">Position: ${data.position}</p>
          <p class="body-text">Dear ${data.guardName},</p>
          <p class="body-text">Following a review, you are hereby reinstated to your position effective <strong>${data.issueDate}</strong>, we expect full compliance with company policies moving forward.</p>
          <div class="signature-block">
            <p>Approved by:</p>
            <div class="signature-line"></div>
            <div class="signature-line" style="margin-top:10px;"></div>
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
      nationalId: guard.nationalId ?? undefined,
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

    // Generate PDF
    const pdfBuf = await renderToPdf(html);
    fs.writeFileSync(filePath, pdfBuf);

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

  // ── Text-based letter record with approval workflow ────────────────────────

  private sanitiseLetter(l: any): GeneratedLetterResponse {
    return {
      id:             l.id,
      subjectType:    l.subjectType,
      subjectId:      l.subjectId,
      subjectName:    l.subjectName,
      title:          l.title,
      body:           l.body,
      letterType:     l.letterType,
      generatedBy:    l.generatedByUser,
      generatedAt:    l.generatedAt.toISOString(),
      approvalStatus: l.approvalStatus,
      approvedBy:     l.approvedByUser ?? null,
      approvedAt:     l.approvedAt?.toISOString() ?? null,
      approvalNotes:  l.approvalNotes ?? null,
      isActive:       l.isActive,
      createdAt:      l.createdAt.toISOString(),
    };
  }

  private readonly LETTER_INCLUDE = {
    generatedByUser: { select: { id: true, name: true, role: true } },
    approvedByUser:  { select: { id: true, name: true } },
  } as const;

  async generateRecord(
    data: GenerateLetterInput,
    generatedBy: string,
  ): Promise<GeneratedLetterResponse> {
    const letter = await prisma.generatedLetter.create({
      data: {
        subjectType:    data.subjectType,
        subjectId:      data.subjectId,
        subjectName:    data.subjectName,
        title:          data.title,
        body:           data.body,
        letterType:     data.letterType ?? 'GENERAL',
        generatedBy,
        approvalStatus: 'PENDING',
      },
      include: this.LETTER_INCLUDE,
    });

    await notificationService.sendToRoles(
      ['DIRECTOR', 'ASSISTANT_MANAGER'],
      {
        type:       'SYSTEM',
        title:      'Letter Awaiting Approval',
        message:    `A ${letter.letterType} letter for ${letter.subjectName} has been generated and is awaiting HR approval.`,
        entityType: 'generatedLetter',
        entityId:   letter.id,
      },
    );

    await QueueService.logAudit({
      userId:   generatedBy,
      action:   'LETTER_GENERATED',
      entity:   'GeneratedLetter',
      entityId: letter.id,
      newValue: { title: letter.title, letterType: letter.letterType, subjectName: letter.subjectName },
    });

    return this.sanitiseLetter(letter);
  }

  async approveRecord(
    letterId:   string,
    decision:   'APPROVED' | 'REJECTED',
    notes:      string | undefined,
    approvedBy: string,
  ): Promise<GeneratedLetterResponse> {
    const existing = await prisma.generatedLetter.findUnique({ where: { id: letterId } });
    if (!existing) throw new NotFoundError('Letter not found');
    if (existing.approvalStatus !== 'PENDING') {
      throw new AppError(
        `This letter has already been ${existing.approvalStatus.toLowerCase()}. Only PENDING letters can be reviewed.`,
        400,
      );
    }

    const updated = await prisma.generatedLetter.update({
      where: { id: letterId },
      data: {
        approvalStatus: decision,
        approvedBy,
        approvedAt:    new Date(),
        approvalNotes: notes?.trim() ?? null,
      },
      include: this.LETTER_INCLUDE,
    });

    await notificationService.send({
      userId:     existing.generatedBy,
      type:       'SYSTEM',
      title:      decision === 'APPROVED' ? 'Letter Approved' : 'Letter Rejected',
      message:    decision === 'APPROVED'
        ? `Your ${existing.letterType} letter for ${existing.subjectName} has been approved by HR and is now official.`
        : `Your ${existing.letterType} letter for ${existing.subjectName} was rejected.${notes ? ` Reason: ${notes}` : ''}`,
      entityType: 'generatedLetter',
      entityId:   letterId,
    });

    await QueueService.logAudit({
      userId:   approvedBy,
      action:   `LETTER_${decision}`,
      entity:   'GeneratedLetter',
      entityId: letterId,
      newValue: { decision, approvedBy, notes },
    });

    // Auto-email PDF for structured letter types when approved
    if (decision === 'APPROVED' && this.isStructuredType(existing.letterType)) {
      this.sendLetterByEmail({
        id:          existing.id,
        letterType:  existing.letterType,
        title:       existing.title,
        subjectName: existing.subjectName,
        body:        existing.body,
        generatedAt: existing.generatedAt,
      }).catch(err => console.error('[LetterService] Failed to email approved letter:', err));
    }

    return this.sanitiseLetter(updated);
  }

  async listRecords(query: {
    subjectId?:     string;
    approvalStatus?:string;
    letterType?:    string;
    generatedBy?:   string;
    page:           number;
    limit:          number;
  }): Promise<PaginatedResponse<GeneratedLetterResponse>> {
    const where: any = { isActive: true };
    if (query.subjectId)      where.subjectId      = query.subjectId;
    if (query.approvalStatus) where.approvalStatus = query.approvalStatus;
    if (query.letterType)     where.letterType     = query.letterType;
    if (query.generatedBy)    where.generatedBy    = query.generatedBy;

    const [items, total] = await Promise.all([
      prisma.generatedLetter.findMany({
        where,
        include:  this.LETTER_INCLUDE,
        orderBy:  { generatedAt: 'desc' },
        skip:     (query.page - 1) * query.limit,
        take:     query.limit,
      }),
      prisma.generatedLetter.count({ where }),
    ]);

    const totalPages = Math.ceil(total / query.limit);
    return {
      data: items.map(l => this.sanitiseLetter(l)),
      pagination: { total, page: query.page, limit: query.limit, totalPages, hasNext: query.page < totalPages, hasPrev: query.page > 1 },
    };
  }

  async getRecord(id: string): Promise<GeneratedLetterResponse> {
    const l = await prisma.generatedLetter.findUnique({ where: { id }, include: this.LETTER_INCLUDE });
    if (!l) throw new NotFoundError('Letter not found');
    return this.sanitiseLetter(l);
  }

  // ── Structured letter PDF (for COMMITMENT_AGREEMENT and future structured types) ─

  private isStructuredType(letterType: string): boolean {
    return ['COMMITMENT_AGREEMENT', 'SUSPENSION', 'CLEARANCE_FORM', 'SICK_LEAVE', 'RESIGNATION_ACCEPTANCE', 'EXPULSION'].includes(letterType);
  }

  private buildStructuredHtml(l: {
    letterType: string;
    body: string;
    subjectName: string;
    title: string;
    generatedAt: Date;
    id: string;
  }): string {
    const issueDate = l.generatedAt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const refNumber = `STAP/${l.generatedAt.getFullYear()}/CA/${l.id.substring(0, 8).toUpperCase()}`;

    return buildLetterHtml({
      refNumber,
      issueDate,
      body:         l.body,
      directorName: 'Director, STAP Security Ltd',
      employeeName: l.subjectName,
      skipSigBlock: ['COMMITMENT_AGREEMENT', 'SUSPENSION', 'CLEARANCE_FORM', 'SICK_LEAVE', 'RESIGNATION_ACCEPTANCE', 'EXPULSION'].includes(l.letterType),
    });
  }

  async getPdf(letterId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const l = await prisma.generatedLetter.findUnique({
      where: { id: letterId },
      include: this.LETTER_INCLUDE,
    });
    if (!l) throw new NotFoundError('Letter not found');
    if (!this.isStructuredType(l.letterType)) {
      throw new AppError('PDF download is only available for structured letter types.', 400);
    }

    const html   = this.buildStructuredHtml(l);
    const buffer = await renderToPdf(html);
    const safeName = l.subjectName.replace(/\s+/g, '_');
    const fileName = `${l.letterType}-${safeName}-${l.id.substring(0, 8)}.pdf`;

    return { buffer, fileName };
  }

  private async sendLetterByEmail(l: {
    id: string;
    letterType: string;
    title: string;
    subjectName: string;
    body: string;
    generatedAt: Date;
  }): Promise<void> {
    const pdfBuffer = await renderToPdf(this.buildStructuredHtml(l as any));
    const hrEmail   = process.env.HR_EMAIL ?? 'hr@stapsecurity.co.ug';

    await sendEmail({
      to:      hrEmail,
      subject: `Approved Letter: ${l.title} — ${l.subjectName}`,
      html: `
        <p>The following letter has been approved and is attached as a PDF.</p>
        <ul>
          <li><strong>Employee:</strong> ${l.subjectName}</li>
          <li><strong>Letter Type:</strong> ${l.letterType.replace(/_/g, ' ')}</li>
          <li><strong>Title:</strong> ${l.title}</li>
        </ul>
        <p>Please print and have the employee sign the attached copy.</p>
        <p style="color:#999;font-size:11px;">STAP Security Ltd — Automated HR System</p>
      `,
      attachments: [{
        filename:    `${l.letterType}-${l.subjectName.replace(/\s+/g, '_')}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
  }
}

export const letterService = new LetterService();
