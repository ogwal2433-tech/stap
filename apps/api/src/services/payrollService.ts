import { PAID_STATUSES } from '@security360/shared';
import { companyProfile } from './integrationSettings';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { deductionService } from './deductionService';
import { cashbookService } from './cashbookService';
import * as xcel from '../lib/xcel';
import * as xcelPartner from '../lib/xcelPartner';
import { errorLogger } from './errorLogger';
import { notificationService } from './notificationService';
import type {
  PayrollRunResponse,
  PayslipResponse,
  PayrollSummary,
  PaginatedResponse,
  ZonePayrollRoster,
  ZonePayrollRosterResponse,
  ZonePayrollSite,
  ZonePayrollGuard,
  CompanyPayrollGuard,
  CompanyPayrollRosterResponse,
  StaffPayrollRosterResponse,
  PayrollPeriodSummary,
  PayrollZoneTotal,
} from '@security360/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL_WORKING_DAYS = 26; // Mon-Sat average

// Statuses that still "own" a (period, scope) slot — a run in any of these
// blocks recalculating over it. MD_APPROVED must be here: it is the state a
// run reaches just before disbursement, so letting a re-run land on top of it
// would pay the period twice. REJECTED is deliberately absent, which is what
// keeps a rejected zone/period immediately re-calculable.
const LIVE_RUN_STATUSES = ['DRAFT', 'APPROVED', 'HR_APPROVED', 'MD_APPROVED', 'DISBURSING', 'DISBURSED'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRun(r: any): PayrollRunResponse {
  return {
    id:              r.id,
    month:           r.month,
    year:            r.year,
    // Legacy company-wide and grouped runs have no zone — the UI labels them.
    zoneId:          r.zoneId ?? null,
    zoneName:        r.zone?.name ?? null,
    runType:         r.runType ?? 'GUARD',
    mdApprovedBy:    r.mdApprovedBy ?? null,
    mdApprovedAt:    r.mdApprovedAt?.toISOString() ?? null,
    totalGuards:     r.totalGuards,
    totalStaff:      r.totalStaff ?? 0,
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

// Payroll display only: local-format numbers (0772...) read better on
// schedules than +256... Storage and XCEL disbursement keep full format.
function displayPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/^\+256/, '0');
}

function fmtPayslip(p: any): PayslipResponse {
  return {
    id:                  p.id,
    guardId:             p.guardId ?? null,
    guardName:           p.guard ? `${p.guard.firstName} ${p.guard.lastName}` : '',
    guardPhone:          displayPhone(p.guard?.phone),
    userId:              p.userId ?? null,
    staffName:           p.user ? p.user.name : '',
    staffPhone:          displayPhone(p.user?.phone),
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
  // Every deployment site seen in the period, zoned or not — the company-wide
  // roster groups by site name and must show guards deployed only to un-zoned
  // sites too, which siteById (zoned-only) deliberately leaves out.
  allSitesById:     Map<string, { siteId: string; siteName: string; zoneId: string | null }>;
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
    allSitesById:    new Map(),
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
    if (!attr.allSitesById.has(d.siteId)) {
      attr.allSitesById.set(d.siteId, { siteId: d.site.id, siteName: d.site.siteName, zoneId });
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
      where: { month, year, zoneId, status: { in: LIVE_RUN_STATUSES } },
    });
    if (existing) {
      throw new AppError(`Payroll has already been run for ${zone.name} in this period`, 409);
    }
    // A live company-wide run (zoneId null) already covers every guard in this
    // zone, so the either/or rule closes the zone window for the period too.
    const companyRun = await prisma.payrollRun.findFirst({
      where: { month, year, zoneId: null, status: { in: LIVE_RUN_STATUSES } },
    });
    if (companyRun) {
      throw new AppError(
        'This period was already run company-wide — the company-wide run covers this zone. Reject or delete that run first to pay by zone.',
        409,
      );
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

    return this.persistRun(month, year, zoneId, zone.name, calculatedBy, guards, periodStart, periodEnd);
  }

  // ── Company-wide run — everyone deployed in the period, zone ignored ─────────

  async calculateCompanyRun(
    month: number,
    year: number,
    calculatedBy: string,
    guardIds: string[],
  ): Promise<PayrollSummary> {
    // The company-wide run claims every deployed guard, so ANY live run for
    // the period — this one or a zone's — would mean paying someone twice.
    // The zone path refuses a company-wide run the same way.
    const existing = await prisma.payrollRun.findFirst({
      where:   { month, year, status: { in: LIVE_RUN_STATUSES } },
      include: { zone: { select: { name: true } } },
    });
    if (existing) {
      throw new AppError(
        'Payroll has already been run for this period'
          + (existing.zoneId ? ` (${existing.zone?.name ?? 'a zone'})` : ' company-wide')
          + ' — a company-wide run would pay those guards again. Reject that run first.',
        409,
      );
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);

    // Eligible = payable guard with at least one deployment day in the period,
    // at any site — zoned or not. The roster showed exactly this set, so a
    // guard arriving outside it means a stale screen or a hand-built request.
    const attr = await buildZoneAttribution(periodStart, periodEnd);
    const selected = [...new Set(guardIds)];
    const ineligible = selected.filter((id) => !attr.daysBySite.has(id) || !attr.paidGuards.has(id));
    if (ineligible.length > 0) {
      const names = ineligible.map((id) => {
        const g = attr.paidGuards.get(id);
        return g ? `${g.firstName} ${g.lastName}` : id;
      }).join(', ');
      throw new AppError(
        `Not eligible for the company-wide payroll for this period: ${names}. Every guard to be paid must be on the payroll with a deployment in the period.`,
        400,
      );
    }

    const guards = selected.map((id) => attr.paidGuards.get(id)!);
    if (guards.length === 0) {
      throw new AppError('There are no guards to pay for this period.', 400);
    }

    return this.persistRun(month, year, null, null, calculatedBy, guards, periodStart, periodEnd);
  }

  // -- Staff-only run: fixed monthly salaries -----------------------------------

  /**
   * Staff tick-list for a period: every active internal account (guard and
   * client portal roles excluded). Salary and phone readiness ride along so
   * finance can see who is payable before calculating.
   */
  async getStaffPayrollRoster(month: number, year: number): Promise<StaffPayrollRosterResponse> {
    const staff = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role:   { notIn: ['GUARD', 'CLIENT'] },
      },
      orderBy: { name: 'asc' },
    });
    return {
      month,
      year,
      members: staff.map((u) => ({
        userId:     u.id,
        name:       u.name,
        systemId:   u.systemId,
        role:       u.role,
        salaryRate: u.salaryRate,
        phone:      u.preferredPaymentContact ?? u.phone,
        hasPhone:   !!(u.preferredPaymentContact ?? u.phone),
      })),
    };
  }

  /**
   * Staff-only payroll for a month: fixed salaryRate in full (no attendance
   * prorating, staff are salaried), minus PENDING staff deductions (NSSF,
   * PAYE, advances) effective in the period. One live STAFF run per period;
   * guard runs never collide because runType keeps the ledgers apart.
   */
  async calculateStaffRun(
    month: number,
    year: number,
    calculatedBy: string,
    userIds: string[],
  ): Promise<PayrollSummary> {
    const existing = await prisma.payrollRun.findFirst({
      where: {
        month,
        year,
        zoneId:  null,
        runType: 'STAFF',
        status:  { in: LIVE_RUN_STATUSES },
      },
    });
    if (existing) {
      throw new AppError('Staff payroll has already been run for this period', 409);
    }

    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const selected = [...new Set(userIds)];
    if (selected.length === 0) {
      throw new AppError('There are no staff to pay for this period.', 400);
    }
    const staff = await prisma.user.findMany({
      where: {
        id:     { in: selected },
        status: 'ACTIVE',
        role:   { notIn: ['GUARD', 'CLIENT'] },
      },
    });
    const byId = new Map(staff.map((u) => [u.id, u]));
    const problems = selected
      .map((id) => {
        const u = byId.get(id);
        if (!u) return `${id} (not an active staff account)`;
        if (u.salaryRate == null) return `${u.name} (no salary set)`;
        return null;
      })
      .filter(Boolean);
    if (problems.length > 0) {
      throw new AppError(
        `Not payable on staff payroll: ${problems.join(', ')}. Set a salary on each staff profile first.`,
        400,
      );
    }

    let totalGross      = 0;
    let totalDeductions = 0;
    const payslipData: any[] = [];

    // Calendar days for the month (Feb 28/29, Apr 30...): staff are
    // salaried, so days are display-only but must read true per month.
    // Guard runs keep the 26-day pro-rata constant elsewhere.
    const daysInMonth = new Date(year, month, 0).getDate();
    for (const id of selected) {
      const member = byId.get(id)!;
      const gross = member.salaryRate as number;

      const pendingDeductions = await prisma.staffDeduction.findMany({
        where: {
          userId:        member.id,
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
        user: member,
        grossSalary:         gross,
        deductionsBreakdown: deductionBreakdown,
        totalDeductions:     totalDed,
        netSalary:           net,
        daysWorked:          daysInMonth,
        totalDays:           daysInMonth,
        pendingDeductionIds: pendingDeductions.map((d) => d.id),
      });
    }

    // Rejected staff runs reopen in place, same as guard runs.
    const rejectedRun = await prisma.payrollRun.findFirst({
      where:   { month, year, zoneId: null, runType: 'STAFF', status: 'REJECTED' },
      orderBy: { rejectedAt: 'desc' },
    });

    let runId: string;
    if (rejectedRun) {
      const reopened = await prisma.payrollRun.update({
        where: { id: rejectedRun.id },
        data: {
          status:          'DRAFT',
          totalGuards:     0,
          totalStaff:      selected.length,
          totalGross,
          totalDeductions,
          totalNet:        totalGross - totalDeductions,
          createdBy:       calculatedBy,
          approvedBy: null, approvedAt: null,
          hrApprovedBy: null, hrApprovedAt: null, hrNotes: null,
          disbursedBy: null, disbursedAt: null, successCount: 0, failedCount: 0,
        },
      });
      runId = reopened.id;
      await prisma.payslip.deleteMany({ where: { payrollRunId: runId } });
    } else {
      const created = await prisma.payrollRun.create({
        data: {
          month,
          year,
          zoneId:      null,
          runType:     'STAFF',
          totalGuards: 0,
          totalStaff:  selected.length,
          totalGross,
          totalDeductions,
          totalNet:    totalGross - totalDeductions,
          createdBy:   calculatedBy,
        },
      });
      runId = created.id;
    }

    try {
      await notificationService.sendToRoles(['ASSISTANT_MANAGER'], {
        type:       'PAYROLL_CALCULATED',
        channels:   ['inApp', 'email'],
        title:      `Staff payroll calculated: ${month}/${year}`,
        message:    `A staff payroll run for ${month}/${year} was calculated and needs Harold's approval.`,
        entityType: 'payroll',
        entityId:   runId,
      });
    } catch (err) { console.error('Staff payroll calculate handoff bell failed', err); }

    const payslips: any[] = [];
    for (const p of payslipData) {
      const payslip = await prisma.payslip.create({
        data: {
          userId:              p.user.id,
          payrollRunId:        runId,
          grossSalary:         p.grossSalary,
          deductionsBreakdown: p.deductionsBreakdown,
          totalDeductions:     p.totalDeductions,
          netSalary:           p.netSalary,
          daysWorked:          p.daysWorked,
          totalDays:           p.totalDays,
        },
        include: { user: true },
      });

      if (p.pendingDeductionIds.length > 0) {
        await deductionService.applyStaffToPayroll(p.pendingDeductionIds, runId);
      }

      payslips.push(payslip);
    }

    return {
      month,
      year,
      zoneId:          null,
      zoneName:        null,
      totalGuards:     0,
      totalStaff:      selected.length,
      totalGross,
      totalDeductions,
      totalNet:        totalGross - totalDeductions,
      byGuard:         [],
      byStaff:         payslips.map(fmtPayslip),
    };
  }


  // ── Shared machinery for both scopes ────────────────────────────────────────

  /**
   * Turns the chosen guards into a DRAFT run with materialised payslips:
   * company-wide attendance day count, pro-rata against TOTAL_WORKING_DAYS and
   * pending deductions — identical maths for both scopes, the scope only
   * decides who is in the run.
   */
  private async persistRun(
    month:          number,
    year:           number,
    zoneId:         string | null,
    zoneName:       string | null,
    calculatedBy:   string,
    guards:         any[],
    periodStart:    Date,
    periodEnd:      Date,
  ): Promise<PayrollSummary> {
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

    // A recalculation reopens the run that was rejected for this same scope and
    // period, rather than leaving it behind and starting a second row: the
    // rejected run's reason/who/when stay on file and its totals refresh in
    // place. Reject is not a live status, so the caller's duplicate check
    // already let this through; we pick the most recent REJECTED run if several
    // were left by the old create-a-new-draft behaviour.
    const rejectedRun = await prisma.payrollRun.findFirst({
      where:   { month, year, zoneId, status: 'REJECTED' },
      orderBy: { rejectedAt: 'desc' },
    });

    let runId: string;
    if (rejectedRun) {
      const reopened = await prisma.payrollRun.update({
        where: { id: rejectedRun.id },
        data: {
          zoneId,
          status:          'DRAFT',
          totalGuards:     guards.length,
          totalGross,
          totalDeductions,
          totalNet:        totalGross - totalDeductions,
          createdBy:       calculatedBy,
          // Clear the approval/disbursement trail so the reopened draft re-enters
          // the flow clean; the reject reason stays as the record of why it reopened.
          approvedBy: null, approvedAt: null,
          hrApprovedBy: null, hrApprovedAt: null, hrNotes: null,
          disbursedBy: null, disbursedAt: null, successCount: 0, failedCount: 0,
        },
      });
      runId = reopened.id;
      // Defensive: a rejected run's payslips were deleted on reject, but clear
      // any strays before rebuilding so totals and rows never diverge.
      await prisma.payslip.deleteMany({ where: { payrollRunId: runId } });
    } else {
      const created = await prisma.payrollRun.create({
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
      runId = created.id;
    }

    try {
      await notificationService.sendToRoles(['DIRECTOR'], {
        type:       'PAYROLL_CALCULATED',
        channels:   ['inApp', 'email'],
        title:      `Payroll calculated: ${month}/${year}`,
        message:    `A payroll run for ${zoneName ?? 'the company'} (${month}/${year}) was calculated and needs financial approval.`,
        entityType: 'payroll',
        entityId:   runId,
      });
    } catch (err) { console.error('Payroll calculate handoff bell failed', err); }

    // Create payslips and apply deductions
    const payslips: any[] = [];
    for (const p of payslipData) {
      const payslip = await prisma.payslip.create({
        data: {
          guardId:             p.guard.id,
          payrollRunId:        runId,
          grossSalary:         p.grossSalary,
          deductionsBreakdown: p.deductionsBreakdown,
          totalDeductions:     p.totalDeductions,
          netSalary:           p.netSalary,
          daysWorked:          p.daysWorked,
          totalDays:           p.totalDays,
        },
        include: { guard: true, user: true },
      });

      if (p.pendingDeductionIds.length > 0) {
        await deductionService.applyToPayroll(p.pendingDeductionIds, runId);
      }

      payslips.push(payslip);
    }

    return {
      month,
      year,
      zoneId,
      zoneName,
      totalGuards:     guards.length,
      totalStaff:      0,
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

  // ── Company-wide roster — every deployed guard, zone ignored ─────────────────

  async getCompanyPayrollRoster(month: number, year: number): Promise<CompanyPayrollRosterResponse> {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59);
    const attr = await buildZoneAttribution(periodStart, periodEnd);

    const attendanceGroups = await prisma.attendanceRecord.groupBy({
      by:     ['guardId'],
      where:  { status: { in: ['PRESENT', 'LATE'] }, date: { gte: periodStart, lte: periodEnd } },
      _count: { _all: true },
    });
    const attendanceDays = new Map<string, number>(
      attendanceGroups.map((g: any) => [g.guardId, g._count._all] as [string, number]),
    );

    // A guard sits under the site where they had most days that period, so
    // nobody appears twice in the tick-list. daysBySite also counts sites
    // outside every active zone — the company-wide list takes them all.
    const guards: CompanyPayrollGuard[] = [];
    for (const [guardId, g] of attr.paidGuards) {
      const bySite = attr.daysBySite.get(guardId);
      if (!bySite) continue; // payable but not deployed this period — nothing to pay

      let bestSiteId  = '';
      let bestDays    = -1;
      let bestName    = '';
      for (const [siteId, days] of bySite) {
        const site = attr.allSitesById.get(siteId);
        if (!site) continue; // site soft-deleted since the deployment rows were written
        if (days > bestDays || (days === bestDays && site.siteName < bestName)) {
          bestSiteId = siteId; bestDays = days; bestName = site.siteName;
        }
      }
      const best = attr.allSitesById.get(bestSiteId);
      if (!best) continue;

      guards.push({
        guardId,
        name:             `${g.firstName} ${g.lastName}`,
        systemId:         g.systemId ?? null,
        employmentStatus: g.employmentStatus,
        salaryRate:       g.salaryRate,
        deploymentDays:   [...bySite.values()].reduce((s, d) => s + d, 0),
        attendanceDays:   attendanceDays.get(guardId) ?? 0,
        primarySiteName:  best.siteName,
        primaryZoneName:  best.zoneId ? attr.zoneById.get(best.zoneId)?.name ?? null : null,
      });
    }

    const bySite = new Map<string, CompanyPayrollGuard[]>();
    for (const guard of guards) {
      const list = bySite.get(guard.primarySiteName) ?? [];
      list.push(guard);
      bySite.set(guard.primarySiteName, list);
    }

    const sites = [...bySite.entries()]
      .map(([siteName, siteGuards]) => ({
        siteName,
        guards: siteGuards.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.siteName.localeCompare(b.siteName));

    return { month, year, sites, guardCount: guards.length };
  }

  // Whoever raised the run hears how every decision on it went: the creator
  // sits in no approver role, so the role broadcasts never reach them.
  private async notifyRunCreator(
    run:     { id: string; month: number; year: number; createdBy: string },
    actorId: string,
    type:    string,
    title:   string,
    message: string,
  ): Promise<void> {
    if (!run.createdBy || run.createdBy === actorId) return;
    try {
      await notificationService.send({
        userId:     run.createdBy,
        channels:   ['inApp', 'email'],
        type, title, message,
        entityType: 'payroll',
        entityId:   run.id,
      });
    } catch (err) { console.error('Payroll creator bell failed', err); }
  }

  async approve(payrollRunId: string, approvedBy: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } }, zone: true },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError('Only DRAFT payrolls can be approved', 400);

    // Staff runs are Harold's lane: an Assistant Manager may financially
    // approve them. Guard runs stay Director-only (enforced at the route,
    // re-checked here so the rule holds however approve is reached).
    if ((run as any).runType === 'STAFF') {
      const actor = await prisma.user.findUnique({ where: { id: approvedBy }, select: { role: true } });
      if (!actor || (actor.role !== 'DIRECTOR' && actor.role !== 'ASSISTANT_MANAGER' && actor.role !== 'MD')) {
        throw new AppError('Only the Director, Assistant Manager or MD may approve a staff payroll run', 403);
      }
    }

    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'APPROVED', approvedBy, approvedAt: new Date(), mdApprovedBy: null, mdApprovedAt: null },
      include: { _count: { select: { payslips: true } }, zone: true },
    });

    // Queue payslip PDF generation for each guard
    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId },
      include: { guard: true, user: true },
    });

    for (const payslip of payslips) {
      // The payslip PDF job is guard-keyed; staff slips skip it (the worker
      // only logs today) while the approval and audit trail run as normal.
      if (!payslip.guardId) continue;
      await QueueService.generatePayslip({
        guardId:     payslip.guardId,
        payrollRunId,
        periodStart: new Date(run.year, run.month - 1, 1).toISOString(),
        periodEnd:   new Date(run.year, run.month, 0).toISOString(),
      });
    }

    // Money out the moment finance signs the run off: post the payslip-sum to
    // the cashbook, keyed to the run so HR review (which may adjust amounts)
    // can refresh it and a re-approval can never post it twice. Dated at the
    // service month's end — the month the salaries belong to.
    const committedTotal = payslips.reduce((s, p) => s + (p.hrAdjustedAmount ?? p.netSalary), 0);
    await cashbookService.recordAuto({
      sourceRef:   `PAYROLL_RUN:${payrollRunId}`,
      date:        new Date(run.year, run.month, 0, 23, 59, 59, 999),
      description: `Payroll ${String(run.month).padStart(2, '0')}/${run.year} `
        + `${(run as any).runType === 'STAFF' ? 'Staff' : 'Guard'} run`
        + `${run.zone ? ` - ${run.zone.name}` : ''}`,
      category:    'PAYROLL',
      amount:      committedTotal,
      type:        'OUT',
      recordedBy:  approvedBy,
    });

    try {
      // Directors see every approval immediately: Harold approves, every
      // Director is told at once and their approve/reject controls stay
      // active regardless of the MD step.
      await notificationService.sendToRoles([(run as any).runType === 'STAFF' ? 'MD' : 'ASSISTANT_MANAGER', 'DIRECTOR'], {
        type:       'PAYROLL_APPROVED',
        channels:   ['inApp', 'email'],
        title:      `Payroll approved: ${run.month}/${run.year}`,
        message:    (run as any).runType === 'STAFF'
          ? `A staff payroll run for ${run.month}/${run.year} was approved and now needs MD final approval.`
          : `A payroll run for ${run.month}/${run.year} was financially approved and now needs HR review.`,
        entityType: 'payroll',
        entityId:   payrollRunId,
      });
    } catch (err) { console.error('Payroll approve handoff bell failed', err); }

    await this.notifyRunCreator(updated, approvedBy, 'PAYROLL_APPROVED',
      `Payroll approved: ${run.month}/${run.year}`,
      `Your payroll run for ${run.month}/${run.year} was approved and moves on for the next sign-off.`);

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

    // Staff runs reject only by the MD: Harold's end carries no reject
    // control, Micheal holds both final options (approve or reject).
    if ((run as any).runType === 'STAFF') {
      const actor = await prisma.user.findUnique({ where: { id: rejectedBy }, select: { role: true } });
      if (!actor || (actor.role !== 'MD' && actor.role !== 'DIRECTOR')) {
        throw new AppError('Only the MD or a Director can reject a staff payroll run.', 403);
      }
    }

    // Both payroll-run roles (DIRECTOR, ASSISTANT_MANAGER — enforced at the
    // route) can send back a draft or an approved run; approval is a Director
    // action but rejection is the shared "this looks wrong, rewind it" control.
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
          mdApprovedBy: null,
          mdApprovedAt: null,
        },
        include: { _count: { select: { payslips: true } }, zone: true },
      });
    });

    // The run spent nothing (rejection is only possible before disbursement),
    // so the committed ledger row posted at approval leaves with it — Money
    // Out must not keep a REJECTED run's salary.
    await cashbookService.removeAuto(`PAYROLL_RUN:${payrollRunId}`);

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

    // Whoever raised the run hears it was sent back, and why.
    await this.notifyRunCreator(run, rejectedBy, 'PAYROLL_REJECTED',
      `Payroll rejected: ${run.month}/${run.year}`,
      `Your payroll run for ${run.month}/${run.year} was rejected${reason ? `: ${reason}` : '.'}`);

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
      include: { guard: true, user: true },
    });
    return fmtPayslip(payslip);
  }

  async unflagPayslip(payslipId: string): Promise<PayslipResponse> {
    const payslip = await prisma.payslip.update({
      where: { id: payslipId },
      data:  { hrFlagged: false, hrFlagReason: null, hrAdjustedAmount: null },
      include: { guard: true, user: true },
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

    // Staff runs skip HR review entirely: Harold's approval sends them
    // straight to Micheal. Refuse the step so no staff run can ever
    // carry an HR stamp it should not have.
    if ((run as any).runType === 'STAFF') {
      throw new AppError('Staff runs go straight from approval to MD final approval - there is no HR step.', 400);
    }
    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'HR_APPROVED', hrApprovedBy: reviewedBy, hrApprovedAt: new Date(), hrNotes: notes ?? null },
      include: { _count: { select: { payslips: true } }, zone: true },
    });

    // HR is exactly where per-guard adjustments land, so the committed ledger
    // row posted at financial approval may now be stale. Refresh its amount
    // from the payslips as they stand — updateMany is a no-op if the row is
    // not there (legacy runs posted before this hook existed).
    const adjustedSlips = await prisma.payslip.findMany({
      where:  { payrollRunId },
      select: { hrAdjustedAmount: true, netSalary: true },
    });
    await prisma.cashbookEntry.updateMany({
      where: { sourceRef: `PAYROLL_RUN:${payrollRunId}` },
      data:  { amount: adjustedSlips.reduce((s, p) => s + (p.hrAdjustedAmount ?? p.netSalary), 0) },
    });

    try {
      await notificationService.sendToRoles(['MD'], {
        type:       'PAYROLL_HR_APPROVED',
        channels:   ['inApp', 'email'],
        title:      `Payroll needs MD approval: ${run.month}/${run.year}`,
        message:    `A payroll run for ${run.month}/${run.year} passed HR review and now needs final MD approval before disbursement.`,
        entityType: 'payroll',
        entityId:   payrollRunId,
      });
    } catch (err) { console.error('Payroll HR handoff bell failed', err); }

    await this.notifyRunCreator(updated, reviewedBy, 'PAYROLL_HR_APPROVED',
      `Payroll passed HR review: ${run.month}/${run.year}`,
      `Your payroll run for ${run.month}/${run.year} passed HR review and awaits MD final approval.`);

    await QueueService.logAudit({
      userId:   reviewedBy,
      action:   'PAYROLL_HR_APPROVED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      newValue: { notes: notes ?? null },
    });

    return fmtRun(updated);
  }
  // -- MD: final approval, the last stamp before Finance can disburse --------

  async mdApprove(payrollRunId: string, mdApprovedBy: string): Promise<PayrollRunResponse> {
    const run = await prisma.payrollRun.findUnique({
      where:   { id: payrollRunId },
      include: { _count: { select: { payslips: true } }, zone: true },
    });
    if (!run) throw new NotFoundError('Payroll run not found');
    // Guard runs arrive via HR review; staff runs come straight from
    // Harold's approval with no HR step in between.
    const needsHr = (run as any).runType !== 'STAFF';
    if (needsHr ? run.status !== 'HR_APPROVED' : run.status !== 'APPROVED') {
      throw new AppError(
        `This run is ${run.status} - MD final approval needs an HR-approved guard run or an approved staff run.`,
        400,
      );
    }
    // Separation of duties: the final authority must be fresh eyes. The MD
    // cannot stamp a run they already approved or HR-reviewed.
    if (run.approvedBy === mdApprovedBy || run.hrApprovedBy === mdApprovedBy) {
      throw new AppError('MD final approval must come from someone who did not approve this run before.', 403);
    }

    const updated = await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'MD_APPROVED', mdApprovedBy, mdApprovedAt: new Date() },
      include: { _count: { select: { payslips: true } }, zone: true },
    });

    try {
      await notificationService.sendToRoles(['DIRECTOR'], {
        type:       'PAYROLL_MD_APPROVED',
        channels:   ['inApp', 'email'],
        title:      `Payroll ready to disburse: ${run.month}/${run.year}`,
        message:    `A payroll run for ${run.month}/${run.year} received MD final approval and can now be disbursed.`,
        entityType: 'payroll',
        entityId:   payrollRunId,
      });
    } catch (err) { console.error('Payroll MD handoff bell failed', err); }

    await this.notifyRunCreator(updated, mdApprovedBy, 'PAYROLL_MD_APPROVED',
      `Payroll ready to disburse: ${run.month}/${run.year}`,
      `Your payroll run for ${run.month}/${run.year} received MD final approval and is ready to disburse.`);

    await QueueService.logAudit({
      userId:   mdApprovedBy,
      action:   'PAYROLL_MD_APPROVED',
      entity:   'payrollRun',
      entityId: payrollRunId,
      newValue: { status: 'MD_APPROVED' },
    });

    return fmtRun(updated);
  }


  // ── Finance: disburse an HR-approved run via XCEL mobile money ──────────────

  async disburse(payrollRunId: string, disbursedBy: string): Promise<void> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new NotFoundError('Payroll run not found');
    if (run.status !== 'MD_APPROVED') {
      throw new AppError(
        `This run is ${run.status}. Only MD_APPROVED runs can be disbursed - MD must give final approval — HR must approve the run before Finance can pay.`,
        400,
      );
    }

    // Self-payment guard: whoever gave the final MD approval cannot be the
    // one who moves the money. Directors who never stamped this run pay normally.
    if (run.mdApprovedBy && run.mdApprovedBy === disbursedBy) {
      throw new AppError('The MD approver cannot disburse a run they finally approved - ask another Director.', 403);
    }
    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data:  { status: 'DISBURSING', disbursedBy, disbursedAt: new Date() },
    });

    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId, disbursementStatus: 'PENDING' },
      include: { guard: true, user: true },
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

      // Staff payslips carry userId instead of guardId: resolve one payee
      // shape so the XCEL steps below work for both ledgers unchanged.
      const payee = payslip.guard
        ? {
            id: payslip.guardId as string,
            displayName: `${payslip.guard.firstName} ${payslip.guard.lastName}`,
            firstName: payslip.guard.firstName,
            lastName: payslip.guard.lastName,
            payToNumber: payslip.guard.preferredPaymentContact ?? payslip.guard.phone,
            network: payslip.guard.mobileNetwork,
            accountName:
              payslip.guard.momoAccountName ||
              `${payslip.guard.firstName} ${payslip.guard.lastName}`,
          }
        : payslip.user
          ? splitStaffPayee(payslip.userId as string, payslip.user)
          : null;
      if (!payee) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            disbursementStatus: 'FAILED',
            disbursementFailureReason: 'Payslip has neither a guard nor a staff user on record.',
          },
        });
        failedCount++;
        continue;
      }

      // Phone is optional on a guard now, so a record can reach payroll with no
      // number at all. Caught here rather than left to normalisePhone, which
      // would report "Unrecognised phone format: null" — true, but no help to
      // whoever has to go and find the number.
      if (!payee.payToNumber) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            disbursementStatus:        'FAILED',
            disbursementFailureReason:
              `No mobile money number on record for ${payee.displayName}. `
              + 'Add a phone number or a preferred payment contact to their profile.',
          },
        });
        failedCount++;
        continue;
      }

      try {
        const phone = xcel.normalisePhone(payee.payToNumber as string);
          // The guard's own setting wins. Detection reads the prefix and throws
          // on a range it does not know, which would fail an otherwise valid number.
          const network = payee.network || xcel.detectNetwork(phone);

        const dlCode = await xcelPartner.generateDynamicLinkOtp({
          amount:     payAmount,
          bankCode:   network,
          accountNum: phone,
        });

        const reference = xcel.generateDisbursementRef(payee.id, period);

        const result = await xcelPartner.initiateBankPayment({
          amount:      payAmount,
          reference,
          dlCode,
          bankCode:    network,
          accountNum:  phone,
          // What the wallet is registered as, which need not be the legal name.
            accountName: payee.accountName,
          description: `${(await companyProfile()).name} - Salary ${run.month}/${run.year}`,
          receiverFirstName: payee.firstName,
          receiverLastName:  payee.lastName,
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
          context:   { payrollRunId, payslipId: payslip.id, payeeId: payee.id, amount: payAmount },
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

    const payslip = await prisma.payslip.findFirst({
      where:   { disbursementRef: reference },
      include: {
        guard:      { select: { firstName: true, lastName: true } },
        user:       { select: { name: true } },
        payrollRun: { select: { month: true, year: true } },
      },
    });
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

    // Money left the company only on a SUCCESS: post the payout then, keyed to
    // the payslip so a re-sent webhook (or a manual re-fire) can't count it
    // twice. The amount mirrors the send — an HR-adjusted payslip pays its
    // adjusted figure, not the net it was computed with.
    if (ourStatus === 'SUCCESS') {
      // The run itself was already posted to the cashbook at approval
      // (PAYROLL_RUN:<runId>) — the per-slip rows would double-count every
      // shilling of that run, so only pay slips for runs posted before that
      // hook existed still write their own row.
      const runRow = await prisma.cashbookEntry.findUnique({
        where:  { sourceRef: `PAYROLL_RUN:${payslip.payrollRunId}` },
        select: { id: true },
      });
      if (!runRow) {
        const payee = payslip.guard
          ? `${payslip.guard.firstName} ${payslip.guard.lastName}`
          : payslip.user?.name ?? 'Unknown payee';
        const period = `${payslip.payrollRun.year}-${String(payslip.payrollRun.month).padStart(2, '0')}`;
        await cashbookService.recordAuto({
          sourceRef:   `PAYSLIP:${payslip.id}`,
          date:        new Date(),
          description: `Payroll ${period} payout - ${payee}`,
          category:    'PAYROLL',
          amount:      payslip.hrAdjustedAmount ?? payslip.netSalary,
          type:        'OUT',
          recordedBy:  'system',
        });
      }
    }

    const siblings = await prisma.payslip.findMany({ where: { payrollRunId: payslip.payrollRunId } });
    await prisma.payrollRun.update({
      where: { id: payslip.payrollRunId },
      data: {
        successCount: siblings.filter((p) => p.disbursementStatus === 'SUCCESS').length,
        failedCount:  siblings.filter((p) => p.disbursementStatus === 'FAILED').length,
      },
    });
  }

  /**
   * Period zone-totals for the Payroll tab: one row per live guard run plus
   * the countrywide total across them. A period is covered either by zone runs
   * or by a single company-wide run, never both. REJECTED runs are excluded —
   * they paid nobody. Legacy runs with no zone relation group as company-wide
   * rather than being dropped.
   */
  async getPeriodSummary(month: number, year: number): Promise<PayrollPeriodSummary> {
    const runs = await prisma.payrollRun.findMany({
      where:   { month, year, runType: 'GUARD', status: { in: LIVE_RUN_STATUSES } },
      include: { zone: true },
    });

    const zones: PayrollZoneTotal[] = runs
      .map((r) => ({
        runId:      r.id,
        zoneId:     r.zoneId ?? null,
        zoneName:   r.zone?.name ?? null,
        status:     r.status,
        guards:     r.totalGuards,
        gross:      r.totalGross,
        deductions: r.totalDeductions,
        net:        r.totalNet,
      }))
      .sort((a, b) => {
        // Company-wide (no zone) rows first, then zone name A→Z.
        if (a.zoneName === null && b.zoneName !== null) return -1;
        if (b.zoneName === null && a.zoneName !== null) return 1;
        return (a.zoneName ?? '').localeCompare(b.zoneName ?? '');
      });

    const totals = zones.reduce(
      (acc, z) => ({
        zones:      acc.zones + 1,
        guards:     acc.guards + z.guards,
        gross:      acc.gross + z.gross,
        deductions: acc.deductions + z.deductions,
        net:        acc.net + z.net,
      }),
      { zones: 0, guards: 0, gross: 0, deductions: 0, net: 0 },
    );

    return {
      month,
      year,
      scope: totals.zones === 0 ? 'NONE' : zones[0].zoneId === null ? 'COMPANY' : 'ZONE',
      zones,
      totals,
    };
  }

  async getRunHistory(query: {
    page: number;
    limit: number;
    runType?: string;
  }): Promise<PaginatedResponse<PayrollRunResponse>> {
    const { page, limit } = query;
    const where: any = query.runType ? { runType: query.runType } : {};
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: { _count: { select: { payslips: true } }, zone: true },
      }),
      prisma.payrollRun.count({ where }),
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
      include: { payslips: { include: { guard: true, user: true } }, _count: { select: { payslips: true } }, zone: true },
    });
    if (!run) throw new NotFoundError('Payroll run not found');

    return { ...fmtRun(run), payslips: run.payslips.map(fmtPayslip) };
  }

  async getPayslipsByRun(runId: string): Promise<PayslipResponse[]> {
    const payslips = await prisma.payslip.findMany({
      where:   { payrollRunId: runId },
      include: { guard: true, user: true },
    });
    return payslips.map(fmtPayslip);
  }

  async getPayslip(id: string): Promise<PayslipResponse> {
    const payslip = await prisma.payslip.findUnique({
      where:   { id },
      include: { guard: true, user: true },
    });
    if (!payslip) throw new NotFoundError('Payslip not found');
    return fmtPayslip(payslip);
  }
}

// Split a staff display name for XCEL, which wants a first and last name.
// Single-name staff fall back to the same value twice rather than failing.
function splitStaffPayee(userId: string, user: any): {
  id: string; displayName: string; firstName: string; lastName: string;
  payToNumber: string | null; network: string | null; accountName: string;
} {
  const parts = String(user.name ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Staff';
  const lastName = parts.slice(1).join(' ') || firstName;
  return {
    id: userId,
    displayName: user.name ?? 'Staff',
    firstName,
    lastName,
    payToNumber: user.preferredPaymentContact ?? user.phone ?? null,
    network: user.mobileNetwork ?? null,
    accountName: user.momoAccountName || user.name || 'Staff',
  };
}

export const payrollService = new PayrollService();
