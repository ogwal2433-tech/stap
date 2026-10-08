import { PAID_STATUSES, ROLES } from '@security360/shared';
import { companyProfile } from './integrationSettings';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError, ForbiddenError } from '../errors/AppError';
import { deductionService } from './deductionService';
import * as xcel from '../lib/xcel';
import * as xcelPartner from '../lib/xcelPartner';
import { errorLogger } from './errorLogger';
import type {
  PayrollRunResponse,
  PayslipResponse,
  PayrollSummary,
  PaginatedResponse,
  ZonePayrollRoster,
  ZonePayrollRosterResponse,
  ZonePayrollSite,
  ZonePayrollGuard,
} from '@security360/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL_WORKING_DAYS = 26; // Mon-Sat average

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRun(r: any): PayrollRunResponse {
  return {
    id:              r.id,
    month:           r.month,
    year:            r.year,
    // Legacy company-wide and grouped runs have no zone — the UI labels them.
    zoneId:          r.zoneId ?? null,
    zoneName:        r.zone?.name ?? null,
    totalGuards:     r.totalGuards,
    totalGross:      r.totalGross,
    totalDeductions: r.totalDeductions,
    totalNet:        r.totalNet,
    status:          r.status,
    approvedBy:      r.approvedBy,
    approvedAt:      r.approvedAt?.toISOString() ?? null,
    rejectedBy:      r.rejectedBy ?? null,
    rejectedAt:      r.rejectedAt?.toISOString() ?? null,
    rejectReason:    r.rejectReason ?? null,
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

// ── Zone attribution ───────────────────────────────────────────────────────────
//
// The zone a guard belongs to for a period is decided by the deployment rows:
// the zone holding most of their deployment days that month, ties broken by
// zone name. One guard maps to exactly one zone, so no guard can be paid from
// two zone runs for the same period. Guards deployed only to sites outside
// every ACTIVE zone land in unZonedGuardIds — no run can claim them.

interface ZoneAttribution {
  zones:            Array<{ id: string; name: string }>;
  zoneById:         Map<string, { id: string; name: string }>;
  paidGuards:       Map<string, any>;
  attribution:      Map<string, string>;                 // guardId -> zoneId
  daysBySite:       Map<string, Map<string, number>>;    // guardId -> siteId -> days
  siteById:         Map<string, { siteId: string; siteName: string; zoneId: string }>;
  unZonedGuardIds:  Set<string>;
}

async function buildZoneAttribution(periodStart: Date, periodEnd: Date): Promise<ZoneAttribution> {
  const [zones, guards, deployments] = await Promise.all([
    prisma.zone.findMany({
      where:   { isActive: true },
      orderBy: { name: 'asc' },
      select:  { id: true, name: true },
    }),
    prisma.guard.findMany({ where: { employmentStatus: { in: PAID_STATUSES } } }),
    prisma.deployment.findMany({
      where: {
        date: { gte: periodStart, lte: periodEnd },
        site: { deletedAt: null },
      },
      select: {
        guardId: true,
        siteId:  true,
        site:    { select: { id: true, siteName: true, zoneId: true } },
      },
    }),
  ]);

  const zoneById   = new Map(zones.map((z) => [z.id, z]));
  const paidGuards = new Map(guards.map((g) => [g.id, g]));

  const attr: ZoneAttribution = {
    zones: zones.map((z) => ({ id: z.id, name: z.name })),
    zoneById,
    paidGuards,
    attribution:     new Map(),
    daysBySite:      new Map(),
    siteById:        new Map(),
    unZonedGuardIds: new Set(),
  };

  // @@unique([guardId, date]) means deployment rows are already one per guard
  // per day, so counting rows is counting days.
  const daysByZone = new Map<string, Map<string, number>>();
  const unZonedDays = new Map<string, number>();

  for (const d of deployments) {
    if (!paidGuards.has(d.guardId) || !d.site) continue;

    const zoneId = d.site.zoneId && zoneById.has(d.site.zoneId) ? d.site.zoneId : null;
    if (zoneId && !attr.siteById.has(d.siteId)) {
      attr.siteById.set(d.siteId, { siteId: d.site.id, siteName: d.site.siteName, zoneId });
    }

    const bySite = attr.daysBySite.get(d.guardId) ?? new Map<string, number>();
    bySite.set(d.siteId, (bySite.get(d.siteId) ?? 0) + 1);
    attr.daysBySite.set(d.guardId, bySite);

    if (zoneId) {
      const byZone = daysByZone.get(d.guardId) ?? new Map<string, number>();
      byZone.set(zoneId, (byZone.get(zoneId) ?? 0) + 1);
      daysByZone.set(d.guardId, byZone);
    } else {
      unZonedDays.set(d.guardId, (unZonedDays.get(d.guardId) ?? 0) + 1);
    }
  }

  for (const [guardId, byZone] of daysByZone) {
    let bestZoneId = '';
    let bestDays   = -1;
    let bestName   = '';
    for (const [zid, days] of byZone) {
      const name = zoneById.get(zid)!.name;
      if (days > bestDays || (days === bestDays && name < bestName)) {
        bestZoneId = zid; bestDays = days; bestName = name;
      }
    }
    attr.attribution.set(guardId, bestZoneId);
  }
  for (const guardId of unZonedDays.keys()) {
    if (!daysByZone.has(guardId)) attr.unZonedGuardIds.add(guardId);
  }
  return attr;
}

// ── PayrollService ─────────────────────────────────────────────────────────────

class PayrollService {
  async calculateRun(
    month: number,
    year: number,
    zoneId: string,
    calculatedBy: string,
    guardIds: string[],
  ): Promise<PayrollSummary> {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundError('Zone not found');
    if (!zone.isActive) {
      throw new AppError(`Zone "${zone.name}" is not active — payroll runs only for active zones.`, 400);
    }

    // One run per zone and period. Legacy history holds several runs for the
    // same month/year, so this stays a code-level check, not a unique index.
    const existing = await prisma.payrollRun.findFirst({
      where: { month, year, zoneId, status: { in: ['DRAFT', 'APPROVED', 'HR_APPROVED', 'DISBURSING', 'DISBURSED'] } },
    });
    if (existing) {
      throw new AppError(`Payroll has already been run for ${zone.name} in this period`, 409);
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);

    // Attribution is recomputed here rather than trusted from the screen: even
    // if two zone tabs raced, one guard cannot end up in two runs for the
    // same period.
    const attr = await buildZoneAttribution(periodStart, periodEnd);
    const selected = [...new Set(guardIds)];
    const notInZone = selected.filter((id) => attr.attribution.get(id) !== zoneId);
    if (notInZone.length > 0) {
      const names = notInZone.map((id) => {
        const g     = attr.paidGuards.get(id);
        const who   = g ? `${g.firstName} ${g.lastName}` : id;
        const other = attr.attribution.get(id);
        return other ? `${who} (paid under ${attr.zoneById.get(other)?.name ?? 'another zone'})` : who;
      }).join(', ');
      throw new AppError(
        `Not on this zone's payroll for the period: ${names}. Each guard is paid from the zone with most of their deployment days.`,
        400,
      );
    }

    const guards = selected.map((id) => attr.paidGuards.get(id)!);
    if (guards.length === 0) {
      throw new AppError(`There are no guards to pay in ${zone.name} for this period.`, 400);
    }

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
        zoneId,
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
      zoneId,
      zoneName:        zone.name,
      totalGuards:     guards.length,
      totalGross,
      totalDeductions,
      totalNet:        totalGross - totalDeductions,
      byGuard:         payslips.map(fmtPayslip),
    };
  }

  // ── Zone payroll roster — the tick-list behind the Payroll tab ────────────────

  async getZonePayrollRoster(month: number, year: number): Promise<ZonePayrollRosterResponse> {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);
    const attr = await buildZoneAttribution(periodStart, periodEnd);

    // Attendance shown next to each guard counts all sites — the same basis as
    // the pro-rata salary, so the tick-list previews what will actually be paid.
    const attendanceGroups = await prisma.attendanceRecord.groupBy({
      by:     ['guardId'],
      where:  { status: { in: ['PRESENT', 'LATE'] }, date: { gte: periodStart, lte: periodEnd } },
      _count: { _all: true },
    });
    const attendanceDays = new Map<string, number>(
      attendanceGroups.map((g: any) => [g.guardId, g._count._all] as [string, number]),
    );

    // One row per (zone, guard): the guard sits under the zone's site where
    // they had most days, so nobody appears twice in the same zone's list.
    const placement = new Map<string, Map<string, { siteId: string; siteName: string; days: number }>>();
    for (const [guardId, bySite] of attr.daysBySite) {
      for (const [siteId, days] of bySite) {
        const site = attr.siteById.get(siteId);
        if (!site) continue; // site is not inside an active zone
        const zoneMap = placement.get(site.zoneId) ?? new Map();
        const current = zoneMap.get(guardId);
        if (!current || days > current.days || (days === current.days && site.siteName < current.siteName)) {
          zoneMap.set(guardId, { siteId, siteName: site.siteName, days });
        }
        placement.set(site.zoneId, zoneMap);
      }
    }

    const zoneRosters: ZonePayrollRoster[] = attr.zones.map((zone) => {
      const guardsBySite = new Map<string, ZonePayrollGuard[]>();
      let assignedCount      = 0;
      let alsoElsewhereCount = 0;

      for (const [guardId, place] of (placement.get(zone.id) ?? new Map<string, { siteId: string; siteName: string; days: number }>())) {
        const g        = attr.paidGuards.get(guardId)!;
        const assigned = attr.attribution.get(guardId) === zone.id;
        if (assigned) assignedCount++; else alsoElsewhereCount++;
        const otherZoneId = attr.attribution.get(guardId);
        const row: ZonePayrollGuard = {
          guardId,
          name:             `${g.firstName} ${g.lastName}`,
          systemId:         g.systemId ?? null,
          employmentStatus: g.employmentStatus,
          salaryRate:       g.salaryRate,
          deploymentDays:   place.days,
          attendanceDays:   attendanceDays.get(guardId) ?? 0,
          assignedHere:     assigned,
          assignedZoneName: assigned ? null : (otherZoneId ? (attr.zoneById.get(otherZoneId)?.name ?? null) : null),
        };
        const list = guardsBySite.get(place.siteId) ?? [];
        list.push(row);
        guardsBySite.set(place.siteId, list);
      }

      const sites: ZonePayrollSite[] = [...guardsBySite.entries()]
        .map(([siteId, guards]) => ({
          siteId,
          siteName: attr.siteById.get(siteId)!.siteName,
          // Guards that will be paid from this run come first, then by name —
          // the established picker convention.
          guards: guards
            .sort((a, b) => a.name.localeCompare(b.name))
            .sort((a, b) => Number(b.assignedHere) - Number(a.assignedHere)),
        }))
        .sort((a, b) => a.siteName.localeCompare(b.siteName));

      return { zoneId: zone.id, zoneName: zone.name, sites, assignedCount, alsoElsewhereCount };
    });

    return { month, year, zones: zoneRosters, unZonedGuardCount: attr.unZonedGuardIds.size };
  }

  async approve(payrollRunId: string, approvedBy: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } }, zone: true },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError('Only DRAFT payrolls can be approved', 400);

    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'APPROVED', approvedBy, approvedAt: new Date() },
      include: { _count: { select: { payslips: true } }, zone: true },
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

  // ── Delete a DRAFT run — the regeneration path ───────────────────────────

  async remove(payrollRunId: string, deletedBy: string): Promise<void> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'DRAFT') {
      throw new AppError(
        `This run is ${run.status} — only DRAFT payrolls can be deleted. Once approved, the figures are signed off.`,
        400,
      );
    }

    // Nothing was paid on a draft, so the rows it consumed are rewound rather
    // than kept: deductions go back to PENDING (a regenerated run re-applies
    // them) and the materialised payslips go with the run. Both are Restrict
    // FKs, so the order below is what lets the delete through.
    await prisma.$transaction(async (tx) => {
      await tx.guardDeduction.updateMany({
        where: { payrollRunId },
        data:  { status: 'PENDING', payrollRunId: null },
      });
      await tx.payslip.deleteMany({ where: { payrollRunId } });
      await tx.payrollRun.delete({ where: { id: payrollRunId } });
    });

    await QueueService.logAudit({
      userId:   deletedBy,
      action:   'PAYROLL_RUN_DELETED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      oldValue: {
        month:          run.month,
        year:           run.year,
        zoneId:         run.zoneId,
        status:         run.status,
        totalGuards:    run.totalGuards,
        totalNet:       run.totalNet,
      },
    });
  }

  // ── Reject a run — send it back before any money moves ──────────────────
  //
  // Two windows: a DRAFT can be rejected by whoever may calculate or delete
  // one; an APPROVED run only by DIRECTOR — the role that stamped it. After
  // HR_APPROVED the run is Finance's to disburse and rejection is gone; use
  // flags or the HR note instead.

  async reject(payrollRunId: string, rejectedBy: string, reason: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } }, zone: true },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'DRAFT' && run.status !== 'APPROVED') {
      throw new AppError(
        `This run is ${run.status} — only DRAFT or APPROVED payrolls can be rejected. Once HR has approved it, the run belongs to the disbursement queue.`,
        400,
      );
    }

    // The route admits DIRECTOR and ASSISTANT_MANAGER; the APPROVED window
    // narrows to the role that granted the approval.
    const actor = await prisma.user.findUnique({ where: { id: rejectedBy }, select: { role: true } });
    if (run.status === 'APPROVED' && actor?.role !== ROLES.DIRECTOR) {
      throw new ForbiddenError('Only the Director can reject a financially approved payroll run.');
    }

    // Same rewind as deleting a draft: nothing was paid, so the figures and
    // deductions the run consumed are released. The run row itself stays with
    // the rejection stamp as the trail, and because REJECTED is not one of
    // the live statuses the zone/period opens up for recalculation.
    await prisma.$transaction(async (tx) => {
      await tx.guardDeduction.updateMany({
        where: { payrollRunId },
        data:  { status: 'PENDING', payrollRunId: null },
      });
      await tx.payslip.deleteMany({ where: { payrollRunId } });
      await tx.payrollRun.update({
        where: { id: payrollRunId },
        data:  {
          status:       'REJECTED',
          rejectedBy,
          rejectedAt:   new Date(),
          rejectReason: reason,
        },
        include: { _count: { select: { payslips: true } }, zone: true },
      });
    });

    await QueueService.logAudit({
      userId:   rejectedBy,
      action:   'PAYROLL_RUN_REJECTED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      oldValue: {
        status:      run.status,
        month:       run.month,
        year:        run.year,
        zoneId:      run.zoneId,
        totalGuards: run.totalGuards,
        totalNet:    run.totalNet,
      },
      newValue: { status: 'REJECTED', reason },
    });

    // Re-read so fmtRun reports the rewound payslip count (0).
    const rejected = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } }, zone: true },
    });
    return fmtRun(rejected!);
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
      include: { _count: { select: { payslips: true } }, zone: true },
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
      include: { _count: { select: { payslips: true } }, zone: true },
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

      // Phone is optional on a guard now, so a record can reach payroll with no
      // number at all. Caught here rather than left to normalisePhone, which
      // would report "Unrecognised phone format: null" — true, but no help to
      // whoever has to go and find the number.
      const payToNumber = payslip.guard.preferredPaymentContact ?? payslip.guard.phone;
      if (!payToNumber) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            disbursementStatus:        'FAILED',
            disbursementFailureReason:
              `No mobile money number on record for ${payslip.guard.firstName} ${payslip.guard.lastName}. `
              + 'Add a phone number or a preferred payment contact to their profile.',
          },
        });
        failedCount++;
        continue;
      }

      try {
        const phone = xcel.normalisePhone(payToNumber);
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
          description: `${(await companyProfile()).name} - Salary ${run.month}/${run.year}`,
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

  async getRunHistory(query: {
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<PayrollRunResponse>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: { _count: { select: { payslips: true } }, zone: true },
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
      include: { payslips: { include: { guard: true } }, _count: { select: { payslips: true } }, zone: true },
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
