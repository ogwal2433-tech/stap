import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { guardService } from './guardService';
import type {
  CreateApplicantInput,
  UpdateApplicantStageInput,
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
    trainer:       { id: s.trainer.id, name: s.trainer.name },
    location:      s.location ?? null,
    scheduledAt:   s.scheduledAt.toISOString(),
    durationHours: s.durationHours,
    passMark:      s.passMark,
    status:        s.status,
    attendeeCount: attendees.length,
    passCount,
    failCount,
    attendees: attendees.map((a: any) => ({
      guard:    { id: a.guard.id, fullName: `${a.guard.firstName} ${a.guard.lastName}` },
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
    approvedBy:      l.approvedByUser ? { id: l.approvedByUser.id, name: l.approvedByUser.name } : null,
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

/** Count Mon–Sat days between two dates (inclusive). */
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

const SESSION_INCLUDE = {
  trainer:  { select: { id: true, name: true } },
  attendees: {
    include: {
      guard: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

const LEAVE_INCLUDE = {
  guard:         { select: { id: true, firstName: true, lastName: true, userId: true } },
  approvedByUser: { select: { id: true, name: true } },
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
      include: { assignedUser: { select: { id: true, name: true } } },
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
      include: { assignedUser: { select: { id: true, name: true } } },
    });
    if (!applicant) throw new NotFoundError('Applicant not found');

    if (!isValidTransition(applicant.stage, data.stage)) {
      throw new AppError(`Cannot transition from ${applicant.stage} to ${data.stage}`, 400);
    }
    if (data.stage === 'REJECTED' && !data.rejectionReason) {
      throw new AppError('Rejection reason is required', 400);
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
      },
      include: { assignedUser: { select: { id: true, name: true } } },
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

    await notificationService.sendToRole({
      role:    'ASSISTANT_MANAGER',
      type:    'SYSTEM',
      title:   'Applicant Converted to Guard',
      message: `Applicant ${applicant.firstName} ${applicant.lastName} has been converted to a guard successfully.`,
    });

    return guard;
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
        include: { assignedUser: { select: { id: true, name: true } } },
      }),
      prisma.applicant.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtApplicant),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
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
    const trainer = await prisma.user.findUnique({ where: { id: data.trainerId } });
    if (!trainer || trainer.role !== 'TRAINER') {
      throw new AppError('Trainer not found or user is not a TRAINER', 400);
    }

    const guards = await prisma.guard.findMany({
      where: { id: { in: data.guardIds } },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (guards.length !== data.guardIds.length) {
      throw new AppError('One or more guard IDs are invalid', 400);
    }

    const session = await prisma.trainingSession.create({
      data: {
        title:         data.title,
        description:   data.description,
        trainerId:     data.trainerId,
        location:      data.location,
        scheduledAt:   new Date(data.scheduledAt),
        durationHours: data.durationHours,
        passMark:      data.passMark,
        attendees: {
          create: data.guardIds.map((guardId) => ({ guardId })),
        },
      },
      include: SESSION_INCLUDE,
    });

    // Notify guards that have user accounts
    const guardUserIds = guards.filter((g) => g.userId).map((g) => g.userId!);
    for (const userId of guardUserIds) {
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
          where: { trainingSessionId: sessionId, guardId: result.guardId },
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
    trainerId?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<TrainingSessionResponse>> {
    const { status, trainerId, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (status)    where.status    = status;
    if (trainerId) where.trainerId = trainerId;

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
      const guardName = `${leave.guard.firstName} ${leave.guard.lastName}`;
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
