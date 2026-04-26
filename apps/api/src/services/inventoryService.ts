import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  IssueItemInput,
  ReturnItemInput,
  StockAdjustmentInput,
  InventoryItemResponse,
  InventoryTransactionResponse,
  GuardInventoryItem,
  PaginatedResponse,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtItem(item: any, issuedCount = 0): InventoryItemResponse {
  return {
    id:               item.id,
    itemCode:         item.itemCode,
    itemName:         item.itemName,
    itemType:         item.itemType,
    unitCost:         item.unitCost,
    stockQuantity:    item.stockQuantity,
    reorderThreshold: item.reorderThreshold,
    description:      item.description ?? null,
    isLowStock:       item.stockQuantity <= item.reorderThreshold,
    isActive:         item.isActive,
    issuedFree:       item.issuedFree ?? false,
    isShoeItem:       item.isShoeItem ?? false,
    issuedCount,
    createdAt:        item.createdAt.toISOString(),
  };
}

function fmtTxn(t: any): InventoryTransactionResponse {
  return {
    id:            t.id,
    item:          { id: t.item.id, itemName: t.item.itemName, itemCode: t.item.itemCode },
    guard:         t.guard ? { id: t.guard.id, fullName: `${t.guard.firstName} ${t.guard.lastName}` } : null,
    action:        t.action,
    quantity:      t.quantity,
    conditionNote: t.conditionNote ?? null,
    chargedAmount: t.chargedAmount ?? null,
    reference:     t.reference ?? null,
    recordedBy:    { id: t.recordedByUser.id, name: t.recordedByUser.name },
    createdAt:     t.createdAt.toISOString(),
  };
}

const TXN_INCLUDE = {
  item:          { select: { id: true, itemName: true, itemCode: true } },
  guard:         { select: { id: true, firstName: true, lastName: true } },
  recordedByUser: { select: { id: true, name: true } },
};

// ── InventoryService ───────────────────────────────────────────────────────────

class InventoryService {
  private async generateItemCode(): Promise<string> {
    const count = await prisma.inventoryItem.count();
    return `STAP-INV-${String(count + 1).padStart(4, '0')}`;
  }

  async createItem(data: CreateInventoryItemInput, createdBy: string): Promise<InventoryItemResponse> {
    const itemCode = await this.generateItemCode();

    const item = await prisma.inventoryItem.create({
      data: {
        itemName:         data.itemName,
        itemCode,
        itemType:         data.itemType,
        unitCost:         data.unitCost,
        stockQuantity:    data.stockQuantity ?? 0,
        reorderThreshold: data.reorderThreshold ?? 5,
        description:      data.description,
      },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'INVENTORY_ITEM_CREATED',
      entity:   'InventoryItem',
      entityId: item.id,
      newValue: { itemCode, itemName: item.itemName },
    });

    return fmtItem(item);
  }

  async updateItem(id: string, data: UpdateInventoryItemInput, updatedBy: string): Promise<InventoryItemResponse> {
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Inventory item not found');

    const item = await prisma.inventoryItem.update({ where: { id }, data });
    return fmtItem(item);
  }

  async getById(id: string): Promise<InventoryItemResponse> {
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Inventory item not found');
    const issuedCount = await prisma.inventoryTransaction.count({
      where: { itemId: id, action: 'ISSUED' },
    });
    return fmtItem(item, issuedCount);
  }

