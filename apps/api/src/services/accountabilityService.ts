import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { ROLES, ACCOUNTABILITY_STAGES } from '@stap/shared';
import type {
  AccountabilityItemInput,
  ReviewAccountabilityInput,
  AccountabilityResponse,
  AccountabilityStatus,
} from '@stap/shared';

/** Requisition states where the money has been released and can be accounted for. */
const SPENDABLE_STATUSES = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS'];

const FULL_INCLUDE = {
  items:              { orderBy: { itemNumber: 'asc' } },
  submittedBy:        { select: { id: true, name: true } },
  adminReviewedBy:    { select: { id: true, name: true } },
  hrReviewedBy:       { select: { id: true, name: true } },
  directorApprovedBy: { select: { id: true, name: true } },
} as const;

const stageIndex = (s: string) => ACCOUNTABILITY_STAGES.indexOf(s as AccountabilityStatus);

const STAGE_LABEL: Record<AccountabilityStatus, string> = {
  SUBMITTED:         'submission',
  ADMIN_REVIEWED:    'Admin review',
  HR_REVIEWED:       'HR review',
  DIRECTOR_APPROVED: 'Director approval',
};

function sanitise(acc: any): AccountabilityResponse {
  return {
    id:                  acc.id,
    requisitionId:       acc.requisitionId,
    status:              acc.status,
    totalSubmitted:      acc.items.reduce((sum: number, i: any) => sum + i.totalCost, 0),
    totalAdminAmount:    acc.totalAdminAmount,
    totalHRAmount:       acc.totalHRAmount,
    totalDirectorAmount: acc.totalDirectorAmount,
    originalAmount:      acc.originalAmount,
    variance:            acc.variance,
    submittedBy:         acc.submittedBy ?? null,
    submittedAt:         acc.submittedAt?.toISOString() ?? null,
    adminReviewedBy:     acc.adminReviewedBy ?? null,
    adminReviewedAt:     acc.adminReviewedAt?.toISOString() ?? null,
    adminNotes:          acc.adminNotes ?? null,
    hrReviewedBy:        acc.hrReviewedBy ?? null,
    hrReviewedAt:        acc.hrReviewedAt?.toISOString() ?? null,
    hrNotes:             acc.hrNotes ?? null,
    directorApprovedBy:  acc.directorApprovedBy ?? null,
    directorApprovedAt:  acc.directorApprovedAt?.toISOString() ?? null,
    directorNotes:       acc.directorNotes ?? null,
    items: acc.items.map((i: any) => ({
      id:              i.id,
      itemNumber:      i.itemNumber,
      requisitionItem: i.requisitionItem,
      category:        i.category,
      quantity:        i.quantity,
      rate:            i.rate,
      totalCost:       i.totalCost,
      adminAmount:     i.adminAmount,
      hrAmount:        i.hrAmount,
      directorAmount:  i.directorAmount,
      notes:           i.notes ?? null,
    })),
    createdAt: acc.createdAt.toISOString(),
    updatedAt: acc.updatedAt.toISOString(),
  };
}

class AccountabilityService {
  async getByRequisition(requisitionId: string): Promise<AccountabilityResponse | null> {
    const acc = await prisma.requisitionAccountability.findUnique({
      where:   { requisitionId },
      include: FULL_INCLUDE,
    });
    return acc ? sanitise(acc) : null;
  }

