import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import {
  GUARDS_TARGET_GROUP, STAFF_TARGET_GROUP, INTERNAL_FACILITATOR,
} from '@stap/shared';
import { notificationService } from './notificationService';
import { guardService } from './guardService';
import type {
  CreateApplicantInput,
  UpdateApplicantStageInput,
  DocumentVerificationInput,
  VettingRequirementsInput,
  CreateTrainingSessionInput,
  RecordTrainingResultsInput,
  CreateLeaveRequestInput,
  ApproveLeaveInput,
  SaveLetterTemplateInput,
  ApplicantResponse,
  PipelineSummary,
  TrainingSessionResponse,
  LeaveRequestResponse,
  LeaveBalance,
  LetterTemplateResponse,
  PaginatedResponse,
  CreateGuardInput,
  GuardResponse,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtApplicant(a: any): ApplicantResponse {
  const days = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 86_400_000);
  const allDocumentsVerified =
    a.relativesIdVerified && a.nationalIdVerified && a.academicDocsVerified;
  const allVettingComplete =
    a.applicationLetterUploaded && a.contractSigned && a.vettingFormUploaded;

  return {
    id:                 a.id,
    firstName:          a.firstName,
    lastName:           a.lastName,
    fullName:           `${a.firstName} ${a.lastName}`,
    phone:              a.phone,
    email:              a.email ?? null,
    source:             a.source ?? 'WALK_IN',
    stage:              a.stage,
    interviewDate:      a.interviewDate?.toISOString() ?? null,
    offerSalary:        a.offerSalary ?? null,
    assignedTo:         a.assignedUser ? { id: a.assignedUser.id, name: a.assignedUser.name } : null,
    convertedToGuardId: a.convertedToGuardId ?? null,
    daysInPipeline:     days,
    createdAt:          a.createdAt.toISOString(),
    // Document verification
    relativesIdVerified:       a.relativesIdVerified ?? false,
    relativesIdVerifiedAt:     a.relativesIdVerifiedAt?.toISOString() ?? null,
    nationalIdVerified:        a.nationalIdVerified ?? false,
    nationalIdVerifiedAt:      a.nationalIdVerifiedAt?.toISOString() ?? null,
    academicDocsVerified:      a.academicDocsVerified ?? false,
    academicDocsVerifiedAt:    a.academicDocsVerifiedAt?.toISOString() ?? null,
    allDocumentsVerified,
    // Vetting requirements
    applicationLetterUploaded: a.applicationLetterUploaded ?? false,
    applicationLetterPath:     a.applicationLetterPath ?? null,
    contractSigned:            a.contractSigned ?? false,
    contractSignedAt:          a.contractSignedAt?.toISOString() ?? null,
    vettingFormUploaded:       a.vettingFormUploaded ?? false,
    vettingFormPath:           a.vettingFormPath ?? null,
    allVettingComplete,
    // Training
    trainingSessionId:         a.trainingSessionId ?? null,
    trainingStartedAt:         a.trainingStartedAt?.toISOString() ?? null,
    trainingCompletedAt:       a.trainingCompletedAt?.toISOString() ?? null,
    // Joining
    shoeDeductionCreated:      a.shoeDeductionCreated ?? false,
  };
}

function fmtSession(s: any): TrainingSessionResponse {
  const attendees = s.attendees ?? [];
  const passCount = attendees.filter((a: any) => a.passed === true).length;
  const failCount = attendees.filter((a: any) => a.passed === false).length;
  return {
    id:            s.id,
    title:         s.title,
    description:   s.description ?? null,
    location:      s.location ?? null,
    scheduledAt:   s.scheduledAt.toISOString(),
    durationHours: s.durationHours,
    passMark:      s.passMark,
    status:        s.status,

    targetGroup:     s.targetGroup ?? GUARDS_TARGET_GROUP,
    facilitatorType: s.facilitatorType ?? INTERNAL_FACILITATOR,
    // The stored name first: it is written for both kinds, and an internal
    // facilitator whose account was since deactivated still has one here.
    facilitatorName: s.facilitatorName ?? s.facilitatorUser?.name ?? null,
    facilitatorUser: s.facilitatorUser
      ? { id: s.facilitatorUser.id, name: s.facilitatorUser.name }
      : null,

    attendeeCount: attendees.length,
    passCount,
    failCount,
    attendees: attendees.map((a: any) => ({
      id:    a.id,
      // Exactly one of these is set, enforced by a CHECK constraint. Read
      // defensively anyway: this used to assume a guard and would throw on a
      // staff attendee rather than render one.
      guard: a.guard
        ? { id: a.guard.id, fullName: `${a.guard.firstName} ${a.guard.lastName}` }
        : null,
      staff: a.user
        ? { id: a.user.id, name: a.user.name, role: a.user.role, jobTitle: a.user.jobTitle ?? null }
        : null,
      attended: a.attended,
      score:    a.score ?? null,
      passed:   a.passed ?? null,
      notes:    a.notes ?? null,
    })),
  };
}

