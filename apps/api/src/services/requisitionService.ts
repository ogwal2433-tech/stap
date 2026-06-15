import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import type {
  CreateRequisitionInput,
  ApproveRequisitionInput,
  CreatePurchaseOrderInput,
  RequisitionResponse,
  PurchaseOrderResponse,
  PaginatedResponse,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRequisition(r: any): RequisitionResponse {
  return {
    id:                r.id,
    raisedBy:          r.raisedBy,
    raisedByName:      r.raisedByUser?.name ?? '',
    category:          r.category,
    categories:        r.categories ?? [],
    description:       r.description,
    particulars:       r.particulars ?? null,
    quantity:          r.quantity,
    estimatedUnitCost: r.estimatedUnitCost,
    estimatedTotal:    r.estimatedTotal,
    urgency:           r.urgency,
    justification:     r.justification,
    progress:          r.progress ?? null,
    remarks:           r.remarks ?? null,
    accountDetails:    r.accountDetails ?? null,
    accountName:       r.accountName ?? null,
    bankName:          r.bankName ?? null,
    assignedToId:      r.assignedToId ?? null,
    assignedToName:    r.assignedToUser?.name ?? null,
    hrApprovedAt:      r.hrApprovedAt?.toISOString() ?? null,
    hrApprovedBy:      r.hrApprovedBy ?? null,
    dirApprovedAt:     r.dirApprovedAt?.toISOString() ?? null,
    dirApprovedBy:     r.dirApprovedBy ?? null,
    status:            r.status,
    approvedBy:        r.approvedBy,
    approvedByName:    r.approvedByUser?.name ?? null,
    approvedAt:        r.approvedAt?.toISOString() ?? null,
    rejectedBy:        r.rejectedBy,
    rejectedAt:        r.rejectedAt?.toISOString() ?? null,
    rejectionReason:   r.rejectionReason,
    comments:          r.comments,
    createdAt:         r.createdAt.toISOString(),
    purchaseOrders:    (r.purchaseOrders ?? []).map(fmtPO),
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
  raisedByUser:    { select: { name: true } },
  assignedToUser:  { select: { name: true } },
  purchaseOrders:  { include: { supplier: true } },
} as const;

// ── RequisitionService ─────────────────────────────────────────────────────────

class RequisitionService {
  async create(data: CreateRequisitionInput, raisedBy: string): Promise<RequisitionResponse> {
    const estimatedTotal = data.quantity * data.estimatedUnitCost;

    const requisition = await prisma.requisition.create({
      data: {
        raisedBy,
        categories:        data.categories,
        category:          data.categories[0] ?? 'OTHER',
        description:       data.description,
        particulars:       data.particulars ?? null,
        quantity:          data.quantity,
        estimatedUnitCost: data.estimatedUnitCost,
        estimatedTotal,
        urgency:           data.urgency ?? 'NORMAL',
        justification:     data.justification ?? null,
        progress:          data.progress ?? null,
        remarks:           data.remarks ?? null,
        accountDetails:    data.accountDetails ?? null,
        accountName:       data.accountName ?? null,
        bankName:          data.bankName ?? null,
        status:            'SUBMITTED',
      },
      include: INCLUDE,
    });

    // Notify approvers (DIRECTOR + ASSISTANT_MANAGER)
    const approvers = await prisma.user.findMany({
      where: { role: { in: ['DIRECTOR', 'ASSISTANT_MANAGER'] }, status: 'ACTIVE' },
      select: { email: true },
    });
    for (const approver of approvers) {
      if (approver.email) {
        await QueueService.sendEmail({
          to:       approver.email,
          subject:  `New Requisition: ${data.categories.join(', ')}`,
          template: 'requisition-approval',
          data: {
            description:    data.description,
            estimatedTotal,
            urgency:        data.urgency ?? 'NORMAL',
            raisedByName:   '',
          },
        });
      }
    }

    await QueueService.logAudit({
      userId:   raisedBy,
      action:   'REQUISITION_SUBMITTED',
      entity:   'requisition',
      entityId: requisition.id,
      newValue: { categories: data.categories, estimatedTotal },
    });

    return fmtRequisition(requisition);
  }

  async approve(id: string, data: ApproveRequisitionInput, actionBy: string): Promise<RequisitionResponse> {
    const requisition = await prisma.requisition.findUnique({
      where:   { id },
      include: { ...INCLUDE, raisedByUser: { select: { email: true, name: true } } },
    });
    if (!requisition) throw new NotFoundError('Requisition not found');
    if (requisition.status !== 'SUBMITTED') {
      throw new AppError('Only SUBMITTED requisitions can be actioned', 400);
    }

    const now = new Date();
    const updateData: any = { comments: data.comments ?? null };

    if (data.action === 'APPROVE') {
      updateData.status     = 'APPROVED';
      updateData.approvedBy = actionBy;
      updateData.approvedAt = now;
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

    // Notify requester
    const requesterEmail = (requisition as any).raisedByUser?.email;
    if (requesterEmail) {
      await QueueService.sendEmail({
        to:       requesterEmail,
        subject:  `Requisition ${data.action === 'APPROVE' ? 'Approved' : 'Rejected'}`,
        template: data.action === 'APPROVE' ? 'requisition-approved' : 'requisition-rejected',
        data: {
          description:     requisition.description,
          rejectionReason: data.rejectionReason ?? '',
        },
      });
    }

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
    category?: string;
    raisedBy?: string;
    page: number;
    limit: number;
  }, viewerRole?: string, viewerId?: string): Promise<PaginatedResponse<RequisitionResponse>> {
    const { page, limit, status, category, raisedBy } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status)   where.status   = status;
    if (category) where.category = category;

    // Non-admin roles see only their own requisitions
    const adminRoles = ['DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'];
    if (viewerRole && !adminRoles.includes(viewerRole) && viewerId) {
      where.raisedBy = viewerId;
    } else if (raisedBy) {
      where.raisedBy = raisedBy;
    }

    const [reqs, total] = await Promise.all([
      prisma.requisition.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
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

  async createPurchaseOrder(data: CreatePurchaseOrderInput, createdBy: string): Promise<PurchaseOrderResponse> {
    const requisition = await prisma.requisition.findUnique({ where: { id: data.requisitionId } });
    if (!requisition) throw new NotFoundError('Requisition not found');
    if (requisition.status !== 'APPROVED') {
      throw new AppError('Requisition must be APPROVED before creating a purchase order', 400);
    }

    const totalCost = data.quantity * data.unitCost;

    const po = await prisma.purchaseOrder.create({
      data: {
        requisitionId:   data.requisitionId,
        supplierId:      data.supplierId ?? null,
        quantity:        data.quantity,
        unitCost:        data.unitCost,
        totalCost,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
        createdBy,
      },
      include: { supplier: true },
    });

    // TODO: Generate PO PDF similar to invoice PDF using Puppeteer
    // with PO number and supplier details

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
      prisma.requisition.count({ where: { status: 'SUBMITTED' } }),
      prisma.purchaseOrder.findMany({
        where: {
          status:           { not: 'CANCELLED' },
          expectedDelivery: { lt: now },
          createdAt:        { gte: new Date(year, month, 1) },
        },
      }),
      prisma.requisition.groupBy({
        by:     ['category'],
        where:  { status: 'APPROVED', createdAt: { gte: new Date(year, month, 1) } },
        _sum:   { estimatedTotal: true },
      }),
    ]);

    const totalSpendThisMonth = (
      await prisma.requisition.aggregate({
        where:  { status: 'APPROVED', createdAt: { gte: new Date(year, month, 1) } },
        _sum:   { estimatedTotal: true },
      })
    )._sum.estimatedTotal ?? 0;

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