  async list(query: {
    itemType?: string;
    isLowStock?: boolean;
    isActive?: boolean;
    search?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<InventoryItemResponse>> {
    const { itemType, isActive, page, limit, search } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (itemType)            where.itemType = itemType;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { itemName: { contains: search, mode: 'insensitive' } },
        { itemCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.inventoryItem.count({ where }),
    ]);

    // For isLowStock filter, do it in memory (Prisma can't compare two columns)
    const filtered = query.isLowStock
      ? items.filter((i) => i.stockQuantity <= i.reorderThreshold)
      : items;

    const issuedCounts = await Promise.all(
      filtered.map((item) =>
        prisma.inventoryTransaction.count({ where: { itemId: item.id, action: 'ISSUED' } }),
      ),
    );

    const totalPages = Math.ceil(total / limit);
    return {
      data: filtered.map((item, idx) => fmtItem(item, issuedCounts[idx])),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async issueItem(data: IssueItemInput, recordedBy: string): Promise<InventoryTransactionResponse> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new NotFoundError('Inventory item not found');
    if (item.stockQuantity < data.quantity) {
      throw new AppError(`Insufficient stock. Available: ${item.stockQuantity}`, 400);
    }

    const conditionNote = data.conditionNote ?? ((item as any).issuedFree ? 'Issued free of charge' : null);

    const txn = await prisma.$transaction(async (tx) => {
      const t = await tx.inventoryTransaction.create({
        data: {
          itemId:       data.itemId,
          guardId:      data.guardId,
          action:       'ISSUED',
          quantity:     data.quantity,
          conditionNote,
          recordedBy,
        },
        include: TXN_INCLUDE,
      });
      await tx.inventoryItem.update({
        where: { id: data.itemId },
        data:  { stockQuantity: { decrement: data.quantity } },
      });
      return t;
    });

    await QueueService.logAudit({
      userId:   recordedBy,
      action:   'ITEM_ISSUED',
      entity:   'InventoryTransaction',
      entityId: txn.id,
      newValue: { itemId: data.itemId, guardId: data.guardId, quantity: data.quantity },
    });

    return fmtTxn(txn);
  }

  async returnItem(data: ReturnItemInput, recordedBy: string): Promise<InventoryTransactionResponse> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new NotFoundError('Inventory item not found');

    // Verify guard was issued this item
    const issuedTotal = await prisma.inventoryTransaction.aggregate({
      where:  { itemId: data.itemId, guardId: data.guardId, action: 'ISSUED' },
      _sum:   { quantity: true },
    });
    const returnedTotal = await prisma.inventoryTransaction.aggregate({
      where:  { itemId: data.itemId, guardId: data.guardId, action: { in: ['RETURNED', 'LOST', 'DAMAGED'] } },
      _sum:   { quantity: true },
    });

    const outstanding = (issuedTotal._sum.quantity ?? 0) - (returnedTotal._sum.quantity ?? 0);
    if (outstanding <= 0) {
      throw new AppError('No matching issued record for this guard and item', 400);
    }
    if (data.quantity > outstanding) {
      throw new AppError(`Cannot return more than outstanding (${outstanding})`, 400);
    }

    const guard = await prisma.guard.findUnique({
      where:  { id: data.guardId },
      select: { id: true, firstName: true, lastName: true },
    });

    const txn = await prisma.$transaction(async (tx) => {
      const chargedAmount =
        data.action !== 'RETURNED' ? item.unitCost * data.quantity : null;

      const t = await tx.inventoryTransaction.create({
        data: {
          itemId:       data.itemId,
          guardId:      data.guardId,
          action:       data.action,
          quantity:     data.quantity,
          conditionNote: data.conditionNote,
          chargedAmount,
          recordedBy,
        },
        include: TXN_INCLUDE,
      });

      if (data.action === 'RETURNED') {
        await tx.inventoryItem.update({
          where: { id: data.itemId },
          data:  { stockQuantity: { increment: data.quantity } },
        });
      } else {
        // LOST or DAMAGED — create deduction
        await tx.guardDeduction.create({
          data: {
            guardId:       data.guardId,
            type:          'DAMAGE_LOSS',
            amount:        chargedAmount!,
            description:   `${data.action}: ${item.itemName} x${data.quantity}${data.conditionNote ? ` — ${data.conditionNote}` : ''}`,
            effectiveDate: new Date(),
            createdBy:     recordedBy,
          },
        });
      }

      return t;
    });

    if (data.action !== 'RETURNED' && guard) {
      const amount = item.unitCost * data.quantity;
      await notificationService.sendToRole({
        role:    'ASSISTANT_MANAGER',
        type:    'SYSTEM',
        title:   'Inventory Deduction Created',
        message: `Guard ${guard.firstName} ${guard.lastName} — ${data.action} item: ${item.itemName}. Deduction of UGX ${amount.toLocaleString()} created.`,
      });
    }

    await QueueService.logAudit({
      userId:   recordedBy,
      action:   `ITEM_${data.action}`,
      entity:   'InventoryTransaction',
      entityId: txn.id,
    });

    return fmtTxn(txn);
  }

  async adjustStock(data: StockAdjustmentInput, recordedBy: string): Promise<InventoryTransactionResponse> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new NotFoundError('Inventory item not found');

    const newQty = item.stockQuantity + data.quantity;
    if (newQty < 0) {
      throw new AppError(`Adjustment would result in negative stock (current: ${item.stockQuantity})`, 400);
    }

    const action = data.quantity >= 0 ? 'STOCK_IN' : 'STOCK_ADJUSTMENT';

    const txn = await prisma.$transaction(async (tx) => {
      const t = await tx.inventoryTransaction.create({
        data: {
          itemId:    data.itemId,
          action,
          quantity:  Math.abs(data.quantity),
          reference: data.reference,
          conditionNote: data.note,
          recordedBy,
        },
        include: TXN_INCLUDE,
      });
      await tx.inventoryItem.update({
        where: { id: data.itemId },
        data:  { stockQuantity: newQty },
      });
      return t;
    });

    return fmtTxn(txn);
  }

