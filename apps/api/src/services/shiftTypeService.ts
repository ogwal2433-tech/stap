import prisma from '../db/prisma';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import type { CreateShiftTypeInput, UpdateShiftTypeInput, ShiftTypeResponse } from '@stap/shared';

class ShiftTypeService {
  private format(s: {
    id: string; name: string; code: string; startTime: string | null;
    endTime: string | null; durationHours: number | null; displayOrder: number;
    isActive: boolean; isOvertime: boolean;
  }): ShiftTypeResponse {
    return {
      id:            s.id,
      name:          s.name,
      code:          s.code,
      startTime:     s.startTime,
      endTime:       s.endTime,
      durationHours: s.durationHours,
      displayOrder:  s.displayOrder,
      isActive:      s.isActive,
      isOvertime:    s.isOvertime,
    };
  }

  async listShiftTypes(activeOnly = true): Promise<ShiftTypeResponse[]> {
    const rows = await prisma.shiftTypeConfig.findMany({
      where:   activeOnly ? { isActive: true } : {},
      orderBy: { displayOrder: 'asc' },
    });
    return rows.map((r) => this.format(r));
  }

  async getUsageCount(id: string): Promise<number> {
    const shift = await prisma.shiftTypeConfig.findUnique({ where: { id } });
    if (!shift) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return prisma.deployment.count({
      where: {
        shiftType: shift.code as never,
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });
  }

  async createShiftType(data: CreateShiftTypeInput, createdBy: string): Promise<ShiftTypeResponse> {
    const code = data.code.toUpperCase();
    const dup = await prisma.shiftTypeConfig.findUnique({ where: { code } });
    if (dup) throw new AppError(`Shift type code "${code}" already exists`, 409);

    const shift = await prisma.shiftTypeConfig.create({
      data: { ...data, code },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'SHIFT_TYPE_CREATED',
      entity:   'shiftType',
      entityId: shift.id,
      newValue: { name: shift.name, code: shift.code },
    });

    return this.format(shift);
  }

  async updateShiftType(id: string, data: UpdateShiftTypeInput, updatedBy: string): Promise<ShiftTypeResponse> {
    const existing = await prisma.shiftTypeConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shift type not found');

    const updated = await prisma.shiftTypeConfig.update({ where: { id }, data });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'SHIFT_TYPE_UPDATED',
      entity:   'shiftType',
      entityId: id,
      oldValue: existing,
      newValue: data,
    });

    return this.format(updated);
  }

  async deactivateShiftType(id: string, deactivatedBy: string): Promise<ShiftTypeResponse> {
    const shift = await prisma.shiftTypeConfig.findUnique({ where: { id } });
    if (!shift) throw new NotFoundError('Shift type not found');

    const now = new Date();
    const futureCount = await prisma.deployment.count({
      where: { shiftType: shift.code as never, date: { gte: now } },
    });

    const updated = await prisma.shiftTypeConfig.update({
      where: { id },
      data:  { isActive: false },
    });

    await QueueService.logAudit({
      userId:   deactivatedBy,
      action:   'SHIFT_TYPE_DEACTIVATED',
      entity:   'shiftType',
      entityId: id,
      newValue: { futureDeploymentsAffected: futureCount },
    });

    return this.format(updated);
  }

  async activateShiftType(id: string, activatedBy: string): Promise<ShiftTypeResponse> {
    const shift = await prisma.shiftTypeConfig.findUnique({ where: { id } });
    if (!shift) throw new NotFoundError('Shift type not found');

    const updated = await prisma.shiftTypeConfig.update({
      where: { id },
      data:  { isActive: true },
    });

    await QueueService.logAudit({
      userId:   activatedBy,
      action:   'SHIFT_TYPE_ACTIVATED',
      entity:   'shiftType',
      entityId: id,
      newValue: { isActive: true },
    });

    return this.format(updated);
  }

  async deleteShiftType(id: string, deletedBy: string): Promise<void> {
    const shift = await prisma.shiftTypeConfig.findUnique({ where: { id } });
    if (!shift) throw new NotFoundError('Shift type not found');

    const usageCount = await prisma.deployment.count({
      where: { shiftType: shift.code as never },
    });

    if (usageCount > 0) {
      throw new AppError(
        `Cannot delete "${shift.name}" — used in ${usageCount} deployment(s). Deactivate instead.`,
        409,
      );
    }

    await prisma.shiftTypeConfig.delete({ where: { id } });

    await QueueService.logAudit({
      userId:   deletedBy,
      action:   'SHIFT_TYPE_DELETED',
      entity:   'shiftType',
      entityId: id,
      newValue: { name: shift.name, code: shift.code },
    });
  }

  async reorderShiftTypes(orderedIds: string[]): Promise<ShiftTypeResponse[]> {
    await Promise.all(
      orderedIds.map((id, i) =>
        prisma.shiftTypeConfig.update({ where: { id }, data: { displayOrder: i + 1 } }),
      ),
    );
    return this.listShiftTypes(false);
  }
}

export const shiftTypeService = new ShiftTypeService();
