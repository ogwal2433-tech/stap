import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import type {
  CreateRequisitionInput,
  ApproveRequisitionInput,
  AssignRequisitionInput,
  UpdateProgressInput,
  CreatePurchaseOrderInput,
  RequisitionResponse,
  CategoryItemResponse,
  PurchaseOrderResponse,
  PaginatedResponse,
} from '@stap/shared';

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
      ? { id: r.assignedToId, name: r.assignedToUser.name }
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
  assignedToUser:         { select: { name: true } },
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

  async list(query: {
    status?: string;
    page: number;
    limit: number;
  }, viewerRole?: string, viewerId?: string): Promise<PaginatedResponse<RequisitionResponse>> {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;

    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'];
    if (viewerRole && !adminRoles.includes(viewerRole) && viewerId) {
      where.requestedById = viewerId;
    }

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
