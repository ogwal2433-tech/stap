import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import type { CreateDeductionInput, DeductionResponse } from '@stap/shared';

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
}

export const deductionService = new DeductionService();
