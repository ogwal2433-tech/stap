import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { deductionService } from './deductionService';
import { yoPayments } from '../lib/yoPayments';
import type {
  PayrollRunResponse,
  PayslipResponse,
  PayrollSummary,
  PaginatedResponse,
} from '@stap/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL_WORKING_DAYS = 26; // Mon–Sat average

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRun(r: any): PayrollRunResponse {
  return {
    id:              r.id,
    month:           r.month,
    year:            r.year,
    totalGuards:     r.totalGuards,
    totalGross:      r.totalGross,
    totalDeductions: r.totalDeductions,
    totalNet:        r.totalNet,
    status:          r.status,
    approvedBy:      r.approvedBy,
    approvedAt:      r.approvedAt?.toISOString() ?? null,
    createdBy:       r.createdBy,
    createdAt:       r.createdAt.toISOString(),
    payslipCount:    r._count?.payslips ?? r.payslips?.length ?? 0,
  };
}

function fmtPayslip(p: any): PayslipResponse {
  return {
    id:                  p.id,
    guardId:             p.guardId,
    guardName:           p.guard ? `${p.guard.firstName} ${p.guard.lastName}` : '',
    payrollRunId:        p.payrollRunId,
    grossSalary:         p.grossSalary,
    deductionsBreakdown: p.deductionsBreakdown as PayslipResponse['deductionsBreakdown'],
    totalDeductions:     p.totalDeductions,
    netSalary:           p.netSalary,
    daysWorked:          p.daysWorked,
    totalDays:           p.totalDays,
    payslipPdfPath:      p.payslipPdfPath,
    disbursementStatus:  p.disbursementStatus,
    disbursementRef:     p.disbursementRef,
    createdAt:           p.createdAt.toISOString(),
  };
}

// ── PayrollService ─────────────────────────────────────────────────────────────

class PayrollService {
  async calculateRun(month: number, year: number, calculatedBy: string): Promise<PayrollSummary> {
    // Prevent duplicate runs
    const existing = await prisma.payrollRun.findFirst({
      where: { month, year, status: { in: ['DRAFT', 'APPROVED', 'DISBURSED'] } },
    });
    if (existing) throw new AppError('Payroll already run for this period', 409);

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);

    const guards = await prisma.guard.findMany({
      where: { employmentStatus: 'ACTIVE' },
    });

    let totalGross      = 0;
    let totalDeductions = 0;
    const payslipData: any[] = [];

    for (const guard of guards) {
      // Count working days (PRESENT + LATE attendance records)
      const daysWorked = await prisma.attendanceRecord.count({
        where: {
          guardId: guard.id,
          status:  { in: ['PRESENT', 'LATE'] },
          date:    { gte: periodStart, lte: periodEnd },
        },
      });

      const totalDays = TOTAL_WORKING_DAYS;

      // Pro-rata gross salary
      const gross = daysWorked >= totalDays
        ? guard.salaryRate
        : Math.round((guard.salaryRate / totalDays) * daysWorked);

      // Pending deductions effective this period
      const pendingDeductions = await prisma.guardDeduction.findMany({
        where: {
          guardId:       guard.id,
          status:        'PENDING',
          effectiveDate: { lte: periodEnd },
        },
      });

      const deductionBreakdown = pendingDeductions.map((d) => ({
        type:        d.type,
        amount:      d.amount,
        description: d.description,
      }));

      const totalDed = pendingDeductions.reduce((s, d) => s + d.amount, 0);
      const net      = Math.max(0, gross - totalDed);

      totalGross      += gross;
      totalDeductions += totalDed;

      payslipData.push({
        guard,
        grossSalary:         gross,
        deductionsBreakdown: deductionBreakdown,
        totalDeductions:     totalDed,
        netSalary:           net,
        daysWorked,
        totalDays,
        pendingDeductionIds: pendingDeductions.map((d) => d.id),
      });
    }

    // Create the payroll run
    const run = await prisma.payrollRun.create({
      data: {
        month,
        year,
        totalGuards:     guards.length,
        totalGross,
        totalDeductions,
        totalNet:        totalGross - totalDeductions,
        createdBy:       calculatedBy,
      },
    });

