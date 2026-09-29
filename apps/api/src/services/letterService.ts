import prisma from '../db/prisma';
import { companyProfile } from './integrationSettings';
import { renderToPdf } from '../lib/pdfBase';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { sendEmail } from '../lib/mailer';
import { buildLetterHtml } from '../lib/templates/letterBase';
import { DISCIPLINARY_LETTER_TYPES, HR_LETTER_TYPES, STRUCTURED_LETTER_TYPES } from '@security360/shared';
import type {
  GenerateLetterInput,
  ApproveLetterInput,
  GeneratedLetterResponse,
  PaginatedResponse,
} from '@security360/shared';

// ── Letter record with approval workflow ────────────────────────────────────────
// The single letter-generation system: every letter (disciplinary or HR) is a
// GeneratedLetter row that goes through PENDING → APPROVED/REJECTED. Disciplinary
// letters additionally carry disciplinaryRecordId linking them to the incident
// they were generated from; HR letters leave it null.

class LetterService {
  private sanitiseLetter(l: any): GeneratedLetterResponse {
    return {
      id:             l.id,
      subjectType:    l.subjectType,
      subjectId:      l.subjectId,
      subjectName:    l.subjectName,
      title:          l.title,
      body:           l.body,
      letterType:     l.letterType,
      disciplinaryRecordId: l.disciplinaryRecordId ?? null,
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
        disciplinaryRecordId: data.disciplinaryRecordId ?? null,
        generatedBy,
        approvalStatus: 'PENDING',
      },
      include: this.LETTER_INCLUDE,
    });

    // Link the notification to the guard's profile (where the letter can be
    // reviewed and approved inline) rather than a non-existent letters page.
    await notificationService.sendToRoles(
      ['DIRECTOR', 'ASSISTANT_MANAGER'],
      {
        type:       'SYSTEM',
        title:      'Letter Awaiting Approval',
        message:    `A ${letter.letterType} letter for ${letter.subjectName} has been generated and is awaiting HR approval.`,
        entityType: letter.subjectType === 'GUARD' ? 'guard' : 'generatedLetter',
        entityId:   letter.subjectType === 'GUARD' ? letter.subjectId : letter.id,
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

  async updateBody(letterId: string, body: string): Promise<GeneratedLetterResponse> {
    const existing = await prisma.generatedLetter.findUnique({ where: { id: letterId } });
    if (!existing) throw new NotFoundError('Letter not found');
    if (existing.approvalStatus !== 'PENDING') {
      throw new AppError('Only PENDING letters can be edited.', 400);
    }
    // Structured letters (COMMITMENT_AGREEMENT, SUSPENSION) are assembled from
    // dedicated form fields into HTML with tables/inline styles that a rich-text
    // editor's schema can't round-trip losslessly. Fix these by regenerating the
    // letter with corrected fields, not by hand-editing the rendered body.
    if ((STRUCTURED_LETTER_TYPES as readonly string[]).includes(existing.letterType)) {
      throw new AppError(
        'This letter type is generated from structured fields and must be regenerated, not edited directly.',
        400,
      );
    }

    const updated = await prisma.generatedLetter.update({
      where: { id: letterId },
      data:  { body },
      include: this.LETTER_INCLUDE,
    });
    return this.sanitiseLetter(updated);
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
      entityType: existing.subjectType === 'GUARD' ? 'guard' : 'generatedLetter',
      entityId:   existing.subjectType === 'GUARD' ? existing.subjectId : letterId,
    });

    await QueueService.logAudit({
      userId:   approvedBy,
      action:   `LETTER_${decision}`,
      entity:   'GeneratedLetter',
      entityId: letterId,
      newValue: { decision, approvedBy, notes },
    });

    // Auto-email PDF for structured letter types when approved
    if (decision === 'APPROVED' && (STRUCTURED_LETTER_TYPES as readonly string[]).includes(existing.letterType)) {
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
    subjectId?:            string;
    approvalStatus?:       string;
    letterType?:           string;
    generatedBy?:          string;
    disciplinaryRecordId?: string;
    isDisciplinary?:       boolean;
    page:                  number;
    limit:                 number;
  }): Promise<PaginatedResponse<GeneratedLetterResponse>> {
    const where: any = { isActive: true };
    if (query.subjectId)      where.subjectId      = query.subjectId;
    if (query.approvalStatus) where.approvalStatus = query.approvalStatus;
    if (query.letterType)     where.letterType     = query.letterType;
    if (query.generatedBy)    where.generatedBy    = query.generatedBy;
    if (query.disciplinaryRecordId) where.disciplinaryRecordId = query.disciplinaryRecordId;
    if (query.isDisciplinary === true)  where.letterType = { in: [...DISCIPLINARY_LETTER_TYPES] };
    if (query.isDisciplinary === false) where.letterType = { in: [...HR_LETTER_TYPES] };

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

  // ── Letter PDF (any letter type) ─────────────────────────────────────────────

  private readonly REF_CODE: Record<string, string> = {
    WARNING:              'WN',
    SUSPENSION:           'SU',
    TERMINATION:          'TM',
    COMMENDATION:         'CM',
    REINSTATEMENT:        'RI',
    GENERAL:              'GN',
    COMMITMENT_AGREEMENT: 'CA',
  };

  private async buildPdfHtml(l: {
    letterType: string;
    body: string;
    subjectName: string;
    title: string;
    generatedAt: Date;
    id: string;
  }): Promise<string> {
    const company = await companyProfile();
    const issueDate = l.generatedAt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const refCode = this.REF_CODE[l.letterType] ?? 'GN';
    const refNumber = `S360/${l.generatedAt.getFullYear()}/${refCode}/${l.id.substring(0, 8).toUpperCase()}`;

    return buildLetterHtml({
      refNumber,
      issueDate,
      body:         l.body,
      directorName: `Director, ${company.name}`,
      companyName: company.name,
      employeeName: l.subjectName,
      skipSigBlock: (STRUCTURED_LETTER_TYPES as readonly string[]).includes(l.letterType),
    });
  }

  async getPdf(letterId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const l = await prisma.generatedLetter.findUnique({
      where: { id: letterId },
      include: this.LETTER_INCLUDE,
    });
    if (!l) throw new NotFoundError('Letter not found');

    const html   = await this.buildPdfHtml(l);
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
    const company = await companyProfile();
    const pdfBuffer = await renderToPdf(await this.buildPdfHtml(l as any));
    const hrEmail   = process.env.HR_EMAIL ?? 'hr@security360.co.ug';

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
        <p style="color:#999;font-size:11px;">${company.name} — Automated HR System</p>
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
