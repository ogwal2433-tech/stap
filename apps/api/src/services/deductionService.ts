import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import type { CreateDeductionInput, CreateStaffDeductionInput, DeductionResponse, StaffDeductionResponse } from '@security360/shared';

// ── Helper ─────────────────────────────────────────────────────────────────────

function fmt(d: any): DeductionResponse {
  return {
    id:               d.id,
    guardId:          d.guardId,
    guardName:        d.guard ? `${d.guard.firstName} ${d.guard.lastName}` : '',
    type:             d.type,
    amount:           d.amount,
    description:      d.description,
    effectiveDate:    d.effectiveDate.toISOString(),
    status:           d.status,
    payrollRunId:     d.payrollRunId ?? null,
    appliedInPayroll: d.payrollRun
      ? { month: d.payrollRun.month, year: d.payrollRun.year }
      : null,
    createdBy:        d.createdBy,
    createdAt:        d.createdAt.toISOString(),
  };
}

// ── DeductionService ───────────────────────────────────────────────────────────

class DeductionService {
  async create(data: CreateDeductionInput, createdBy: string): Promise<DeductionResponse> {
    const guard = await prisma.guard.findUnique({ where: { id: data.guardId } });
    if (!guard) throw new NotFoundError('Guard not found');

    const deduction = await prisma.guardDeduction.create({
      data: {
        guardId:       data.guardId,
        type:          data.type,
        amount:        data.amount,
        description:   data.description,
        effectiveDate: new Date(data.effectiveDate),
        createdBy,
      },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'DEDUCTION_CREATED',
      entity:   'guardDeduction',
      entityId: deduction.id,
      newValue: { guardId: data.guardId, type: data.type, amount: data.amount },
    });

    return fmt(deduction);
  }

  async listByGuard(guardId: string): Promise<DeductionResponse[]> {
    const deductions = await prisma.guardDeduction.findMany({
      where:   { guardId },
      include: {
        guard:      true,
        payrollRun: { select: { month: true, year: true } },
      },
      orderBy: { effectiveDate: 'asc' },
    });
    return deductions.map(fmt);
  }

  async list(query: { guardId?: string; status?: string }): Promise<DeductionResponse[]> {
    const where: any = {};
    if (query.guardId) where.guardId = query.guardId;
    if (query.status)  where.status  = query.status;

    const deductions = await prisma.guardDeduction.findMany({
      where,
      include: {
        guard:      true,
        payrollRun: { select: { month: true, year: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return deductions.map(fmt);
  }

  async cancel(id: string, cancelledBy: string): Promise<DeductionResponse> {
    const deduction = await prisma.guardDeduction.findUnique({
      where:   { id },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
    });
    if (!deduction) throw new NotFoundError('Deduction not found');

    const updated = await prisma.guardDeduction.update({
      where:   { id },
      data:    { status: 'CANCELLED' },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
    });

    await QueueService.logAudit({
      userId:   cancelledBy,
      action:   'DEDUCTION_CANCELLED',
      entity:   'guardDeduction',
      entityId: id,
    });

    return fmt(updated);
  }

  async applyToPayroll(deductionIds: string[], payrollRunId: string): Promise<void> {
    await prisma.guardDeduction.updateMany({
      where: { id: { in: deductionIds } },
      data:  { status: 'APPLIED', payrollRunId },
    });
  }

  // -- Staff deductions (NSSF, PAYE, advances) ----------------------------------
  // Mirrors the guard flow above, keyed to User instead of Guard. Only staff
  // with a login account can carry deductions; GUARD and CLIENT roles are
  // refused so the two deduction ledgers never mix.
  async createStaff(data: CreateStaffDeductionInput, createdBy: string): Promise<StaffDeductionResponse> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user || user.role === 'GUARD' || user.role === 'CLIENT') throw new NotFoundError('Staff member not found');

    const deduction = await prisma.staffDeduction.create({
      data: {
        userId:        data.userId,
        type:          data.type,
        amount:        data.amount,
        description:   data.description,
        effectiveDate: new Date(data.effectiveDate),
        createdBy,
      },
      include: { user: true, payrollRun: { select: { month: true, year: true } } },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'STAFF_DEDUCTION_CREATED',
      entity:   'staffDeduction',
      entityId: deduction.id,
      newValue: { userId: data.userId, type: data.type, amount: data.amount },
    });

    return fmtStaff(deduction);
  }

  async listStaff(query: { userId?: string; status?: string }): Promise<StaffDeductionResponse[]> {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.status)  where.status  = query.status;

    const deductions = await prisma.staffDeduction.findMany({
      where,
      include: {
        user:       true,
        payrollRun: { select: { month: true, year: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return deductions.map(fmtStaff);
  }

  async cancelStaff(id: string, cancelledBy: string): Promise<StaffDeductionResponse> {
    const deduction = await prisma.staffDeduction.findUnique({
      where:   { id },
      include: { user: true, payrollRun: { select: { month: true, year: true } } },
    });
    if (!deduction) throw new NotFoundError('Staff deduction not found');

    const updated = await prisma.staffDeduction.update({
      where:   { id },
      data:    { status: 'CANCELLED' },
      include: { user: true, payrollRun: { select: { month: true, year: true } } },
    });

    await QueueService.logAudit({
      userId:   cancelledBy,
      action:   'STAFF_DEDUCTION_CANCELLED',
      entity:   'staffDeduction',
      entityId: id,
    });

    return fmtStaff(updated);
  }

  async applyStaffToPayroll(deductionIds: string[], payrollRunId: string): Promise<void> {
    await prisma.staffDeduction.updateMany({
      where: { id: { in: deductionIds } },
      data:  { status: 'APPLIED', payrollRunId },
    });
  }
}

function fmtStaff(d: any): StaffDeductionResponse {
  return {
    id:               d.id,
    userId:           d.userId,
    staffName:        d.user ? d.user.name : '',
    type:             d.type,
    amount:           d.amount,
    description:      d.description,
    effectiveDate:    d.effectiveDate.toISOString(),
    status:           d.status,
    payrollRunId:     d.payrollRunId ?? null,
    appliedInPayroll: d.payrollRun
      ? { month: d.payrollRun.month, year: d.payrollRun.year }
      : null,
    createdBy:        d.createdBy,
    createdAt:        d.createdAt.toISOString(),
  };
}

export const deductionService = new DeductionService();
