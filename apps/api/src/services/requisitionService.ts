import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { cashbookService } from './cashbookService';
import { NotFoundError, AppError } from '../errors/AppError';
import { canEditRequisition } from '@security360/shared';
import { dateRangeFilter } from '../lib/dateUtils';
import type {
  CreateRequisitionInput,
  UpdateRequisitionInput,
  ApproveRequisitionInput,
  RevokeRequisitionApprovalInput,
  AssignRequisitionInput,
  UpdateProgressInput,
  CreatePurchaseOrderInput,
  RequisitionResponse,
  CategoryItemResponse,
  PurchaseOrderResponse,
  PaginatedResponse,
} from '@security360/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCategoryItem(item: any): CategoryItemResponse {
  return {
    id:       item.id,
    category: item.category,
    quantity: item.quantity,
    unit:     item.unit ?? null,
  };
}

function fmtRequisition(r: any): RequisitionResponse {
  return {
    id:               r.id,
    date:             (r.date instanceof Date ? r.date : new Date(r.date)).toISOString(),
    particulars:      r.particulars ?? '',
    amount:           r.amount,
    categoryItems:    (r.categoryItems ?? []).map(fmtCategoryItem),
    requestedBy:      { id: r.requestedById, name: r.requestedByUser?.name ?? '' },
    hrApproved: {
      by: r.hrApprovedByUser
        ? { id: r.hrApprovedById, name: r.hrApprovedByUser.name }
        : null,
      at: r.hrApprovedAt?.toISOString() ?? null,
    },
    directorApproved: {
      by: r.directorApprovedByUser
        ? { id: r.directorApprovedById, name: r.directorApprovedByUser.name }
        : null,
      at: r.directorApprovedAt?.toISOString() ?? null,
    },
    assignedTo:       r.assignedToUser
      ? { id: r.assignedToId, name: r.assignedToUser.name, role: r.assignedToUser.role }
      : null,
    progress:         r.progress ?? null,
    remarks:          r.remarks ?? null,
    accountDetails:   r.accountDetails ?? null,
    accountName:      r.accountName ?? null,
    bankName:         r.bankName ?? null,
    status:           r.status,
    rejectedBy:       r.rejectedBy ?? null,
    rejectedAt:       r.rejectedAt?.toISOString() ?? null,
    rejectionReason:  r.rejectionReason ?? null,
    purchaseOrders:   (r.purchaseOrders ?? []).map(fmtPO),
    totalDispatched:  r.totalDispatched ?? 0,
    dispatchStatus:   r.dispatchStatus ?? 'PENDING',
    createdAt:        r.createdAt.toISOString(),
    updatedAt:        r.updatedAt.toISOString(),
  };
}

function fmtPO(po: any): PurchaseOrderResponse {
  return {
    id:               po.id,
    requisitionId:    po.requisitionId,
    supplierId:       po.supplierId,
    supplierName:     po.supplier?.name ?? null,
    quantity:         po.quantity,
    unitCost:         po.unitCost,
    totalCost:        po.totalCost,
    expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    status:           po.status,
    pdfPath:          po.pdfPath,
    createdBy:        po.createdBy,
    createdAt:        po.createdAt.toISOString(),
  };
}

const INCLUDE = {
  requestedByUser:        { select: { name: true } },
  hrApprovedByUser:       { select: { name: true } },
  directorApprovedByUser: { select: { name: true } },
  assignedToUser:         { select: { name: true, role: true } },
  categoryItems:          { orderBy: { createdAt: 'asc' as const } },
  purchaseOrders:         { include: { supplier: true } },
} as const;

// ── RequisitionService ─────────────────────────────────────────────────────────