    // Create payslips and apply deductions
    const payslips: any[] = [];
    for (const p of payslipData) {
      const payslip = await prisma.payslip.create({
        data: {
          guardId:             p.guard.id,
          payrollRunId:        run.id,
          grossSalary:         p.grossSalary,
          deductionsBreakdown: p.deductionsBreakdown,
          totalDeductions:     p.totalDeductions,
          netSalary:           p.netSalary,
          daysWorked:          p.daysWorked,
          totalDays:           p.totalDays,
        },
        include: { guard: true },
      });

      if (p.pendingDeductionIds.length > 0) {
        await deductionService.applyToPayroll(p.pendingDeductionIds, run.id);
      }

      payslips.push(payslip);
    }

    return {
      month,
      year,
      totalGuards:     guards.length,
      totalGross,
      totalDeductions,
      totalNet:        totalGross - totalDeductions,
      byGuard:         payslips.map(fmtPayslip),
    };
  }

  async approve(payrollRunId: string, approvedBy: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } } },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError('Only DRAFT payrolls can be approved', 400);

    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'APPROVED', approvedBy, approvedAt: new Date() },
      include: { _count: { select: { payslips: true } } },
    });

    // Queue payslip PDF generation for each guard
    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId },
      include: { guard: true },
    });

    for (const payslip of payslips) {
      await QueueService.generatePayslip({
        guardId:     payslip.guardId,
        payrollRunId,
        periodStart: new Date(run.year, run.month - 1, 1).toISOString(),
        periodEnd:   new Date(run.year, run.month, 0).toISOString(),
      });
    }

    await QueueService.logAudit({
      userId:   approvedBy,
      action:   'PAYROLL_APPROVED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      newValue: { status: 'APPROVED' },
    });

    return fmtRun(updated);
  }

  async disburse(payrollRunId: string, disbursedBy: string): Promise<void> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'APPROVED') throw new AppError('Only APPROVED payrolls can be disbursed', 400);

    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId, disbursementStatus: 'PENDING' },
      include: { guard: true },
    });

    const prefix = process.env.YO_INTERNAL_REFERENCE_PREFIX ?? 'STAP';
    for (const payslip of payslips) {
      try {
        const resp = await yoPayments.requestPayment({
          amount:            payslip.netSalary,
          msisdn:            payslip.guard.phone,
          narrative:         `STAP Salary ${run.month}/${run.year} — ${payslip.guard.firstName} ${payslip.guard.lastName}`,
          internalReference: `${prefix}-SAL-${payslip.id}`,
        });

        await prisma.payslip.update({
          where: { id: payslip.id },
          data:  { disbursementStatus: 'SENT', disbursementRef: resp.transactionRef },
        });
      } catch {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data:  { disbursementStatus: 'FAILED' },
        });
      }
    }

    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'DISBURSED' },
    });

    await QueueService.logAudit({
      userId:   disbursedBy,
      action:   'PAYROLL_DISBURSED',
      entity:   'payrollRun',
      entityId: payrollRunId,
    });
  }

  async getRunHistory(query: { page: number; limit: number }): Promise<PaginatedResponse<PayrollRunResponse>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take: limit,
        include: { _count: { select: { payslips: true } } },
      }),
      prisma.payrollRun.count(),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: runs.map(fmtRun),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getRunDetail(runId: string): Promise<PayrollRunResponse & { payslips: PayslipResponse[] }> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: runId },
      include: { payslips: { include: { guard: true } }, _count: { select: { payslips: true } } },
    });
    if (!run) throw new NotFoundError('Payroll run not found');

    return { ...fmtRun(run), payslips: run.payslips.map(fmtPayslip) };
  }

  async getPayslipsByRun(runId: string): Promise<PayslipResponse[]> {
    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId: runId },
      include: { guard: true },
    });
    return payslips.map(fmtPayslip);
  }

  async getPayslip(id: string): Promise<PayslipResponse> {
    const payslip = await prisma.payslip.findUnique({
      where:   { id },
      include: { guard: true },
    });
    if (!payslip) throw new NotFoundError('Payslip not found');
    return fmtPayslip(payslip);
  }
}

export const payrollService = new PayrollService();