  /**
   * Records what was actually spent. Re-submitting replaces the lines, which
   * also clears any reviewer figures — those were entered against the old
   * breakdown and would be misleading if carried over.
   */
  async submit(
    requisitionId: string,
    items: AccountabilityItemInput[],
    submittedById: string,
  ): Promise<AccountabilityResponse> {
    const requisition = await prisma.requisition.findUnique({
      where:  { id: requisitionId },
      select: { id: true, amount: true, particulars: true, status: true },
    });
    if (!requisition) throw new NotFoundError('Requisition not found');

    if (!SPENDABLE_STATUSES.includes(requisition.status)) {
      throw new AppError(
        `Accountability applies once funds have been released. This requisition is ` +
          `${requisition.status.replace(/_/g, ' ').toLowerCase()}.`,
        400,
      );
    }

    const existing = await prisma.requisitionAccountability.findUnique({
      where:  { requisitionId },
      select: { id: true, status: true },
    });

    if (existing && existing.status === 'DIRECTOR_APPROVED') {
      throw new AppError(
        'This accountability has been approved by the Director and can no longer be changed.',
        400,
      );
    }

    const rows = items.map((item, i) => ({
      itemNumber:      i + 1,
      requisitionItem: item.requisitionItem.trim(),
      category:        item.category.trim(),
      quantity:        item.quantity,
      rate:            item.rate,
      totalCost:       item.quantity * item.rate,
      notes:           item.notes ?? null,
    }));

    const acc = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.accountabilityItem.deleteMany({ where: { accountabilityId: existing.id } });
        return tx.requisitionAccountability.update({
          where: { id: existing.id },
          data: {
            status:              'SUBMITTED',
            submittedById,
            submittedAt:         new Date(),
            originalAmount:      requisition.amount,
            // A fresh breakdown invalidates every prior review.
            totalAdminAmount:    0,
            totalHRAmount:       0,
            totalDirectorAmount: 0,
            variance:            0,
            adminReviewedById:   null,
            adminReviewedAt:     null,
            adminNotes:          null,
            hrReviewedById:      null,
            hrReviewedAt:        null,
            hrNotes:             null,
            directorApprovedById: null,
            directorApprovedAt:  null,
            directorNotes:       null,
            items:               { create: rows },
          },
          include: FULL_INCLUDE,
        });
      }