class RequisitionService {
  async create(data: CreateRequisitionInput, requestedById: string): Promise<RequisitionResponse> {
    const { categoryItems, ...reqData } = data;

    const requisition = await prisma.requisition.create({
      data: {
        requestedById,
        date:           reqData.date ? new Date(reqData.date) : new Date(),
        particulars:    reqData.particulars,
        amount:         reqData.amount,
        category:       categoryItems[0]?.category ?? 'Other',
        description:    reqData.particulars,
        quantity:       1,
        estimatedUnitCost: reqData.amount,
        estimatedTotal:    reqData.amount,
        remarks:        reqData.remarks ?? null,
        accountDetails: reqData.accountDetails ?? null,
        accountName:    reqData.accountName ?? null,
        bankName:       reqData.bankName ?? null,
        status:         'PENDING',
        categoryItems:  {
          create: categoryItems.map((item) => ({
            category: item.category,
            quantity: item.quantity,
            unit:     item.unit ?? null,
          })),
        },
      },
      include: INCLUDE,
    });

    const approvers = await prisma.user.findMany({
      where:  { role: { in: ['DIRECTOR', 'ASSISTANT_MANAGER'] }, status: 'ACTIVE' },
      select: { email: true },
    });
    for (const approver of approvers) {
      if (approver.email) {
        await QueueService.sendEmail({
          to:       approver.email,
          subject:  `New Requisition: ${categoryItems.map((c) => c.category).join(', ')}`,
          template: 'requisition-approval',
          data: {
            description:    reqData.particulars,
            estimatedTotal: reqData.amount,
            urgency:        'NORMAL',
            raisedByName:   '',
          },
        });
      }
    }

    await QueueService.logAudit({
      userId:   requestedById,
      action:   'REQUISITION_SUBMITTED',
      entity:   'requisition',
      entityId: requisition.id,
      newValue: { categories: categoryItems.map((c) => c.category), amount: reqData.amount },
    });

    return fmtRequisition(requisition);
  }

  /**
   * Amend a requisition that has not yet been signed off.
   *
   * Editable means HR has not approved it yet — not merely that the status is
   * still PENDING, since `hrApprove` leaves the status alone.
   */
  async update(
    id: string,
    data: UpdateRequisitionInput,
    by: string,
    byRole: string,
  ): Promise<RequisitionResponse> {
    const requisition = await prisma.requisition.findUnique({ where: { id } });
    if (!requisition) throw new NotFoundError('Requisition not found');

    const isRequester = requisition.requestedById === by;
    const isApprover  = ['DIRECTOR', 'ASSISTANT_MANAGER'].includes(byRole);
    if (!isRequester && !isApprover) {
      throw new AppError('You can only edit your own requisitions.', 403);
    }

    if (!canEditRequisition(requisition.status, requisition.hrApprovedAt)) {
      throw new AppError(
        requisition.hrApprovedAt
          ? 'This requisition cannot be edited — HR has already approved it. ' +
            'Ask HR to reverse the approval if it needs to change.'
          : `This requisition cannot be edited. It is currently ` +
            `${requisition.status.replace(/_/g, ' ')}. Only requisitions awaiting ` +
            `HR approval can be edited.`,
        400,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Category items are replaced wholesale — the form submits the full set,
      // and matching them up line by line would gain nothing.
      if (data.categoryItems) {
        await tx.requisitionCategoryItem.deleteMany({ where: { requisitionId: id } });
      }

      return tx.requisition.update({
        where: { id },
        data: {
          ...(data.date           !== undefined ? { date: new Date(data.date) }        : {}),
          ...(data.particulars    !== undefined ? { particulars: data.particulars, description: data.particulars } : {}),
          ...(data.amount         !== undefined ? { amount: data.amount, estimatedUnitCost: data.amount, estimatedTotal: data.amount } : {}),
          ...(data.remarks        !== undefined ? { remarks: data.remarks ?? null }               : {}),
          ...(data.accountDetails !== undefined ? { accountDetails: data.accountDetails ?? null } : {}),
          ...(data.accountName    !== undefined ? { accountName: data.accountName ?? null }       : {}),
          ...(data.bankName       !== undefined ? { bankName: data.bankName ?? null }             : {}),
          ...(data.categoryItems
            ? {
                // `category` mirrors the first selection — the dashboard groups by it.
                category:      data.categoryItems[0]?.category ?? requisition.category,
                categoryItems: {
                  create: data.categoryItems.map((c) => ({
                    category: c.category,
                    quantity: c.quantity,
                    unit:     c.unit ?? null,
                  })),
                },
              }
            : {}),
        },
        include: INCLUDE,
      });
    });

    await QueueService.logAudit({
      userId:   by,
      action:   'REQUISITION_EDITED',
      entity:   'requisition',
      entityId: id,
      oldValue: {
        particulars: requisition.particulars,
        amount:      requisition.amount,
      },
      newValue: {
        fields:      Object.keys(data),
        particulars: updated.particulars,
        amount:      updated.amount,
      },
    });

    return fmtRequisition(updated);
  }

