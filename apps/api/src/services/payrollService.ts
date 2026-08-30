import { PAID_STATUSES } from '@stap/shared';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { deductionService } from './deductionService';
import * as xcel from '../lib/xcel';
import * as xcelPartner from '../lib/xcelPartner';
import { errorLogger } from './errorLogger';
import type {
  PayrollRunResponse,
  PayslipResponse,
  PayrollSummary,
  PaginatedResponse,
} from '@stap/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL_WORKING_DAYS = 26; // Mon-Sat average

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
    hrApprovedBy:    r.hrApprovedBy ?? null,
    hrApprovedAt:    r.hrApprovedAt?.toISOString() ?? null,
    hrNotes:         r.hrNotes ?? null,
    disbursedBy:     r.disbursedBy ?? null,
    disbursedAt:     r.disbursedAt?.toISOString() ?? null,
    successCount:    r.successCount ?? 0,
    failedCount:     r.failedCount ?? 0,
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
    disbursementFailureReason: p.disbursementFailureReason ?? null,
    hrFlagged:           p.hrFlagged ?? false,
    hrFlagReason:        p.hrFlagReason ?? null,
    hrAdjustedAmount:    p.hrAdjustedAmount ?? null,
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

    // Guards on leave stay on the payroll — they are still employed. Suspended,
    // resigned and terminated guards are excluded.
    const guards = await prisma.guard.findMany({
      where: { employmentStatus: { in: PAID_STATUSES } },
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
        deductionId:   d.id,
        type:          d.type,
        amount:        d.amount,
        description:   d.description,
        effectiveDate: d.effectiveDate.toISOString(),
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

  // ── HR: flag or unflag an individual guard's payslip ────────────────────────

  async flagPayslip(data: {
    payslipId:      string;
    flagReason:     string;
    adjustedAmount?: number;
  }): Promise<PayslipResponse> {
    const payslip = await prisma.payslip.update({
      where: { id: data.payslipId },
      data: {
        hrFlagged:        true,
        hrFlagReason:     data.flagReason,
        hrAdjustedAmount: data.adjustedAmount ?? null,
      },
      include: { guard: true },
    });
    return fmtPayslip(payslip);
  }

  async unflagPayslip(payslipId: string): Promise<PayslipResponse> {
    const payslip = await prisma.payslip.update({
      where: { id: payslipId },
      data:  { hrFlagged: false, hrFlagReason: null, hrAdjustedAmount: null },
      include: { guard: true },
    });
    return fmtPayslip(payslip);
  }

  // ── HR: approve the full run — required before Finance can disburse ────────

  async hrApprove(payrollRunId: string, reviewedBy: string, notes?: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } } },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'APPROVED') {
      throw new AppError(
        `Run is ${run.status} — only APPROVED runs can be reviewed by HR. It must first be financially approved.`,
        400,
      );
    }

    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'HR_APPROVED', hrApprovedBy: reviewedBy, hrApprovedAt: new Date(), hrNotes: notes ?? null },
      include: { _count: { select: { payslips: true } } },
    });

    await QueueService.logAudit({
      userId:   reviewedBy,
      action:   'PAYROLL_HR_APPROVED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      newValue: { notes: notes ?? null },
    });

    return fmtRun(updated);
  }

  // ── Finance: disburse an HR-approved run via XCEL mobile money ──────────────

  async disburse(payrollRunId: string, disbursedBy: string): Promise<void> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'HR_APPROVED') {
      throw new AppError(
        `This run is ${run.status}. Only HR_APPROVED runs can be disbursed — HR must approve the run before Finance can pay.`,
        400,
      );
    }

    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'DISBURSING', disbursedBy, disbursedAt: new Date() },
    });

    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId, disbursementStatus: 'PENDING' },
      include: { guard: true },
    });

    const period = `${run.year}-${String(run.month).padStart(2, '0')}`;
    let successCount = 0;
    let failedCount  = 0;

    for (const payslip of payslips) {
      // A guard flagged by HR without an adjusted amount is excluded from this run
      if (payslip.hrFlagged && !payslip.hrAdjustedAmount) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            disbursementStatus:        'FAILED',
            disbursementFailureReason: 'Skipped — flagged by HR for exclusion',
          },
        });
        failedCount++;
        continue;
      }

      const payAmount = payslip.hrAdjustedAmount ?? payslip.netSalary;

      try {
        const phone = xcel.normalisePhone(payslip.guard.preferredPaymentContact ?? payslip.guard.phone);
          // The guard's own setting wins. Detection reads the prefix and throws
          // on a range it does not know, which would fail an otherwise valid number.
          const network = payslip.guard.mobileNetwork || xcel.detectNetwork(phone);

        const dlCode = await xcelPartner.generateDynamicLinkOtp({
          amount:     payAmount,
          bankCode:   network,
          accountNum: phone,
        });

        const reference = xcel.generateDisbursementRef(payslip.guardId, period);

        const result = await xcelPartner.initiateBankPayment({
          amount:      payAmount,
          reference,
          dlCode,
          bankCode:    network,
          accountNum:  phone,
          // What the wallet is registered as, which need not be the legal name.
            accountName: payslip.guard.momoAccountName
              || `${payslip.guard.firstName} ${payslip.guard.lastName}`,
          description: `STAP Security - Salary ${run.month}/${run.year}`,
          receiverFirstName: payslip.guard.firstName,
          receiverLastName:  payslip.guard.lastName,
        });

        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            xcelDlCode:         dlCode,
            disbursementRef:    result.data.reference,
            disbursementStatus: 'SENT',
          },
        });
        successCount++;
      } catch (err: any) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            disbursementStatus:        'FAILED',
            disbursementFailureReason: err?.message ?? 'XCEL API error',
          },
        });
        await errorLogger.log({
          message:   err?.message ?? 'XCEL disbursement error',
          stack:     err?.stack,
          severity:  'ERROR',
          category:  'PAYMENT',
          errorCode: 'XCEL_API_ERROR',
          context:   { payrollRunId, payslipId: payslip.id, guardId: payslip.guardId, amount: payAmount },
        });
        failedCount++;
      }

      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }

    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'DISBURSED', successCount, failedCount },
    });

    await QueueService.logAudit({
      userId:   disbursedBy,
      action:   'PAYROLL_DISBURSED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      newValue: { successCount, failedCount },
    });
  }

  // ── XCEL webhook: disbursement status updates ───────────────────────────────

  async handleDisbursementWebhook(payload: Record<string, any>): Promise<void> {
    const reference: string | undefined =
      payload.reference ?? payload.data?.reference ?? payload.clientReference ?? payload.data?.clientReference;
    if (!reference) return;

    const payslip = await prisma.payslip.findFirst({ where: { disbursementRef: reference } });
    if (!payslip || payslip.disbursementStatus !== 'SENT') return;

    const rawStatus = (
      payload.status ?? payload.data?.status ?? payload.description ?? payload.data?.description ?? ''
    ).toString().toUpperCase();

    const ourStatus =
      rawStatus === 'SUCCESS' || rawStatus === 'SUCCESSFUL' ? 'SUCCESS'
      : rawStatus === 'FAILED' || rawStatus === 'CANCELLED'  ? 'FAILED'
      : null; // still pending/unknown — leave as SENT

    if (!ourStatus) return;

    await prisma.payslip.update({
      where: { id: payslip.id },
      data: {
        disbursementStatus:        ourStatus,
        disbursementFailureReason: payload.reason ?? payload.data?.reason ?? payload.status_reason ?? undefined,
        webhookReceivedAt:         new Date(),
        webhookPayload:            payload,
      },
    });

    const siblings = await prisma.payslip.findMany({ where: { payrollRunId: payslip.payrollRunId } });
    await prisma.payrollRun.update({
      where: { id: payslip.payrollRunId },
      data: {
        successCount: siblings.filter((p) => p.disbursementStatus === 'SUCCESS').length,
        failedCount:  siblings.filter((p) => p.disbursementStatus === 'FAILED').length,
      },
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
