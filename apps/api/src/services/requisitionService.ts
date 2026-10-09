import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
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
        title:      `Requisition approved`,
        message:    `Your requisition ${updated.particulars} (UGX ${updated.amount.toLocaleString()}) was approved and moves to assignment.`,
        entityType: 'requisition',
        entityId:   id,
      });
    } catch (err) { console.error('Requisition approval bell failed', err); }

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

  async approve(id: string, data: ApproveRequisitionInput, actionBy: string): Promise<RequisitionResponse> {
    const requisition = await prisma.requisition.findUnique({ where: { id }, include: INCLUDE });
    if (!requisition) throw new NotFoundError('Requisition not found');
    if (!['PENDING', 'SUBMITTED'].includes(requisition.status)) {
      throw new AppError('Only PENDING requisitions can be actioned', 400);
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

    return fmtRequisition(updated);
  }

  /**
   * The Prisma `where` both the paginated list and the PDF export run on, so a
   * printed page answers exactly the question the table is under rather than a
   * subtly different one.
   */
  private filterWhere(
    query: { status?: string; requestedById?: string; from?: string; to?: string },
    viewerRole?: string,
    viewerId?: string,
  ): any {
    const { status, requestedById, from, to } = query;
    const where: any = {};
    if (status) where.status = status;
    if (from || to) {
      // The requisition's own date (the column shown in the table), not the
      // moment it was submitted. A picker's `to` means the whole of that day,
      // which is what the third argument asks for.
      const range = dateRangeFilter(from, to, true);
      if (range) where.date = range;
    }

    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'];
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
    query: { status?: string; requestedById?: string; from?: string; to?: string },
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

    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'];
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

  async getDashboard() {
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    const [pendingApprovals, pos, spendByCategory] = await Promise.all([
      prisma.requisition.count({ where: { status: { in: ['PENDING', 'SUBMITTED'] } } }),
      prisma.purchaseOrder.findMany({
        where: {
          status:           { not: 'CANCELLED' },
          expectedDelivery: { lt: now },
          createdAt:        { gte: new Date(year, month, 1) },
        },
      }),
      prisma.requisition.groupBy({
        by:    ['category'],
        where: { status: 'APPROVED', createdAt: { gte: new Date(year, month, 1) } },
        _sum:  { estimatedTotal: true },
      }),
    ]);

    const totalSpendThisMonth = (
      await prisma.requisition.aggregate({
        where: { status: 'APPROVED', createdAt: { gte: new Date(year, month, 1) } },
        _sum:  { amount: true },
      })
    )._sum.amount ?? 0;

    return {
      pendingApprovals,
      totalSpendThisMonth,
      overdueDeliveries: pos.length,
      spendByCategory:   spendByCategory.map((g) => ({
        category: g.category,
        total:    g._sum.estimatedTotal ?? 0,
      })),
    };
  }
}

export const requisitionService = new RequisitionService();