function fmtLeave(l: any): LeaveRequestResponse {
  return {
    id:              l.id,
    guard:           { id: l.guard.id, fullName: `${l.guard.firstName} ${l.guard.lastName}` },
    type:            l.type,
    startDate:       l.startDate.toISOString(),
    endDate:         l.endDate.toISOString(),
    daysRequested:   l.daysRequested,
    reason:          l.reason,
    status:          l.status,
    approvedBy:      l.approver ? { id: l.approver.id, name: l.approver.name } : null,
    approvedAt:      l.approvedAt?.toISOString() ?? null,
    rejectionReason: l.rejectionReason ?? null,
    createdAt:       l.createdAt.toISOString(),
  };
}

function fmtTemplate(t: any): LetterTemplateResponse {
  return {
    id:         t.id,
    name:       t.name,
    letterType: t.letterType,
    content:    t.content,
    version:    t.version,
    isActive:   t.isActive,
    createdBy:  t.createdBy,
    updatedBy:  t.updatedBy ?? null,
    createdAt:  t.createdAt.toISOString(),
    updatedAt:  t.updatedAt.toISOString(),
  };
}

/** Count Mon-Sat days between two dates (inclusive). */
function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur <= endDay) {
    if (cur.getDay() !== 0) count++; // 0 = Sunday
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const APPLICANT_INCLUDE = {
  assignedUser: { select: { id: true, name: true } },
};

const SESSION_INCLUDE = {
  facilitatorUser: { select: { id: true, name: true } },
  attendees: {
    include: {
      guard: { select: { id: true, firstName: true, lastName: true } },
      user:  { select: { id: true, name: true, role: true, jobTitle: true } },
    },
  },
};

const LEAVE_INCLUDE = {
  guard:    { select: { id: true, firstName: true, lastName: true, userId: true } },
  approver: { select: { id: true, name: true } },
};

// ── Stage transition map ───────────────────────────────────────────────────────

const STAGE_ORDER = [
  'APPLICATION_RECEIVED',
  'SCREENING',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_DONE',
  'OFFER_MADE',
  'ACCEPTED',
  'REJECTED',
  'ONBOARDING',
];

function isValidTransition(from: string, to: string): boolean {
  if (to === 'REJECTED') return true;
  const fromIdx = STAGE_ORDER.indexOf(from);
  const toIdx   = STAGE_ORDER.indexOf(to);
  return toIdx > fromIdx;
}

// ── HRService ──────────────────────────────────────────────────────────────────

class HRService {
  // ── Recruitment ──────────────────────────────────────────────────────────────

  async createApplicant(data: CreateApplicantInput, createdBy: string): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.create({
      data: {
        firstName:   data.firstName,
        lastName:    data.lastName,
        phone:       data.phone,
        email:       data.email,
        nationalId:  data.nationalId,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        address:     data.address,
        source:      data.source,
        createdBy,
      },
      include: APPLICANT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'APPLICANT_CREATED',
      entity:   'Applicant',
      entityId: applicant.id,
      newValue: { name: `${applicant.firstName} ${applicant.lastName}` },
    });

    return fmtApplicant(applicant);
  }

  async updateStage(id: string, data: UpdateApplicantStageInput, updatedBy: string): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({
      where:   { id },
      include: APPLICANT_INCLUDE,
    });
    if (!applicant) throw new NotFoundError('Applicant not found');

    if (!isValidTransition(applicant.stage, data.stage)) {
      throw new AppError(`Cannot transition from ${applicant.stage} to ${data.stage}`, 400);
    }
    if (data.stage === 'REJECTED' && !data.rejectionReason) {
      throw new AppError('Rejection reason is required', 400);
    }

    // Stage gate: moving to INTERVIEW_SCHEDULED means starting training
    if (data.stage === 'INTERVIEW_SCHEDULED') {
      const allDocs = applicant.relativesIdVerified && applicant.nationalIdVerified && applicant.academicDocsVerified;
      if (!allDocs) {
        throw new AppError(
          'Cannot start training: document verification incomplete. Relatives ID, National ID, and Academic Documents must all be confirmed.',
          400,
        );
      }
      const allVetting = (applicant as any).applicationLetterUploaded && (applicant as any).contractSigned && (applicant as any).vettingFormUploaded;
      if (!allVetting) {
        throw new AppError(
          'Cannot start training: vetting requirements incomplete. Application letter, signed contract, and vetting form must all be completed.',
          400,
        );
      }
    }

    // Stage gate: moving to ACCEPTED requires training to be completed
    if (data.stage === 'ACCEPTED') {
      const trainingSessionId = (applicant as any).trainingSessionId;
      if (trainingSessionId) {
        const session = await prisma.trainingSession.findUnique({
          where:  { id: trainingSessionId },
          select: { status: true },
        });
        if (!session || session.status !== 'COMPLETED') {
          throw new AppError('Cannot accept applicant: training has not been completed yet.', 400);
        }
      }
    }

    const updated = await prisma.applicant.update({
      where: { id },
      data: {
        stage:           data.stage,
        interviewDate:   data.interviewDate ? new Date(data.interviewDate) : undefined,
        interviewNotes:  data.interviewNotes,
        offerSalary:     data.offerSalary,
        rejectionReason: data.rejectionReason,
        offerDate:       data.stage === 'OFFER_MADE' ? new Date() : undefined,
        trainingStartedAt: data.stage === 'INTERVIEW_SCHEDULED' ? new Date() : undefined,
      },
      include: APPLICANT_INCLUDE,
    });

    if (data.stage === 'ACCEPTED') {
      await notificationService.sendToRole({
        role:    'ASSISTANT_MANAGER',
        type:    'APPROVAL_REQUIRED',
        title:   'Applicant Accepted',
        message: `${applicant.firstName} ${applicant.lastName} has been accepted. Please begin onboarding.`,
      });
    }

    return fmtApplicant(updated);
  }

  async verifyDocuments(
    applicantId: string,
    data: DocumentVerificationInput,
    verifiedBy: string,
  ): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({
      where:   { id: applicantId },
      include: APPLICANT_INCLUDE,
    });
    if (!applicant) throw new NotFoundError('Applicant not found');

    const now = new Date();
    const updateData: any = {
      relativesIdVerified:  data.relativesIdVerified,
      nationalIdVerified:   data.nationalIdVerified,
      academicDocsVerified: data.academicDocsVerified,
    };

    if (data.relativesIdVerified && !(applicant as any).relativesIdVerified) {
      updateData.relativesIdVerifiedAt = now;
    }
    if (data.nationalIdVerified && !(applicant as any).nationalIdVerified) {
      updateData.nationalIdVerifiedAt = now;
    }
    if (data.academicDocsVerified && !(applicant as any).academicDocsVerified) {
      updateData.academicDocsVerifiedAt = now;
    }

    // Auto-advance from APPLICATION_RECEIVED → SCREENING when all 3 docs verified
    if (
      data.relativesIdVerified &&
      data.nationalIdVerified &&
      data.academicDocsVerified &&
      applicant.stage === 'APPLICATION_RECEIVED'
    ) {
      updateData.stage = 'SCREENING';
    }

    const updated = await prisma.applicant.update({
      where:   { id: applicantId },
      data:    updateData,
      include: APPLICANT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   verifiedBy,
      action:   'DOCUMENTS_VERIFIED',
      entity:   'Applicant',
      entityId: applicantId,
      newValue: {
        relativesIdVerified:  data.relativesIdVerified,
        nationalIdVerified:   data.nationalIdVerified,
        academicDocsVerified: data.academicDocsVerified,
      },
    });

    return fmtApplicant(updated);
  }

  async updateVettingRequirements(
    applicantId: string,
    data: VettingRequirementsInput,
    updatedBy: string,
  ): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({
      where:   { id: applicantId },
      include: APPLICANT_INCLUDE,
    });
    if (!applicant) throw new NotFoundError('Applicant not found');

    const updateData: any = {};
    if (data.applicationLetterUploaded !== undefined) {
      updateData.applicationLetterUploaded = data.applicationLetterUploaded;
    }
    if (data.contractSigned !== undefined) {
      updateData.contractSigned = data.contractSigned;
      if (data.contractSigned && !(applicant as any).contractSigned) {
        updateData.contractSignedAt = data.contractSignedAt
          ? new Date(data.contractSignedAt)
          : new Date();
      }
    }
    if (data.vettingFormUploaded !== undefined) {
      updateData.vettingFormUploaded = data.vettingFormUploaded;
    }

    const updated = await prisma.applicant.update({
      where:   { id: applicantId },
      data:    updateData,
      include: APPLICANT_INCLUDE,
    });

    // Notify when all 3 vetting requirements now complete AND docs also verified
    const allDocs    = (updated as any).relativesIdVerified && (updated as any).nationalIdVerified && (updated as any).academicDocsVerified;
    const allVetting = (updated as any).applicationLetterUploaded && (updated as any).contractSigned && (updated as any).vettingFormUploaded;
    const wasAlreadyComplete =
      (applicant as any).applicationLetterUploaded &&
      (applicant as any).contractSigned &&
      (applicant as any).vettingFormUploaded;

    if (allDocs && allVetting && !wasAlreadyComplete) {
      await notificationService.sendToRole({
        role:    'ASSISTANT_MANAGER',
        type:    'SYSTEM',
        title:   'Applicant Ready for Training',
        message: `Applicant ${applicant.firstName} ${applicant.lastName} is ready to start training. All documents verified and vetting complete.`,
      });
    }

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'VETTING_REQUIREMENTS_UPDATED',
      entity:   'Applicant',
      entityId: applicantId,
      newValue: data,
    });

    return fmtApplicant(updated);
  }

  async uploadApplicationLetter(
    applicantId: string,
    filePath: string,
    updatedBy: string,
  ): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundError('Applicant not found');

    const updated = await prisma.applicant.update({
      where:   { id: applicantId },
      data:    { applicationLetterPath: filePath, applicationLetterUploaded: true },
      include: APPLICANT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'APPLICATION_LETTER_UPLOADED',
      entity:   'Applicant',
      entityId: applicantId,
      newValue: { filePath },
    });

    return fmtApplicant(updated);
  }

  async uploadVettingForm(
    applicantId: string,
    filePath: string,
    updatedBy: string,
  ): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundError('Applicant not found');

    const updated = await prisma.applicant.update({
      where:   { id: applicantId },
      data:    { vettingFormPath: filePath, vettingFormUploaded: true },
      include: APPLICANT_INCLUDE,
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'VETTING_FORM_UPLOADED',
      entity:   'Applicant',
      entityId: applicantId,
      newValue: { filePath },
    });

    return fmtApplicant(updated);
  }

  async convertToGuard(
    applicantId: string,
    guardData: CreateGuardInput,
    convertedBy: string,
  ): Promise<GuardResponse> {
    const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundError('Applicant not found');
    if (!['ACCEPTED', 'ONBOARDING'].includes(applicant.stage)) {
      throw new AppError('Applicant must be in ACCEPTED or ONBOARDING stage to convert', 400);
    }

    const guard = await guardService.create(guardData, convertedBy);

    await prisma.applicant.update({
      where: { id: applicantId },
      data:  { convertedToGuardId: guard.id, stage: 'ONBOARDING' },
    });

    // Auto-issue uniform and create shoe deduction
    await this._issueUniformAndShoeDeduction(guard.id, applicantId, convertedBy, `${applicant.firstName} ${applicant.lastName}`);

    await notificationService.sendToRole({
      role:    'ASSISTANT_MANAGER',
      type:    'SYSTEM',
      title:   'Applicant Converted to Guard',
      message: `Applicant ${applicant.firstName} ${applicant.lastName} has been converted to a guard successfully.`,
    });

    return guard;
  }

  private async _issueUniformAndShoeDeduction(
    guardId: string,
    applicantId: string,
    issuedBy: string,
    guardName: string,
  ): Promise<void> {
    const uniformItems = await prisma.inventoryItem.findMany({
      where: { itemType: 'UNIFORM', isActive: true },
    });

    for (const item of uniformItems) {
      if (item.stockQuantity < 1) continue;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.inventoryTransaction.create({
            data: {
              itemId:        item.id,
              guardId,
              action:        'ISSUED',
              quantity:       1,
              conditionNote: item.issuedFree ? 'Issued free on joining' : 'Issued on joining',
              recordedBy:    issuedBy,
            },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data:  { stockQuantity: { decrement: 1 } },
          });
        });
      } catch {
        // Stock exhausted mid-loop — skip silently
      }

      if (item.isShoeItem) {
        const applicant = await prisma.applicant.findUnique({
          where:  { id: applicantId },
          select: { shoeDeductionCreated: true },
        });
        if (!applicant?.shoeDeductionCreated) {
          await prisma.guardDeduction.create({
            data: {
              guardId,
              type:          'UNIFORM_RECOVERY',
              amount:        30000,
              description:   'Shoes deduction — one-off charge on joining (UGX 30,000)',
              effectiveDate: new Date(),
              createdBy:     issuedBy,
            },
          });
          await prisma.applicant.update({
            where: { id: applicantId },
            data:  { shoeDeductionCreated: true, siteAssignedAt: new Date() },
          });
        }
      }
    }

    await notificationService.sendToRole({
      role:    'ASSISTANT_MANAGER',
      type:    'SYSTEM',
      title:   'Uniform Issued',
      message: `Guard ${guardName} uniform issued and shoe deduction of UGX 30,000 created automatically.`,
    });
  }

  async listApplicants(query: {
    stage?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<ApplicantResponse>> {
    const { stage, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where = stage ? { stage } : {};

    const [data, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: APPLICANT_INCLUDE,
      }),
      prisma.applicant.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtApplicant),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getApplicant(id: string): Promise<ApplicantResponse> {
    const applicant = await prisma.applicant.findUnique({
      where:   { id },
      include: APPLICANT_INCLUDE,
    });
    if (!applicant) throw new NotFoundError('Applicant not found');
    return fmtApplicant(applicant);
  }

  async getPipelineSummary(): Promise<PipelineSummary> {
    const groups = await prisma.applicant.groupBy({
      by:          ['stage'],
      _count:      { stage: true },
    });

    const byStage = groups.map((g) => ({ stage: g.stage, count: g._count.stage }));
    const totalActive  = byStage.filter((s) => s.stage !== 'REJECTED').reduce((sum, s) => sum + s.count, 0);
    const totalAll     = byStage.reduce((sum, s) => sum + s.count, 0);
    const acceptedCount = byStage.find((s) => s.stage === 'ACCEPTED')?.count ?? 0;
    const conversionRate = totalAll > 0 ? Math.round((acceptedCount / totalAll) * 100) : 0;

    return { byStage, totalActive, conversionRate };
  }

  // ── Training ──────────────────────────────────────────────────────────────────

  async createTrainingSession(
    data: CreateTrainingSessionInput,
    createdBy: string,
  ): Promise<TrainingSessionResponse> {
    const forStaff = data.targetGroup === STAFF_TARGET_GROUP;

    // The facilitator is no longer required to hold the TRAINER role — a
    // supervisor or controller commonly runs a session — but an internal one
    // must still be a real, active member of staff rather than a guard or a
    // client portal login.
    let facilitatorName = data.facilitatorName?.trim() || null;
    if (data.facilitatorType === INTERNAL_FACILITATOR) {
      const facilitator = await prisma.user.findUnique({
        where:  { id: data.facilitatorUserId! },
        select: { id: true, name: true, role: true, status: true },
      });
      if (!facilitator || facilitator.status !== 'ACTIVE') {
        throw new AppError('The chosen facilitator is not an active user', 400);
      }
      if (facilitator.role === 'GUARD' || facilitator.role === 'CLIENT') {
        throw new AppError('A facilitator must be a member of staff', 400);
      }
      // Copied, so the session still names who ran it if that account is later
      // deactivated and the relation is nulled out.
      facilitatorName = facilitator.name;
    }

    // Validated as a set: findMany collapses duplicates, so comparing its
    // length against the raw array would reject a list that merely repeated an
    // id, and accept nothing wrong.
    const guardIds = [...new Set(data.guardIds)];
    const staffIds = [...new Set(data.staffIds)];

    let guards: { id: string; userId: string | null }[] = [];
    let staff:  { id: string }[] = [];

    if (forStaff) {
      staff = await prisma.user.findMany({
        where:  { id: { in: staffIds }, role: { notIn: ['GUARD', 'CLIENT'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (staff.length !== staffIds.length) {
        throw new AppError('One or more attendees are not active staff members', 400);
      }
    } else {
      guards = await prisma.guard.findMany({
        where:  { id: { in: guardIds } },
        select: { id: true, userId: true },
      });
      if (guards.length !== guardIds.length) {
        throw new AppError('One or more guard IDs are invalid', 400);
      }
    }

    const session = await prisma.trainingSession.create({
      data: {
        title:         data.title,
        description:   data.description,
        location:      data.location,
        scheduledAt:   new Date(data.scheduledAt),
        durationHours: data.durationHours,
        passMark:      data.passMark,

        targetGroup:       data.targetGroup,
        facilitatorType:   data.facilitatorType,
        facilitatorName,
        facilitatorUserId: data.facilitatorType === INTERNAL_FACILITATOR
          ? data.facilitatorUserId!
          : null,

        attendees: {
          create: forStaff
            ? staffIds.map((userId) => ({ userId }))
            : guardIds.map((guardId) => ({ guardId })),
        },
      },
      include: SESSION_INCLUDE,
    });

    // Tell the attendees. Guards are reachable only if they have a login;
    // staff always are, since a staff record is a user account.
    const notifyUserIds = forStaff
      ? staffIds
      : guards.filter((g) => g.userId).map((g) => g.userId!);

    for (const userId of notifyUserIds) {
      await notificationService.send({
        userId,
        type:    'SYSTEM',
        title:   'Training Session Scheduled',
        message: `Training session "${data.title}" is scheduled on ${new Date(data.scheduledAt).toLocaleDateString('en-UG')}${data.location ? ` at ${data.location}` : ''}.`,
      });
    }

    return fmtSession(session);
  }

  async recordResults(
    sessionId: string,
    data: RecordTrainingResultsInput,
    recordedBy: string,
  ): Promise<TrainingSessionResponse> {
    const session = await prisma.trainingSession.findUnique({
      where:   { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundError('Training session not found');
    if (session.status === 'CANCELLED') {
      throw new AppError('Cannot record results for a cancelled session', 400);
    }
    if (session.status === 'COMPLETED') {
      throw new AppError('Results already recorded for this session', 400);
    }

    await prisma.$transaction(async (tx) => {
      for (const result of data.results) {
        const passed = result.score !== undefined ? result.score >= session.passMark : undefined;
        await tx.trainingAttendee.updateMany({
          // Keyed on whichever kind the result names — the schema requires
          // exactly one — so a staff session's results land as well.
          where: {
            trainingSessionId: sessionId,
            ...(result.guardId ? { guardId: result.guardId } : { userId: result.userId }),
          },
          data:  { attended: result.attended, score: result.score, notes: result.notes, passed },
        });
      }
      await tx.trainingSession.update({
        where: { id: sessionId },
        data:  { status: 'COMPLETED' },
      });
    });

    const updated = await prisma.trainingSession.findUnique({
      where:   { id: sessionId },
      include: SESSION_INCLUDE,
    });
    return fmtSession(updated);
  }

  async listSessions(query: {
    status?: string;
    facilitatorUserId?: string;
    targetGroup?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<TrainingSessionResponse>> {
    const { status, facilitatorUserId, targetGroup, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (status)            where.status            = status;
    if (facilitatorUserId) where.facilitatorUserId = facilitatorUserId;
    if (targetGroup)       where.targetGroup       = targetGroup;

    const [data, total] = await Promise.all([
      prisma.trainingSession.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { scheduledAt: 'desc' },
        include: SESSION_INCLUDE,
      }),
      prisma.trainingSession.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtSession),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  // ── Leave Management ──────────────────────────────────────────────────────────

  async requestLeave(data: CreateLeaveRequestInput, requestedBy: string): Promise<LeaveRequestResponse> {
    const guard = await prisma.guard.findUnique({
      where:  { id: data.guardId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!guard) throw new NotFoundError('Guard not found');

    const startDate = new Date(data.startDate);
    const endDate   = new Date(data.endDate);
    const daysRequested = countWorkingDays(startDate, endDate);

    // Check for overlapping approved leave
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        guardId: data.guardId,
        status:  'APPROVED',
        AND: [
          { startDate: { lte: endDate } },
          { endDate:   { gte: startDate } },
        ],
      },
    });
    if (overlap) {
      throw new AppError('Guard already has approved leave in this period', 409);
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        guardId:      data.guardId,
        type:         data.type,
        startDate,
        endDate,
        daysRequested,
        reason:       data.reason,
      },
      include: LEAVE_INCLUDE,
    });

    await notificationService.sendToRole({
      role:    'ASSISTANT_MANAGER',
      type:    'APPROVAL_REQUIRED',
      title:   'Leave Request',
      message: `${guard.firstName} ${guard.lastName} requests ${data.type} leave from ${startDate.toLocaleDateString('en-UG')} to ${endDate.toLocaleDateString('en-UG')}.`,
    });

    return fmtLeave(leave);
  }

  async approveLeave(id: string, data: ApproveLeaveInput, actionBy: string): Promise<LeaveRequestResponse> {
    const leave = await prisma.leaveRequest.findUnique({
      where:   { id },
      include: LEAVE_INCLUDE,
    });
    if (!leave) throw new NotFoundError('Leave request not found');
    if (leave.status !== 'PENDING') {
      throw new AppError(`Leave request is already ${leave.status}`, 400);
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: data.action === 'APPROVE'
        ? { status: 'APPROVED', approvedBy: actionBy, approvedAt: new Date() }
        : { status: 'REJECTED', rejectedBy: actionBy, rejectionReason: data.rejectionReason },
      include: LEAVE_INCLUDE,
    });

    // Notify guard if they have a user account
    const guardUserId = (leave.guard as any).userId;
    if (guardUserId) {
      await notificationService.send({
        userId:  guardUserId,
        type:    'SYSTEM',
        title:   `Leave ${data.action === 'APPROVE' ? 'Approved' : 'Rejected'}`,
        message: data.action === 'APPROVE'
          ? `Your ${leave.type} leave request has been approved.`
          : `Your ${leave.type} leave request was rejected. Reason: ${data.rejectionReason}`,
      });
    }

    return fmtLeave(updated);
  }

  async listLeaveRequests(query: {
    guardId?: string;
    status?: string;
    type?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<LeaveRequestResponse>> {
    const { guardId, status, type, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (guardId) where.guardId = guardId;
    if (status)  where.status  = status;
    if (type)    where.type    = type;

    const [data, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: LEAVE_INCLUDE,
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtLeave),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getLeaveBalance(guardId: string): Promise<LeaveBalance> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId } });
    if (!guard) throw new NotFoundError('Guard not found');

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd   = new Date(new Date().getFullYear(), 11, 31);

    const approved = await prisma.leaveRequest.findMany({
      where: {
        guardId,
        status:    'APPROVED',
        startDate: { gte: yearStart, lte: yearEnd },
      },
    });

    const taken = (type: string) =>
      approved.filter((l) => l.type === type).reduce((sum, l) => sum + l.daysRequested, 0);

    const annualTaken = taken('ANNUAL');
    return {
      annual:    { entitled: 21, taken: annualTaken, remaining: Math.max(0, 21 - annualTaken) },
      sick:      { taken: taken('SICK') },
      emergency: { taken: taken('EMERGENCY') },
    };
  }

  // ── Letter Templates ──────────────────────────────────────────────────────────

  async getTemplate(letterType: string): Promise<LetterTemplateResponse | null> {
    const tmpl = await prisma.letterTemplate.findUnique({ where: { letterType } });
    return tmpl ? fmtTemplate(tmpl) : null;
  }

  async saveTemplate(data: SaveLetterTemplateInput, savedBy: string): Promise<LetterTemplateResponse> {
    const existing = await prisma.letterTemplate.findUnique({ where: { letterType: data.letterType } });

    const tmpl = existing
      ? await prisma.letterTemplate.update({
          where: { letterType: data.letterType },
          data:  { name: data.name, content: data.content, version: { increment: 1 }, updatedBy: savedBy },
        })
      : await prisma.letterTemplate.create({
          data: { name: data.name, letterType: data.letterType, content: data.content, createdBy: savedBy },
        });

    return fmtTemplate(tmpl);
  }

  async listTemplates(): Promise<LetterTemplateResponse[]> {
    const templates = await prisma.letterTemplate.findMany({ orderBy: { letterType: 'asc' } });
    return templates.map(fmtTemplate);
  }

  async previewTemplate(letterType: string, sampleData: Record<string, string>): Promise<string> {
    const tmpl = await prisma.letterTemplate.findUnique({ where: { letterType } });
    if (!tmpl) throw new NotFoundError(`Template not found for type: ${letterType}`);

    let html = tmpl.content;
    for (const [key, value] of Object.entries(sampleData)) {
      html = html.split(`{${key}}`).join(value);
    }
    return html;
  }
}

export const hrService = new HRService();
