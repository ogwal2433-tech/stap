import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import type { CreateAllowanceInput, AllowanceResponse } from '@security360/shared';

function fmt(a: any): AllowanceResponse {
  return {
    id:               a.id,
    guardId:          a.guardId,
    guardName:        a.guard ? `${a.guard.firstName} ${a.guard.lastName}` : '',
    type:             a.type,
    amount:           a.amount,
    description:      a.description,
    effectiveDate:    a.effectiveDate.toISOString(),
    status:           a.status,
    payrollRunId:     a.payrollRunId ?? null,
    appliedInPayroll: a.payrollRun
      ? { month: a.payrollRun.month, year: a.payrollRun.year }
      : null,
    createdBy:        a.createdBy,
    createdAt:        a.createdAt.toISOString(),
  };
}

class AllowanceService {
  async create(data: CreateAllowanceInput, createdBy: string): Promise<AllowanceResponse> {
    const guard = await prisma.guard.findUnique({ where: { id: data.guardId } });
    if (!guard) throw new NotFoundError('Guard not found');

    const allowance = await prisma.guardAllowance.create({
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
      action:   'ALLOWANCE_CREATED',
      entity:   'guardAllowance',
      entityId: allowance.id,
      newValue: { guardId: data.guardId, type: data.type, amount: data.amount },
    });

    return fmt(allowance);
  }

  async listByGuard(guardId: string): Promise<AllowanceResponse[]> {
    const allowances = await prisma.guardAllowance.findMany({
      where:   { guardId },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
      orderBy: { effectiveDate: 'asc' },
    });
    return allowances.map(fmt);
  }

  async list(query: { guardId?: string; status?: string }): Promise<AllowanceResponse[]> {
    const where: any = {};
    if (query.guardId) where.guardId = query.guardId;
    if (query.status)  where.status  = query.status;

    const allowances = await prisma.guardAllowance.findMany({
      where,
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return allowances.map(fmt);
  }

  async cancel(id: string, cancelledBy: string): Promise<AllowanceResponse> {
    const allowance = await prisma.guardAllowance.findUnique({
      where:   { id },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
    });
    if (!allowance) throw new NotFoundError('Allowance not found');

    const updated = await prisma.guardAllowance.update({
      where:   { id },
      data:    { status: 'CANCELLED' },
      include: { guard: true, payrollRun: { select: { month: true, year: true } } },
    });

    await QueueService.logAudit({
      userId:   cancelledBy,
      action:   'ALLOWANCE_CANCELLED',
      entity:   'guardAllowance',
      entityId: id,
    });

    return fmt(updated);
  }

  async applyToPayroll(allowanceIds: string[], payrollRunId: string): Promise<void> {
    await prisma.guardAllowance.updateMany({
      where: { id: { in: allowanceIds } },
      data:  { status: 'APPLIED', payrollRunId },
    });
  }
}

export const allowanceService = new AllowanceService();