  async hrApprove(id: string, by: string): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');
    if (req.hrApprovedAt) throw new AppError('Already HR approved', 400);

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    { hrApprovedAt: new Date(), hrApprovedById: by },
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId: by, action: 'REQUISITION_HR_APPROVED', entity: 'requisition', entityId: id,
      newValue: { hrApprovedById: by },
    });

    // Harold approved: tell the Directors (and the MD) it is their turn.
    // Bell-only; nothing leaves the system.
    try {
      await notificationService.sendToRoles(['DIRECTOR', 'MD'], {
        type:       'REQUISITION_HR_APPROVED',
        channels:   ['inApp', 'email'],
        title:      `Requisition awaiting director approval`,
        message:    `Requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) passed HR review and needs director approval.`,
        entityType: 'requisition',
        entityId:   id,
      });
    } catch (err) { console.error('Requisition HR handoff bell failed', err); }

    return fmtRequisition(updated);
  }

  async directorApprove(id: string, by: string): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');
    if (!req.hrApprovedAt) throw new AppError('HR must approve before Director', 400);
    if (req.directorApprovedAt) throw new AppError('Already Director approved', 400);

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    { directorApprovedAt: new Date(), directorApprovedById: by, status: 'APPROVED' },
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId: by, action: 'REQUISITION_DIRECTOR_APPROVED', entity: 'requisition', entityId: id,
      newValue: { status: 'APPROVED' },
    });

    // Micheal approved: tell the requester their requisition is approved.
    try {
      await notificationService.send({
        userId:     updated.requestedById,
        type:       'REQUISITION_DIRECTOR_APPROVED',
        channels:   ['inApp', 'email'],
        title:      `Requisition approved`,
        message:    `Your requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) was approved and moves to assignment.`,
        entityType: 'requisition',
        entityId:   id,
      });
    } catch (err) { console.error('Requisition approval bell failed', err); }

    const mdActor = await prisma.user.findUnique({ where: { id: by }, select: { role: true } });
    if (mdActor?.role === 'MD') {
      await this.notifyWatchers(by, 'REQUISITION_DIRECTOR_APPROVED',
        `MD approved requisition`,
        `The MD finally approved requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) - it moves to assignment.`,
        id);
    }

    return fmtRequisition(updated);
  }

  /**
   * Undo the approval on a requisition that was approved but for which no money
   * has yet been dispatched, sending it all the way back to a fresh PENDING.
   *
   * The window is deliberately narrow. It only opens while `status` is APPROVED
   * and `totalDispatched` is zero: dispatch runs on its own axis, so once any
   * amount has gone out, pulling the approval would strand a payment against a
   * requisition no longer approved. Assignment also moves the status off APPROVED,
   * so a requisition still in this window was never handed to anyone either.
   *
   * Both sign-offs are cleared — HR and Director — so the requisition returns to
   * the requester to amend and resubmit through the full chain, rather than
   * parking halfway at "awaiting Director". The audit trail already recorded the
   * original approvals, so nothing is lost by resetting the working state.
   */
  async revokeApproval(
    id: string,
    data: RevokeRequisitionApprovalInput,
    by: string,
  ): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');
    if (req.status !== 'APPROVED') {
      throw new AppError('Only an approved requisition can have its approval revoked.', 400);
    }
    if ((req.totalDispatched ?? 0) > 0) {
      throw new AppError(
        'Approval cannot be revoked — funds have already been dispatched against this requisition.',
        400,
      );
    }

    const updated = await prisma.requisition.update({
      where: { id },
      data: {
        status:               'PENDING',
        directorApprovedAt:   null,
        directorApprovedById: null,
        hrApprovedAt:         null,
        hrApprovedById:       null,
      },
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId:   by,
      action:   'REQUISITION_APPROVAL_REVOKED',
      entity:   'requisition',
      entityId: id,
      oldValue: { status: 'APPROVED' },
      newValue: { status: 'PENDING', reason: data.reason ?? null },
    });

    // Approval pulled back: the requester learns it is pending again.
    // Bell + email; nothing leaves the system except the mailbox copy.
    try {
      await notificationService.send({
        userId:     updated.requestedById,
        type:       'REQUISITION_APPROVAL_REVOKED',
        title:      `Requisition approval revoked`,
        message:    `The approval on your requisition was revoked - it is pending review again.`,
        entityType: 'requisition',
        entityId:   id,
        channels:   ['inApp', 'email'],
      });
    } catch (err) { console.error('Requisition revoke bell failed', err); }

    return fmtRequisition(updated);
  }

  async assign(id: string, data: AssignRequisitionInput, by: string): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');
    if (req.status !== 'APPROVED') throw new AppError('Requisition must be APPROVED before assigning', 400);

    const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
    if (!assignee) throw new NotFoundError('Assignee not found');

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    { assignedToId: data.assignedToId, status: 'ASSIGNED' },
      include: INCLUDE,
    });

    // The moment money is handed out: post it to the cashbook, keyed to the
    // requisition so re-assigning or the dispatch flow can never count it
    // twice. Dated at the raised date — that is the month the spend belongs
    // to, matching how the Income & Expenses report buckets requisitions.
    // Only the *undispatched* remainder posts here: a payout made while the
    // requisition was still APPROVED already wrote its own FUND_DISPATCH row,
    // and the full approved amount must not land on the ledger twice.
    const alreadyDispatched = updated.totalDispatched ?? 0;
    const remainingToPost   = updated.amount - alreadyDispatched;
    if (remainingToPost > 0) {
      await cashbookService.recordAuto({
        sourceRef:   `REQ:${id}`,
        date:        updated.date,
        description: `Requisition handed out - ${updated.particulars}`,
        category:    'REQUISITION',
        amount:      remainingToPost,
        type:        'OUT',
        recordedBy:  by,
      });
    }

    // Assignee learns there is work waiting; requester sees who holds it.
    // Bell-only; nothing leaves the system.
    try {
      await notificationService.send({
        userId:     data.assignedToId,
        type:       'REQUISITION_ASSIGNED',
        channels:   ['inApp', 'email'],
        title:      `Requisition assigned to you`,
        message:    `Requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) was assigned to you for fulfilment.`,
        entityType: 'requisition',
        entityId:   id,
      });
      await notificationService.send({
        userId:     updated.requestedById,
        type:       'REQUISITION_ASSIGNED',
        channels:   ['inApp', 'email'],
        title:      `Requisition assigned`,
        message:    `Your requisition ${updated.particulars} was assigned to ${assignee.name} for fulfilment.`,
        entityType: 'requisition',
        entityId:   id,
      });
    } catch (err) { console.error('Requisition assignment bell failed', err); }

    await QueueService.logAudit({
      userId: by, action: 'REQUISITION_ASSIGNED', entity: 'requisition', entityId: id,
      newValue: { assignedToId: data.assignedToId },
    });

    return fmtRequisition(updated);
  }

  async updateProgress(id: string, data: UpdateProgressInput, by: string): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    { progress: data.progress, status: 'IN_PROGRESS' },
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId: by, action: 'REQUISITION_PROGRESS_UPDATED', entity: 'requisition', entityId: id,
      newValue: { progress: data.progress },
    });

    return fmtRequisition(updated);
  }

  /**
   * Close out a requisition whose work (and spending) is done. The step that
   * was missing: the 41 live rows sat in ASSIGNED forever because nothing in
   * the app could flip them — approvers can now finish one in one click.
   */
  async complete(id: string, by: string): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Requisition not found');
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(req.status)) {
      throw new AppError(
        `Only assigned or in-progress requisitions can be completed — this one is ` +
        `${req.status.replace(/_/g, ' ')}.`,
        400,
      );
    }

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    { status: 'COMPLETED' },
      include: INCLUDE,
    });

    // The requester learns their requisition is closed; best-effort like the
    // assignment bell — the status change itself never fails on a missed ping.
    try {
      await notificationService.send({
        userId:     updated.requestedById,
        type:       'REQUISITION_COMPLETED',
        channels:   ['inApp', 'email'],
        title:      'Requisition completed',
        message:    `Requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) has been completed.`,
        entityType: 'requisition',
        entityId:   id,
      });
    } catch (err) { console.error('Requisition completion bell failed', err); }

    await QueueService.logAudit({
      userId: by, action: 'REQUISITION_COMPLETED', entity: 'requisition', entityId: id,
      oldValue: { status: req.status },
      newValue: { status: 'COMPLETED' },
    });

    return fmtRequisition(updated);
  }

  /**
   * MD decisions reflect to every oversight eye (HR, Directors, MD) except
   * the actor, who already knows what they just did. Bell + email, best
   * effort - a failed ping never undoes the decision itself.
   */
  private async notifyWatchers(
    exceptUserId: string,
    type: string,
    title: string,
    message: string,
    entityId: string,
  ): Promise<void> {
    try {
      const watchers = await prisma.user.findMany({
        where:  { role: { in: ['HR', 'DIRECTOR', 'MD'] }, id: { not: exceptUserId } },
        select: { id: true },
      });
      await Promise.all(watchers.map((u) =>
        notificationService.send({
          userId: u.id, type, title, message,
          entityType: 'requisition', entityId,
          channels: ['inApp', 'email'],
        }).catch((err) => console.error('Requisition watcher bell failed', err)),
      ));
    } catch (err) { console.error('Requisition watcher bell failed', err); }
  }

  async approve(id: string, data: ApproveRequisitionInput, actionBy: string): Promise<RequisitionResponse> {
    const requisition = await prisma.requisition.findUnique({ where: { id }, include: INCLUDE });
    if (!requisition) throw new NotFoundError('Requisition not found');
    if (!['PENDING', 'SUBMITTED'].includes(requisition.status)) {
      throw new AppError('Only PENDING requisitions can be actioned', 400);
    }

    // The MD decides finally and standalone: reject only through this legacy
    // path (approval itself lives on director-approve), and only once HR has
    // spoken - the two-stage order holds for everyone.
    const actor = await prisma.user.findUnique({ where: { id: actionBy }, select: { role: true } });
    if (actor?.role === 'MD') {
      if (data.action !== 'REJECT') {
        throw new AppError('The MD approves through final approval, not here.', 403);
      }
      if (!requisition.hrApprovedAt) {
        throw new AppError('HR must approve before the MD can reject.', 400);
      }
    }

    const now = new Date();
    const updateData: any = { comments: data.comments ?? null };

    if (data.action === 'APPROVE') {
      updateData.status               = 'APPROVED';
      updateData.directorApprovedAt   = now;
      updateData.directorApprovedById = actionBy;
    } else {
      updateData.status          = 'REJECTED';
      updateData.rejectedBy      = actionBy;
      updateData.rejectedAt      = now;
      updateData.rejectionReason = data.rejectionReason!;
    }

    const updated = await prisma.requisition.update({
      where:   { id },
      data:    updateData,
      include: INCLUDE,
    });

    await QueueService.logAudit({
      userId:   actionBy,
      action:   data.action === 'APPROVE' ? 'REQUISITION_APPROVED' : 'REQUISITION_REJECTED',
      entity:   'requisition',
      entityId: id,
      newValue: { status: updateData.status },
    });

    // Same bell treatment as the two-stage path: the requester learns the
    // outcome either way, with the reason attached on a rejection.
    try {
      if (data.action === 'APPROVE') {
        await notificationService.send({
          userId:     updated.requestedById,
          type:       'REQUISITION_APPROVED',
        channels:   ['inApp', 'email'],
          title:      `Requisition approved`,
          message:    `Your requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) was approved and moves to assignment.`,
          entityType: 'requisition',
          entityId:   id,
        });
      } else {
        await notificationService.send({
          userId:     updated.requestedById,
          type:       'REQUISITION_REJECTED',
        channels:   ['inApp', 'email'],
          title:      `Requisition rejected`,
          message:    `Your requisition ${updated.particulars} was rejected${updated.rejectionReason ? `: ${updated.rejectionReason}` : '.'}`,
          entityType: 'requisition',
          entityId:   id,
        });
      }
    } catch (err) { console.error('Requisition outcome bell failed', err); }

    if (actor?.role === 'MD' && data.action === 'REJECT') {
      await this.notifyWatchers(actionBy, 'REQUISITION_REJECTED',
        `MD rejected requisition`,
        `The MD rejected requisition ${updated.particulars}${updated.rejectionReason ? `: ${updated.rejectionReason}` : '.'}`,
        id);
    }

    return fmtRequisition(updated);
  }

  /**
   * The Prisma `where` both the paginated list and the PDF export run on, so a
   * printed page answers exactly the question the table is under rather than a
   * subtly different one.
   */
  private filterWhere(
    query: { status?: string; requestedById?: string; from?: string; to?: string; overdue?: string },
    viewerRole?: string,
    viewerId?: string,
  ): any {
    const { status, requestedById, from, to, overdue } = query;
    const where: any = {};
    if (status) {
      // One status, or a comma list — the KPI tiles link to "approved at any
      // stage" (APPROVED,ASSIGNED,IN_PROGRESS,COMPLETED), which no single
      // status can express.
      const list = status.split(',').map((s) => s.trim()).filter(Boolean);
      where.status = list.length > 1 ? { in: list } : list[0];
    }
    if (overdue === 'true') {
      // Has a purchase order past its expected delivery, same rule the
      // dashboard's overdue count uses.
      where.purchaseOrders = {
        some: { status: { not: 'CANCELLED' }, expectedDelivery: { lt: new Date() } },
      };
    }
    if (from || to) {
      // The requisition's own date (the column shown in the table), not the
      // moment it was submitted. A picker's `to` means the whole of that day,
      // which is what the third argument asks for.
      const range = dateRangeFilter(from, to, true);
      if (range) where.date = range;
    }

    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR', 'MD'];
    if (viewerRole && !adminRoles.includes(viewerRole) && viewerId) {
      // Everyone else is scoped to their own submissions, whatever they ask for.
      where.requestedById = viewerId;
    } else if (requestedById) {
      where.requestedById = requestedById;
    }
    return where;
  }

  async list(query: {
    status?: string;
    /** Narrow to requisitions raised by this user; honoured only for admin roles. */
    requestedById?: string;
    /** Requisition `date` range, inclusive at both ends. */
    from?: string;
    to?: string;
    /** 'true' narrows to requisitions with a non-cancelled PO past its expected delivery. */
    overdue?: string;
    page: number;
    limit: number;
  }, viewerRole?: string, viewerId?: string): Promise<PaginatedResponse<RequisitionResponse>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.filterWhere(query, viewerRole, viewerId);

    const [reqs, total] = await Promise.all([
      prisma.requisition.findMany({
        where,
        include: INCLUDE,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.requisition.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: reqs.map(fmtRequisition),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  /**
   * Every requisition under the filters, unpaginated — the rows a printed export
   * must carry. Scoping matches {@link list}, so the PDF matches the table.
   */
  async listForExport(
    query: { status?: string; requestedById?: string; from?: string; to?: string; overdue?: string },
    viewerRole?: string,
    viewerId?: string,
  ): Promise<RequisitionResponse[]> {
    const reqs = await prisma.requisition.findMany({
      where:    this.filterWhere(query, viewerRole, viewerId),
      include:  INCLUDE,
      orderBy:  { date: 'desc' },
    });
    return reqs.map(fmtRequisition);
  }

  /**
   * A single requisition for printing, held to the same ownership rule as the
   * list: an admin may print any one, everyone else only their own. A record
   * outside the caller's reach reads as not-found rather than leaking it exists.
   */
  async getForPrint(
    id: string,
    viewerRole?: string,
    viewerId?: string,
  ): Promise<RequisitionResponse> {
    const req = await prisma.requisition.findUnique({ where: { id }, include: INCLUDE });
    if (!req) throw new NotFoundError('Requisition not found');

    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR', 'MD'];
    const isPrivileged = viewerRole && adminRoles.includes(viewerRole);
    if (!isPrivileged && req.requestedById !== viewerId) {
      throw new NotFoundError('Requisition not found');
    }
    return fmtRequisition(req);
  }

  async createPurchaseOrder(
    data: CreatePurchaseOrderInput & { requisitionId: string },
    createdBy: string,
  ): Promise<PurchaseOrderResponse> {
    const requisition = await prisma.requisition.findUnique({ where: { id: data.requisitionId } });
    if (!requisition) throw new NotFoundError('Requisition not found');
    if (requisition.status !== 'APPROVED') {
      throw new AppError('Requisition must be APPROVED before creating a purchase order', 400);
    }

    const totalCost = data.quantity * data.unitCost;

    const po = await prisma.purchaseOrder.create({
      data: {
        requisitionId:    data.requisitionId,
        supplierId:       data.supplierId ?? null,
        quantity:         data.quantity,
        unitCost:         data.unitCost,
        totalCost,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
        createdBy,
      },
      include: { supplier: true },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'PURCHASE_ORDER_CREATED',
      entity:   'purchaseOrder',
      entityId: po.id,
      newValue: { requisitionId: data.requisitionId, totalCost },
    });

    return fmtPO(po);
  }

  /**
   * The requisitions KPIs. Optional from/to dates narrow every figure to
   * requisitions raised in that window — the page's filter panel drives them,
   * so the tiles reflect whatever period the approver is looking at. Without
   * dates, all-time.
   */
  async getDashboard(dateFrom?: string, dateTo?: string) {
    const now = new Date();
    // Raised-date window, matching how the list filters and the Income &
    // Expenses report bucket requisitions. dateTo is inclusive to midnight.
    const dateWindow: any = {};
    if (dateFrom) dateWindow.gte = new Date(dateFrom);
    if (dateTo)   dateWindow.lte = new Date(`${dateTo}T23:59:59.999`);
    const dateFilter = dateFrom || dateTo ? { date: dateWindow } : {};
    // The money handed out for execution: past approval, assigned to a person,
    // whether still in their hands or already finished. The MD's "where has the
    // money gone" figure.
    const OUT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];

    const [pendingApprovals, pos, totalAgg, outAgg] = await Promise.all([
      prisma.requisition.count({ where: { status: { in: ['PENDING', 'SUBMITTED'] } } }),
      prisma.purchaseOrder.findMany({
        where: {
          status:           { not: 'CANCELLED' },
          expectedDelivery: { lt: now },
          createdAt:        { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
      }),
      // Total requisitions — every row in the window, whatever its status.
      // One honest number instead of an "approved-only" subtotal that
      // disappears rows the moment they move on.
      prisma.requisition.aggregate({
        where: dateFilter,
        _sum:  { amount: true },
        _count: true,
      }),
      prisma.requisition.aggregate({
        where: { ...dateFilter, status: { in: OUT_STATUSES } },
        _sum:  { amount: true },
        _count: true,
      }),
    ]);

    return {
      pendingApprovals,
      totalRequisitions:      totalAgg._sum.amount ?? 0,
      requisitionsCount:      totalAgg._count,
      totalAssignedCompleted: outAgg._sum.amount ?? 0,
      assignedCompletedCount: outAgg._count,
      overdueDeliveries:      pos.length,
    };
  }
}

export const requisitionService = new RequisitionService();