  async getTransactions(query: {
    itemId?: string;
    guardId?: string;
    action?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<InventoryTransactionResponse>> {
    const { itemId, guardId, action, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (itemId)  where.itemId  = itemId;
    if (guardId) where.guardId = guardId;
    if (action)  where.action  = action;

    const [data, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: TXN_INCLUDE,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtTxn),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getGuardInventory(guardId: string): Promise<GuardInventoryItem[]> {
    const issued = await prisma.inventoryTransaction.groupBy({
      by:    ['itemId'],
      where: { guardId, action: 'ISSUED' },
      _sum:  { quantity: true },
    });

    const returned = await prisma.inventoryTransaction.groupBy({
      by:    ['itemId'],
      where: { guardId, action: { in: ['RETURNED', 'LOST', 'DAMAGED'] } },
      _sum:  { quantity: true },
    });

    const returnedMap = new Map(returned.map((r) => [r.itemId, r._sum.quantity ?? 0]));

    const results: GuardInventoryItem[] = [];

    for (const row of issued) {
      const issuedQty = row._sum.quantity ?? 0;
      const returnedQty = returnedMap.get(row.itemId) ?? 0;
      const outstanding = issuedQty - returnedQty;
      if (outstanding > 0) {
        const item = await prisma.inventoryItem.findUnique({
          where:  { id: row.itemId },
          select: { id: true, itemName: true, itemCode: true, itemType: true },
        });
        if (item) {
          results.push({ item, issued: issuedQty, returned: returnedQty, outstanding });
        }
      }
    }

    return results;
  }

  async checkLowStock(): Promise<InventoryItemResponse[]> {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
    });
    return items
      .filter((i) => i.stockQuantity <= i.reorderThreshold)
      .map((i) => fmtItem(i));
  }

  async runLowStockCheck(): Promise<void> {
    const lowStockItems = await this.checkLowStock();
    for (const item of lowStockItems) {
      await notificationService.sendToRoles(['DIRECTOR', 'ADMINISTRATOR'], {
        type:    'SYSTEM',
        title:   'Low Stock Alert',
        message: `${item.itemName} (${item.itemCode}) is below reorder threshold. Current stock: ${item.stockQuantity}, Threshold: ${item.reorderThreshold}`,
      });
    }
  }

  async issueFullUniformSet(
    guardId: string,
    issuedBy: string,
  ): Promise<InventoryTransactionResponse[]> {
    const uniformItems = await prisma.inventoryItem.findMany({
      where: { itemType: 'UNIFORM', isActive: true },
    });

    const results: InventoryTransactionResponse[] = [];

    for (const item of uniformItems) {
      // Idempotent: skip if guard already has an issued record for this item
      const alreadyIssued = await prisma.inventoryTransaction.count({
        where: { itemId: item.id, guardId, action: 'ISSUED' },
      });
      if (alreadyIssued > 0) continue;

      if (item.stockQuantity < 1) continue;

      const txn = await prisma.$transaction(async (tx) => {
        const t = await tx.inventoryTransaction.create({
          data: {
            itemId:        item.id,
            guardId,
            action:        'ISSUED',
            quantity:       1,
            conditionNote: (item as any).issuedFree ? 'Issued free of charge' : 'Issued on joining',
            recordedBy:    issuedBy,
          },
          include: TXN_INCLUDE,
        });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data:  { stockQuantity: { decrement: 1 } },
        });
        return t;
      });

      results.push(fmtTxn(txn));
    }

    return results;
  }
}

export const inventoryService = new InventoryService();