      return tx.requisitionAccountability.create({
        data: {
          requisitionId,
          status:         'SUBMITTED',
          submittedById,
          submittedAt:    new Date(),
          originalAmount: requisition.amount,
          items:          { create: rows },
        },
        include: FULL_INCLUDE,
      });
    });

    const spent = rows.reduce((sum, r) => sum + r.totalCost, 0);
    await notificationService.sendToRoles([ROLES.ADMINISTRATOR, ROLES.ASSISTANT_MANAGER], {
      type:       'SYSTEM',
      title:      'Accountability Submitted',
      message:
        `Accountability for "${requisition.particulars.slice(0, 60)}" — ` +
        `UGX ${spent.toLocaleString()} across ${rows.length} line${rows.length === 1 ? '' : 's'}. ` +
        'Admin review required.',
      entityType: 'requisition',
      entityId:   requisitionId,
    });

    await QueueService.logAudit({
      userId:   submittedById,
      action:   'ACCOUNTABILITY_SUBMITTED',
      entity:   'RequisitionAccountability',
      entityId: acc.id,
      newValue: { requisitionId, lines: rows.length, totalSubmitted: spent, originalAmount: requisition.amount },
    }).catch(() => { /* a queue outage must not undo a save that already happened */ });

    return sanitise(acc);
  }

  /**
   * Applies one reviewer's figures. Reviews run in order, and the amounts are
   * totalled from the database afterwards rather than from the request, so a
   * partial submission can't produce a wrong total.
   */
  private async review(
    stage: Exclude<AccountabilityStatus, 'SUBMITTED'>,
    requisitionId: string,
    data: ReviewAccountabilityInput,
    reviewerId: string,
  ): Promise<AccountabilityResponse> {
    const acc = await prisma.requisitionAccountability.findUnique({
      where:   { requisitionId },
      include: { items: { select: { id: true } } },
    });
    if (!acc) throw new NotFoundError('No accountability has been submitted for this requisition');

    if (acc.status === 'DIRECTOR_APPROVED') {
      throw new AppError('This accountability is already approved and closed.', 400);
    }

    // Each stage requires the one before it.
    const required = ACCOUNTABILITY_STAGES[stageIndex(stage) - 1];
    if (stageIndex(acc.status) < stageIndex(required)) {
      throw new AppError(
        `${STAGE_LABEL[required]} must be completed first — this accountability is at ` +
          `${STAGE_LABEL[acc.status as AccountabilityStatus] ?? acc.status}.`,
        400,
      );
    }

    // Only lines belonging to this accountability may be written.
    const ownIds = new Set(acc.items.map(i => i.id));
    const stray  = data.items.filter(i => !ownIds.has(i.id));
    if (stray.length) {
      throw new AppError('One or more lines do not belong to this accountability.', 400);
    }
    if (data.items.length !== acc.items.length) {
      throw new AppError(
        `Enter an amount for every line — ${acc.items.length} expected, ${data.items.length} received.`,
        400,
      );
    }

    const amountField =
      stage === 'ADMIN_REVIEWED' ? 'adminAmount' : stage === 'HR_REVIEWED' ? 'hrAmount' : 'directorAmount';

    const updated = await prisma.$transaction(async (tx) => {
      for (const line of data.items) {
        await tx.accountabilityItem.update({
          where: { id: line.id },
          data:  {
            [amountField]: line.amount,
            ...(line.notes !== undefined ? { notes: line.notes } : {}),
          },
        });
      }

      const totals = await tx.accountabilityItem.aggregate({
        where: { accountabilityId: acc.id },
        _sum:  { adminAmount: true, hrAmount: true, directorAmount: true },
      });

      const totalDirector = totals._sum.directorAmount ?? 0;

      return tx.requisitionAccountability.update({
        where: { id: acc.id },
        data: {
          status:              stage,
          totalAdminAmount:    totals._sum.adminAmount ?? 0,
          totalHRAmount:       totals._sum.hrAmount ?? 0,
          totalDirectorAmount: totalDirector,
          // Variance only means something once the Director has ruled.
          variance: stage === 'DIRECTOR_APPROVED' ? totalDirector - acc.originalAmount : acc.variance,
          ...(stage === 'ADMIN_REVIEWED'
            ? { adminReviewedById: reviewerId, adminReviewedAt: new Date(), adminNotes: data.notes ?? null }
            : {}),
          ...(stage === 'HR_REVIEWED'
            ? { hrReviewedById: reviewerId, hrReviewedAt: new Date(), hrNotes: data.notes ?? null }
            : {}),
          ...(stage === 'DIRECTOR_APPROVED'
            ? { directorApprovedById: reviewerId, directorApprovedAt: new Date(), directorNotes: data.notes ?? null }
            : {}),
        },
        include: FULL_INCLUDE,
      });
    });

    const nextUp: Record<string, { roles: string[]; title: string; message: string }> = {
      ADMIN_REVIEWED: {
        roles:   [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER],
        title:   'Accountability: Admin review done',
        message: 'Admin has entered their figures. HR review is now required.',
      },
      HR_REVIEWED: {
        roles:   [ROLES.DIRECTOR],
        title:   'Accountability: Awaiting Director',
        message: 'Admin and HR have reviewed. Director approval is required to close.',
      },
      DIRECTOR_APPROVED: {
        roles:   [ROLES.ADMINISTRATOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER],
        title:   'Accountability approved',
        message:
          updated.variance === 0
            ? 'The Director approved the accountability. Spend matched the requisition exactly.'
            : updated.variance > 0
              ? `The Director approved the accountability. Overspend of UGX ${updated.variance.toLocaleString()}.`
              : `The Director approved the accountability. Surplus of UGX ${Math.abs(updated.variance).toLocaleString()} to return.`,
      },
    };

    const notice = nextUp[stage];
    if (notice) {
      await notificationService.sendToRoles(notice.roles, {
        type:       'SYSTEM',
        title:      notice.title,
        message:    notice.message,
        entityType: 'requisition',
        entityId:   requisitionId,
      });
    }

    await QueueService.logAudit({
      userId:   reviewerId,
      action:   `ACCOUNTABILITY_${stage}`,
      entity:   'RequisitionAccountability',
      entityId: acc.id,
      newValue: {
        totalAdminAmount:    updated.totalAdminAmount,
        totalHRAmount:       updated.totalHRAmount,
        totalDirectorAmount: updated.totalDirectorAmount,
        originalAmount:      updated.originalAmount,
        variance:            updated.variance,
      },
    }).catch(() => { /* see submit() */ });

    return sanitise(updated);
  }

  adminReview(requisitionId: string, data: ReviewAccountabilityInput, reviewerId: string) {
    return this.review('ADMIN_REVIEWED', requisitionId, data, reviewerId);
  }

  hrReview(requisitionId: string, data: ReviewAccountabilityInput, reviewerId: string) {
    return this.review('HR_REVIEWED', requisitionId, data, reviewerId);
  }

  directorApprove(requisitionId: string, data: ReviewAccountabilityInput, reviewerId: string) {
    return this.review('DIRECTOR_APPROVED', requisitionId, data, reviewerId);
  }
}

export const accountabilityService = new AccountabilityService();
