import ExcelJS from 'exceljs';
import { APP_NAME } from '../config/branding';
import cron from 'node-cron';
import prisma from '../db/prisma';
import { OUTSTANDING_STATUSES } from './invoiceService';
import { QueueService } from '../jobs/QueueService';
import { REPORT_TITLE_DEFAULTS, roundMoney as round2, type DirectorDashboardStats, type ScheduledReportInput, type IncomeExpensesReport, type BusinessAnalysisReport } from '@security360/shared';
import { settingsService } from './settingsService';

// ── Helpers ────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

const NAVY = 'FF1B3A6B';

function styleHeader(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: FFCCCCCC } },
    };
    cell.alignment = { vertical: 'middle' };
  });
}

const FFCCCCCC = 'FFCCCCCC';

function styleRow(row: ExcelJS.Row, idx: number) {
  if (idx % 2 === 0) {
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    });
  }
}

// ── Scheduled jobs map ─────────────────────────────────────────────────────────

const scheduledJobs = new Map<string, ReturnType<typeof cron.schedule>>();

// ── Committed spend — the two sources of truth for "money out" ────────────────
//
// A payroll run is committed the moment finance signs it off (HR review
// follows) and a requisition the moment it is *handed out* (assigned); both
// keep counting until they are rejected. DRAFT and REJECTED spend nothing.
// The ledger's copy of these movements carries a sourceRef and is excluded
// from the totals below — it is the *paid* view, never a second expense.

// MD_APPROVED sits between HR_APPROVED and disbursement — a run with the MD's
// final stamp was committed long ago and must never fall out of Money Out.
const COMMITTED_RUN_STATUSES = ['APPROVED', 'HR_APPROVED', 'MD_APPROVED', 'DISBURSING', 'DISBURSED'];
// Approved-but-not-handed-out requisitions are NOT money out: the money is
// still in the bank until someone is given it to spend. Money Out counts
// ASSIGNED / IN_PROGRESS / COMPLETED — and COMPLETED stays in because the
// month committed the money and the requisition's own `date` bounds it to
// this month regardless of how far the work progressed. The cash side is
// `paidOut` (REQ:/FUND_DISPATCH: ledger rows), never a second expense.
const COMMITTED_REQ_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];

// ── Service ────────────────────────────────────────────────────────────────────

// Payroll display only: local-format numbers (0772...) read better on
// schedules than +256... Storage and XCEL disbursement keep full format.
function displayPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/^\+256/, '0');
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 08-Oct-2026 — the shape the app prints dates in. */
function fmtDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_SHORT[d.getMonth()]}-${d.getFullYear()}`;
}

class ReportService {
  async getDirectorDashboard(): Promise<DirectorDashboardStats> {
    const now   = new Date();
    const today = startOfDay(now);

    const [
      guardsDeployedToday,
      guardsAbsentToday,
      openComplaints,
      pendingApprovals,
      supervisorCheckinsToday,
      monthlyRevenueAgg,
      outstandingARAgg,
      payrollCostAgg,
      overdueInvoices,
      totalActiveGuards,
      newGuardsThisMonth,
      expiringContracts,
      openDisciplinary,
    ] = await Promise.all([
      prisma.deployment.count({ where: { date: today } }),
      prisma.attendanceRecord.count({ where: { date: today, status: { in: ['ABSENT', 'AWOL'] } } }),
      prisma.clientComplaint.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.requisition.count({ where: { status: 'SUBMITTED' } }),
      prisma.supervisorCheckin.count({ where: { dateTime: { gte: today } } }),
      prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'PAID', paidAt: { gte: startOfMonth(now), lte: endOfMonth(now) } },
      }),
      prisma.invoice.aggregate({
        // outstandingBalance, not totalAmount — a part-paid invoice owes the
        // remainder, and PARTIALLY_PAID has to be in the filter or it drops out
        // of the figure altogether.
        _sum: { outstandingBalance: true },
        where: { status: { in: [...OUTSTANDING_STATUSES] } },
      }),
      prisma.payrollRun.aggregate({
        _sum: { totalNet: true },
        where: { month: now.getMonth() + 1, year: now.getFullYear(), status: { in: ['APPROVED', 'DISBURSED'] } },
      }),
      prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      prisma.guard.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.guard.count({ where: { createdAt: { gte: startOfMonth(now) } } }),
      prisma.contract.count({
        where: { status: { in: ['ACTIVE', 'EXPIRING'] }, contractEnd: { lte: addDays(now, 30) } },
      }),
      prisma.guard.count({ where: { employmentStatus: 'SUSPENDED' } }),
    ]);

    // Revenue vs payroll — last 6 months (computed in JS from DB data)
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const [recentInvoices, recentPayrolls] = await Promise.all([
      prisma.invoice.findMany({
        where:  { status: 'PAID', paidAt: { gte: sixMonthsAgo } },
        select: { totalAmount: true, paidAt: true },
      }),
      prisma.payrollRun.findMany({
        where:  { status: { in: ['APPROVED', 'DISBURSED'] }, createdAt: { gte: sixMonthsAgo } },
        select: { totalNet: true, month: true, year: true },
      }),
    ]);

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - (5 - i));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short', timeZone: 'Africa/Kampala' }), revenue: 0, payroll: 0 };
    });
    const monthMap = new Map(months.map(m => [m.key, m]));

    for (const inv of recentInvoices) {
      if (!inv.paidAt) continue;
      const key = `${inv.paidAt.getFullYear()}-${inv.paidAt.getMonth()}`;
      const b = monthMap.get(key);
      if (b) b.revenue += inv.totalAmount;
    }
    for (const run of recentPayrolls) {
      // payrollRun stores month (1-12) and year
      const key = `${run.year}-${run.month - 1}`;
      const b = monthMap.get(key);
      if (b) b.payroll += run.totalNet;
    }

    // Attendance trend — last 14 days
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
    const attendanceRows = await prisma.attendanceRecord.findMany({
      where:  { date: { gte: fourteenDaysAgo } },
      select: { date: true, status: true },
    });
    const trendMap = new Map<string, { date: string; present: number; absent: number }>();
    for (const r of attendanceRows) {
      const key = r.date.toISOString().split('T')[0];
      if (!trendMap.has(key)) trendMap.set(key, { date: key, present: 0, absent: 0 });
      const b = trendMap.get(key)!;
      if (r.status === 'PRESENT' || r.status === 'LATE') b.present++;
      else b.absent++;
    }

    return {
      operations: {
        guardsDeployedToday,
        guardsAbsentToday,
        sitesWithIssues:         openComplaints,
        supervisorCheckinsToday,
        openComplaints,
        pendingApprovals,
      },
      finance: {
        // Invoice amounts are double precision now, so a summed figure can carry
        // binary dust (2,500,000.4999999). Snap it back before it reaches a cell.
        monthlyRevenue:       round2(monthlyRevenueAgg._sum.totalAmount ?? 0),
        outstandingAR:        round2(outstandingARAgg._sum.outstandingBalance ?? 0),
        payrollCostThisMonth: payrollCostAgg._sum.totalNet       ?? 0,
        overdueInvoices,
      },
      hr: {
        totalActiveGuards: totalActiveGuards,
        newThisMonth:      newGuardsThisMonth,
        expiringContracts,
        openDisciplinary,
      },
      revenueVsPayroll: months.map(m => ({ month: m.label, revenue: round2(m.revenue), payroll: m.payroll })),
      attendanceTrend:  [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async generateDailyOpsReport(date: string): Promise<Buffer> {
    const targetDate = new Date(date);
    const nextDay    = new Date(targetDate.getTime() + 86_400_000);

    const [deployments, attendance, checkins, incidents] = await Promise.all([
      prisma.deployment.findMany({
        where:   { date: { gte: targetDate, lt: nextDay } },
        include: {
          guard: { select: { firstName: true, lastName: true } },
          site:  { select: { siteName: true } },
        },
      }),
      prisma.attendanceRecord.findMany({
        where:   { date: { gte: targetDate, lt: nextDay } },
        include: { guard: { select: { firstName: true, lastName: true } }, site: { select: { siteName: true } } },
      }),
      prisma.supervisorCheckin.findMany({
        where:   { dateTime: { gte: targetDate, lt: nextDay } },
        include: { supervisor: { select: { name: true } }, site: { select: { siteName: true } } },
      }),
      prisma.incident.findMany({
        where:   { occurredAt: { gte: targetDate, lt: nextDay } },
        include: { site: { select: { siteName: true } } },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    const reportTitle = await settingsService.getReportTitle('daily_operations_report');

    // Sheet 1: Summary
    const summary = wb.addWorksheet('Summary');
    const excelTitle = reportTitle.shortTitle && reportTitle.shortTitle !== REPORT_TITLE_DEFAULTS.daily_operations_report.shortTitle
      ? reportTitle.shortTitle
      : reportTitle.title === REPORT_TITLE_DEFAULTS.daily_operations_report.title
        ? (reportTitle.shortTitle ?? reportTitle.title) : reportTitle.title;
    summary.addRow([excelTitle]);
    summary.getRow(1).font = { bold: true, size: 14 };
    summary.addRow([`Date: ${targetDate.toLocaleDateString('en-UG')}`]);
    summary.addRow([]);
    summary.addRow(['Metric', 'Value']);
    styleHeader(summary.getRow(4));
    const statusCounts = attendance.reduce((acc: Record<string, number>, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});
    [
      ['Guards Deployed',          deployments.length],
      ['Present',                  statusCounts['PRESENT'] ?? 0],
      ['Absent',                   statusCounts['ABSENT']  ?? 0],
      ['Late',                     statusCounts['LATE']    ?? 0],
      ['AWOL',                     statusCounts['AWOL']    ?? 0],
      ['Supervisor Check-ins',     checkins.length],
      ['Incidents',                incidents.length],
    ].forEach(([k, v], i) => {
      summary.addRow([k, v]);
      styleRow(summary.getRow(5 + i), i);
    });
    summary.getColumn(1).width = 30;
    summary.getColumn(2).width = 15;

    // Sheet 2: Deployment Detail
    const detail = wb.addWorksheet('Deployment Detail');
    detail.addRow(['Guard', 'Site', 'Attendance Status']);
    styleHeader(detail.getRow(1));
    const attMap = new Map(attendance.map(a => [a.guardId + a.siteId, a]));
    deployments.forEach((d, i) => {
      const att = attMap.get(d.guardId + d.siteId);
      const row = detail.addRow([
        `${d.guard.firstName} ${d.guard.lastName}`,
        d.site.siteName,
        att?.status ?? 'NOT MARKED',
      ]);
      styleRow(row, i);
    });
    [1, 2, 3].forEach((c, i) => { detail.getColumn(i + 1).width = [25, 25, 18][i]; });

    // Sheet 3: Incidents
    const incSheet = wb.addWorksheet('Incidents');
    incSheet.addRow(['Site', 'Type', 'Severity', 'Occurred At', 'Description']);
    styleHeader(incSheet.getRow(1));
    incidents.forEach((inc, i) => {
      const row = incSheet.addRow([
        inc.site.siteName, inc.incidentType, inc.severity,
        new Date(inc.occurredAt).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' }),
        inc.description.substring(0, 100),
      ]);
      styleRow(row, i);
    });
    [25, 20, 12, 22, 50].forEach((w, i) => { incSheet.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async generateARAgingExcel(): Promise<Buffer> {
    const invoices = await prisma.invoice.findMany({
      where:   { status: { in: [...OUTSTANDING_STATUSES] } },
      include: { client: { select: { clientName: true } }, payments: true },
      orderBy: { dueDate: 'asc' },
    });

    const now = Date.now();
    const bucket = (inv: any) => {
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86_400_000);
      const paid = inv.payments.reduce((s: number, p: any) => s + p.amountPaid, 0);
      // Balances are written straight into Excel cells, and invoice amounts are
      // double precision, so the subtraction needs snapping to the shilling's
      // two decimals or a figure like 2,500,000.4999999 lands in the workbook.
      const bal  = round2(inv.totalAmount - paid);
      if (days <= 0)  return { label: 'current',  days, balance: bal };
      if (days <= 30) return { label: 'days1_30',  days, balance: bal };
      if (days <= 60) return { label: 'days31_60', days, balance: bal };
      if (days <= 90) return { label: 'days61_90', days, balance: bal };
      return              { label: 'over90',      days, balance: bal };
    };

    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet('Summary');
    summary.addRow(['Bucket', 'Amount (UGX)']);
    styleHeader(summary.getRow(1));
    const totals: Record<string, number> = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 };
    for (const inv of invoices) { const b = bucket(inv); totals[b.label] += b.balance; }
    [['Current (0-30)', totals.days1_30 + totals.current], ['31-60 days', totals.days31_60], ['61-90 days', totals.days61_90], ['Over 90 days', totals.over90]]
      .forEach(([k, v], i) => { const r = summary.addRow([k, round2(v as number)]); styleRow(r, i); });
    [30, 20].forEach((w, i) => { summary.getColumn(i + 1).width = w; });

    const detail = wb.addWorksheet('Invoice Detail');
    detail.addRow(['Client', 'Invoice #', 'Due Date', 'Total (UGX)', 'Days Overdue', 'Balance (UGX)']);
    styleHeader(detail.getRow(1));
    invoices.forEach((inv, i) => {
      const b = bucket(inv);
      const r = detail.addRow([
        inv.client.clientName,
        inv.invoiceNumber,
        new Date(inv.dueDate).toLocaleDateString('en-UG'),
        inv.totalAmount,
        Math.max(0, b.days),
        b.balance,
      ]);
      styleRow(r, i);
    });
    [25, 22, 15, 18, 14, 18].forEach((w, i) => { detail.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * The full payroll for a service month: every run in the period - each
   * zone, any company-wide run and the staff run - in one workbook. A month
   * can hold several runs (one per zone plus staff), so a single run is not
   * the full payroll the reports card promises. The summary foots each run
   * to a period total; the detail sheet carries every payslip.
   */
  async generateMonthlyPayrollExcel(month: number, year: number): Promise<Buffer> {
    const runs = await prisma.payrollRun.findMany({
      where:   { month, year },
      orderBy: [{ runType: 'asc' }, { createdAt: 'asc' }],
      include: {
        zone: { select: { name: true } },
        payslips: {
          include: {
            guard: { select: { firstName: true, lastName: true, phone: true } },
            user:  { select: { name: true } },
          },
        },
      },
    });

    const runLabel = (run: (typeof runs)[number]): string =>
      run.zone?.name
        ?? (run.runType === 'STAFF' ? 'Staff (all departments)' : 'Company-wide (all zones)');

    const wb = new ExcelJS.Workbook();
    const reportTitle = await settingsService.getReportTitle('monthly_payroll_report');
    const summary = wb.addWorksheet('Summary');
    const payrollHeading = reportTitle.shortTitle && reportTitle.shortTitle !== REPORT_TITLE_DEFAULTS.monthly_payroll_report.shortTitle
      ? reportTitle.shortTitle
      : reportTitle.title === REPORT_TITLE_DEFAULTS.monthly_payroll_report.title
        ? (reportTitle.shortTitle ?? reportTitle.title) : reportTitle.title;
    summary.addRow([`${payrollHeading} ${month}/${year}`]);
    summary.getRow(1).font = { bold: true, size: 14 };
    summary.addRow([]);
    if (runs.length) {
      const head = summary.addRow([
        'Run', 'Type', 'Status', 'Payslips',
        'Gross (UGX)', 'Deductions (UGX)', 'Net (UGX)',
      ]);
      styleHeader(head);
      let payslipsTotal = 0;
      let grossTotal    = 0;
      let dedTotal      = 0;
      let netTotal      = 0;
      runs.forEach((run, i) => {
        const r = summary.addRow([
          runLabel(run),
          run.runType,
          run.status,
          run.payslips.length,
          run.totalGross,
          run.totalDeductions,
          run.totalNet,
        ]);
        styleRow(r, i);
        payslipsTotal += run.payslips.length;
        grossTotal    += run.totalGross;
        dedTotal      += run.totalDeductions;
        netTotal      += run.totalNet;
      });
      const totalRow = summary.addRow([
        `TOTAL (${runs.length} run${runs.length === 1 ? '' : 's'})`, '', '',
        payslipsTotal, grossTotal, dedTotal, netTotal,
      ]);
      totalRow.font = { bold: true };
      summary.addRow([]);
      summary.addRow(['Statuses shown are live; DRAFT runs are not yet approved.']);
    } else {
      summary.addRow(['No payroll run found for this period']);
    }
    [30, 9, 14, 10, 17, 19, 17].forEach((w, i) => { summary.getColumn(i + 1).width = w; });

    const detail = wb.addWorksheet('Payroll Detail');
    detail.addRow([
      'Run', 'Type', 'Name', 'Gross (UGX)', 'Deductions (UGX)',
      'Net (UGX)', 'Phone', 'Days Worked', 'Disbursement',
    ]);
    styleHeader(detail.getRow(1));
    let rowIdx = 0;
    for (const run of runs) {
      const label = runLabel(run);
      const type  = run.runType === 'STAFF' ? 'STAFF' : 'GUARD';
      for (const ps of run.payslips) {
        const name = [ps.guard?.firstName, ps.guard?.lastName].filter(Boolean).join(' ')
          || ps.guardNameSnapshot
          || ps.user?.name
          || '';
        const r = detail.addRow([
          label,
          type,
          name,
          ps.grossSalary,
          ps.totalDeductions,
          ps.netSalary,
          ps.guard ? (displayPhone(ps.guard.phone) ?? '') : '',
          ps.daysWorked,
          (run.status === 'MD_APPROVED' ? 'Cleared' : (ps.disbursementStatus || 'Pending')),
        ]);
        styleRow(r, rowIdx++);
      }
    }
    [30, 9, 26, 16, 19, 16, 16, 13, 15].forEach((w, i) => { detail.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Structured (JSON) form of the monthly payroll - every run in the period
   * with its payslips - for the on-screen Payroll Report page. The Excel
   * builder above is the download twin of this.
   */
  async getMonthlyPayroll(month: number, year: number) {
    const runs = await prisma.payrollRun.findMany({
      where:   { month, year },
      orderBy: [{ runType: 'asc' }, { createdAt: 'asc' }],
      include: {
        zone: { select: { name: true } },
        payslips: {
          include: {
            guard: { select: { firstName: true, lastName: true, phone: true } },
            user:  { select: { name: true } },
          },
        },
      },
    });

    const mapped = runs.map((run) => {
      const zoneName = run.zone?.name
        ?? (run.runType === 'STAFF' ? 'Staff (all departments)' : 'Company-wide (all zones)');
      const payslips = run.payslips.map((ps) => ({
        id: ps.id,
        name: [ps.guard?.firstName, ps.guard?.lastName].filter(Boolean).join(' ')
          || (ps as any).guardNameSnapshot
          || ps.user?.name
          || '',
        grossSalary: ps.grossSalary,
        totalDeductions: ps.totalDeductions,
        netSalary: ps.netSalary,
        phone: ps.guard ? (displayPhone(ps.guard.phone) ?? '') : '',
        daysWorked: ps.daysWorked,
        disbursementStatus: (run.status === 'MD_APPROVED' ? 'Cleared' : (ps.disbursementStatus || 'Pending')),
      }));
      return {
        id: run.id,
        runType: run.runType,
        status: run.status,
        zoneName,
        totalGuards: run.totalGuards,
        totalStaff: run.totalStaff,
        totalGross: run.totalGross,
        totalDeductions: run.totalDeductions,
        totalNet: run.totalNet,
        payslips,
      };
    });

    const totals = {
      runs: mapped.length,
      payslips: mapped.reduce((a, r) => a + r.payslips.length, 0),
      gross: mapped.reduce((a, r) => a + r.totalGross, 0),
      deductions: mapped.reduce((a, r) => a + r.totalDeductions, 0),
      net: mapped.reduce((a, r) => a + r.totalNet, 0),
    };

    return { month, year, runs: mapped, totals, hasPayroll: mapped.length > 0 };
  }

  /**
   * Deployment report - daily or monthly. Detailed per-guard deployment log
   * with attendance (present/absent), days worked and transfer history.
   */
  async getDeploymentReport(params: { month: number; year: number; day?: number }) {
    const { month, year, day } = params;
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd   = new Date(Date.UTC(year, month, 1));

    // Daily mode
    if (day) {
      const target = new Date(Date.UTC(year, month - 1, day));
      const next   = new Date(target.getTime() + 86_400_000);
      const [deployments, attendance] = await Promise.all([
        prisma.deployment.findMany({
          where: { date: { gte: target, lt: next } },
          include: {
            guard: { select: { id: true, firstName: true, lastName: true, phone: true } },
            site:  { select: { siteName: true, zone: { select: { name: true } } } },
          },
          orderBy: [{ site: { siteName: 'asc' } }],
        }),
        prisma.attendanceRecord.findMany({
          where: { date: { gte: target, lt: next } },
          select: { guardId: true, siteId: true, status: true, notes: true },
        }),
      ]);
      const attMap = new Map(attendance.map((a) => [a.guardId + '|' + a.siteId, a]));
      const rows = deployments.map((d) => {
        const att = attMap.get(d.guardId + '|' + d.siteId);
        return {
          date: target.toISOString().slice(0, 10),
          guardId: d.guard.id,
          guardName: `${d.guard.firstName} ${d.guard.lastName}`.trim(),
          siteName: d.site.siteName,
          zoneName: d.site.zone?.name ?? 'Unzoned',
          shiftType: d.shiftType,
          deploymentType: d.deploymentType,
          attendanceStatus: att?.status ?? 'NOT_MARKED',
          notes: att?.notes ?? null,
        };
      });
      const present = rows.filter((r) => r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'LATE').length;
      const absent  = rows.filter((r) => r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL').length;
      return {
        mode: 'daily' as const,
        period: { month, year, day },
        summary: {
          total: rows.length,
          present,
          absent,
          notMarked: rows.length - present - absent,
          uniqueGuards: new Set(rows.map((r) => r.guardId)).size,
          uniqueSites: new Set(rows.map((r) => r.siteName)).size,
        },
        deployments: rows,
        guards: [],
        transfers: [],
      };
    }

    // Monthly mode
    const [deployments, attendance, transfers] = await Promise.all([
      prisma.deployment.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
        include: {
          guard: { select: { id: true, firstName: true, lastName: true, phone: true } },
          site:  { select: { siteName: true, zone: { select: { name: true } } } },
        },
        orderBy: [{ date: 'asc' }],
      }),
      prisma.attendanceRecord.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
        select: { guardId: true, siteId: true, date: true, status: true },
      }),
      prisma.guardTransfer.findMany({
        where: { transferDate: { gte: monthStart, lt: monthEnd } },
        include: {
          guard: { select: { firstName: true, lastName: true } },
          fromSite: { select: { siteName: true, zone: { select: { name: true } } } },
          toSite:   { select: { siteName: true, zone: { select: { name: true } } } },
          authorisedByUser: { select: { name: true } },
        },
        orderBy: [{ transferDate: 'asc' }],
      }),
    ]);

    const attMap = new Map(attendance.map((a) => [a.guardId + '|' + a.siteId + '|' + a.date.toISOString().slice(0, 10), a]));

    const detailed = deployments.map((d) => {
      const key = d.guardId + '|' + d.siteId + '|' + d.date.toISOString().slice(0, 10);
      const att = attMap.get(key);
      return {
        date: d.date.toISOString().slice(0, 10),
        guardId: d.guard.id,
        guardName: `${d.guard.firstName} ${d.guard.lastName}`.trim(),
        siteName: d.site.siteName,
        zoneName: d.site.zone?.name ?? 'Unzoned',
        shiftType: d.shiftType,
        deploymentType: d.deploymentType,
        attendanceStatus: att?.status ?? 'NOT_MARKED',
      };
    });

    // Per-guard summary
    const guardMap = new Map<string, {
      guardId: string; guardName: string; siteName: string; zoneName: string;
      daysDeployed: number; daysPresent: number; daysAbsent: number; daysNotMarked: number;
    }>();
    for (const d of deployments) {
      const name = `${d.guard.firstName} ${d.guard.lastName}`.trim();
      if (!guardMap.has(d.guard.id)) {
        guardMap.set(d.guard.id, {
          guardId: d.guard.id, guardName: name,
          siteName: d.site.siteName, zoneName: d.site.zone?.name ?? 'Unzoned',
          daysDeployed: 0, daysPresent: 0, daysAbsent: 0, daysNotMarked: 0,
        });
      }
      const g = guardMap.get(d.guard.id)!;
      g.daysDeployed += 1;
      // latest site
      g.siteName = d.site.siteName;
      g.zoneName = d.site.zone?.name ?? 'Unzoned';
      const key = d.guardId + '|' + d.siteId + '|' + d.date.toISOString().slice(0, 10);
      const att = attMap.get(key);
      if (att) {
        if (att.status === 'PRESENT' || att.status === 'LATE') g.daysPresent += 1;
        else if (att.status === 'ABSENT' || att.status === 'AWOL') g.daysAbsent += 1;
        else g.daysNotMarked += 1;
      } else {
        g.daysNotMarked += 1;
      }
    }
    const guards = [...guardMap.values()].sort((a, b) => a.guardName.localeCompare(b.guardName));

    const present = detailed.filter((r) => r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'LATE').length;
    const absent  = detailed.filter((r) => r.attendanceStatus === 'ABSENT' || r.attendanceStatus === 'AWOL').length;

    const transferRows = transfers.map((t) => ({
      date: t.transferDate.toISOString().slice(0, 10),
      guardName: `${t.guard.firstName} ${t.guard.lastName}`.trim(),
      fromSite: t.fromSite?.siteName ?? '?',
      fromZone: t.fromSite?.zone?.name ?? '?',
      toSite: t.toSite.siteName,
      toZone: t.toSite.zone?.name ?? '?',
      reason: t.reason,
      authorisedBy: t.authorisedByUser?.name ?? '?',
    }));

    return {
      mode: 'monthly' as const,
      period: { month, year },
      summary: {
        totalDeployments: detailed.length,
        present,
        absent,
        notMarked: detailed.length - present - absent,
        uniqueGuards: guards.length,
        uniqueSites: new Set(detailed.map((r) => r.siteName)).size,
        totalTransfers: transferRows.length,
      },
      deployments: detailed,
      guards,
      transfers: transferRows,
    };
  }

  async generateInventoryLedgerExcel(): Promise<Buffer> {
    // Inventory module not yet built — return placeholder
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory Ledger');
    ws.addRow(['Inventory module coming in a future sprint']);
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Approved salaries for a service month, counted from the payslips that
   * will actually be paid — an HR adjustment supersedes the computed net, and
   * PayrollRun.totalNet is only a snapshot from calculation time (two live
   * runs already disagree with their payslips).
   */
  private async committedPayroll(year: number, month: number) {
    const runs = await prisma.payrollRun.findMany({
      where:   { year, month, status: { in: COMMITTED_RUN_STATUSES } },
      orderBy: { id: 'asc' },
      select:  {
        id: true, month: true, year: true, runType: true, status: true, approvedAt: true,
        zone: { select: { name: true } },
      },
    });
    const slips = runs.length === 0 ? [] : await prisma.payslip.findMany({
      where:  { payrollRunId: { in: runs.map(r => r.id) } },
      select: { payrollRunId: true, hrAdjustedAmount: true, netSalary: true },
    });
    const byRun = new Map<string, number>();
    for (const s of slips) {
      byRun.set(s.payrollRunId, (byRun.get(s.payrollRunId) ?? 0) + (s.hrAdjustedAmount ?? s.netSalary));
    }
    const detailed = runs.map(r => ({ ...r, committed: byRun.get(r.id) ?? 0 }));
    return { runs: detailed, total: detailed.reduce((s, r) => s + r.committed, 0) };
  }

  /** Director-approved requisitions raised during the month, at their approved amounts. */
  private async committedRequisitions(month: number, year: number) {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);
    const reqs = await prisma.requisition.findMany({
      where:   { status: { in: COMMITTED_REQ_STATUSES }, date: { gte: periodStart, lte: periodEnd } },
      orderBy: { date: 'asc' },
      select:  { id: true, particulars: true, date: true, status: true, amount: true },
    });
    return { reqs, total: reqs.reduce((s, r) => s + r.amount, 0) };
  }

  /**
   * "How much have I made this month, and what did I spend?"
   *
   * Money in is cash received (the ledger). Money out is what the month
   * *spent*: approved salaries for that service month (split guards vs
   * staff), requisitions handed out that month, and manual ledger
   * expenses — so net revenue is honest before a shilling has been
   * disbursed. `paidOut` keeps the cash view (what actually left the
   * bank). Ledger payouts of these same commitments carry a sourceRef
   * and feed paidOut only, never the expense totals — nothing can
   * be counted twice.
   */
  async getIncomeExpenses(month: number, year: number): Promise<IncomeExpensesReport> {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('month must be 1-12');
    }
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);

    const [entries, prior, payroll, committedReqs] = await Promise.all([
      prisma.cashbookEntry.findMany({
        where:   { date: { gte: periodStart, lte: periodEnd } },
        orderBy: { date: 'asc' },
      }),
      // Opening cash: everything the ledger holds before this period.
      prisma.cashbookEntry.findMany({
        where:   { date: { lt: periodStart } },
        select:  { type: true, amount: true },
      }),
      this.committedPayroll(year, month),
      this.committedRequisitions(month, year),
    ]);

    const manualOut       = entries.filter(e => e.type === 'OUT' && !e.sourceRef);
    const totalIn         = entries.filter(e => e.type === 'IN').reduce((s, e) => s + e.amount, 0);
    const paidOut         = entries.filter(e => e.type === 'OUT').reduce((s, e) => s + e.amount, 0);
    const manualTotal     = manualOut.reduce((s, e) => s + e.amount, 0);
    const totalOut        = payroll.total + committedReqs.total + manualTotal;
    const openingBalance  = prior.reduce((s, e) => s + (e.type === 'IN' ? e.amount : -e.amount), 0);

    const group = (rows: { category: string; amount: number }[]) => {
      const byCat = new Map<string, { count: number; amount: number }>();
      for (const e of rows) {
        const cur = byCat.get(e.category) ?? { count: 0, amount: 0 };
        cur.count  += 1;
        cur.amount += e.amount;
        byCat.set(e.category, cur);
      }
      return byCat;
    };

    const income = [...group(entries.filter(e => e.type === 'IN')).entries()]
      .map(([category, v]) => ({ category, count: v.count, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount);

    const expenses: IncomeExpensesReport['expenses'] = [];
    // Payroll splits by who is being paid — guard salaries and staff salaries
    // are different cost centres to the MD, and lumping them into one "PAYROLL"
    // row hides which side of the business ate the month.
    const payrollByType = new Map<string, { count: number; amount: number }>();
    for (const r of payroll.runs) {
      const key = r.runType === 'STAFF' ? 'STAFF' : 'GUARDS';
      const cur = payrollByType.get(key) ?? { count: 0, amount: 0 };
      cur.count  += 1;
      cur.amount += r.committed;
      payrollByType.set(key, cur);
    }
    for (const [category, v] of payrollByType) {
      expenses.push({ source: 'PAYROLL', category, count: v.count, amount: v.amount });
    }
    if (committedReqs.total > 0) {
      expenses.push({ source: 'REQUISITION', category: 'REQUISITION', count: committedReqs.reqs.length, amount: committedReqs.total });
    }
    for (const [category, v] of group(manualOut)) {
      expenses.push({ source: 'MANUAL', category, count: v.count, amount: v.amount });
    }
    expenses.sort((a, b) => b.amount - a.amount);

    const ledgerRows: IncomeExpensesReport['entries'] = entries.map(e => ({
      date:        e.date.toISOString(),
      description: e.description,
      category:    e.category,
      type:        e.type as 'IN' | 'OUT',
      amount:      e.amount,
      source:      'LEDGER',
    }));

    // The commitments themselves, so the detail table explains the Out total.
    // A run is dated at its service month's end (that is the month it belongs
    // to); the approval moment rides in the description for context.
    const committedRows: IncomeExpensesReport['entries'] = [
      ...payroll.runs.map(r => ({
        date:        periodEnd.toISOString(),
        description: `Payroll ${String(r.month).padStart(2, '0')}/${r.year} ${r.runType} run`
          + `${r.zone ? ` - ${r.zone.name}` : ''} (${r.status.replace(/_/g, ' ')})`
          + `${r.approvedAt ? ` approved ${fmtDayMonth(r.approvedAt)}` : ''}`,
        category:    'PAYROLL',
        type:        'OUT' as const,
        amount:      r.committed,
        source:      'COMMITTED' as const,
      })),
      ...committedReqs.reqs.map(r => ({
        date:        r.date.toISOString(),
        description: (r.particulars.length > 90 ? `${r.particulars.slice(0, 87)}...` : r.particulars)
          + ` (${r.status.replace(/_/g, ' ')})`,
        category:    'REQUISITION',
        type:        'OUT' as const,
        amount:      r.amount,
        source:      'COMMITTED' as const,
      })),
    ];
    const merged = [...ledgerRows, ...committedRows]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      month,
      year,
      openingBalance,
      totalIn,
      totalOut,
      paidOut,
      netRevenue:    totalIn - totalOut,
      closingBalance: openingBalance + totalIn - paidOut,
      income,
      expenses,
      entries: merged,
    };
  }

  /**
   * "Which client pays us most, which cost eats us most, and how have the
   * last six months looked?" — the MD's business analysis for one service
   * month. Client payments (manual + mobile-money gateway) are grouped by
   * their invoices' service month — the same dating the ledger now uses, so
   * a September invoice paid in October lands in September. Costs and the
   * money-in denominator come straight from getIncomeExpenses, and the
   * six-month trend reads the ledger, so nothing here can disagree with the
   * month report above it.
   */
  async getBusinessAnalysis(month: number, year: number): Promise<BusinessAnalysisReport> {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('month must be 1-12');
    }
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);

    const [manualPays, gatewayPays, ie, trendRows, pendingRows, overdueRows, pendingAgg, overdueAgg] = await Promise.all([
      prisma.payment.findMany({
        where:  {
          status: 'APPROVED',
          invoice: { periodStart: { gte: periodStart, lte: periodEnd } },
        },
        select: { amountPaid: true, invoice: { select: { id: true, clientId: true, client: { select: { clientName: true } } } } },
      }),
      prisma.invoicePayment.findMany({
        where:  {
          status: 'SUCCESS',
          invoice: { periodStart: { gte: periodStart, lte: periodEnd } },
        },
        select: { amountPaid: true, invoice: { select: { id: true, clientId: true, client: { select: { clientName: true } } } } },
      }),
      this.getIncomeExpenses(month, year),
      prisma.cashbookEntry.findMany({
        where:  { date: { gte: new Date(year, month - 7, 1), lte: periodEnd } },
        select: { date: true, type: true, amount: true },
      }),
      // ── The action block: live, deliberately not scoped to the month ──────
      // Payments the MD still has to sign off, oldest first (they gate the
      // ledger posting, so approving one moves Money In).
      prisma.payment.findMany({
        where:   { status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'asc' },
        take:    10,
        select:  {
          id: true, amountPaid: true, mode: true, paymentDate: true, createdAt: true,
          invoice: { select: { invoiceNumber: true, client: { select: { clientName: true } } } },
        },
      }),
      // Past-due and still owed: dueDate beats status here, because a sweep
      // may not have flipped a stale PENDING to OVERDUE yet — the money is
      // late either way.
      prisma.invoice.findMany({
        where:   {
          dueDate: { lt: startOfDay(new Date()) },
          status:  { in: [...OUTSTANDING_STATUSES] },
          outstandingBalance: { gt: 0 },
        },
        orderBy: { outstandingBalance: 'desc' },
        take:    10,
        select:  {
          id: true, invoiceNumber: true, outstandingBalance: true, dueDate: true,
          client: { select: { clientName: true } },
        },
      }),
      prisma.payment.aggregate({
        _sum:   { amountPaid: true },
        _count: true,
        where:  { status: 'PENDING_APPROVAL' },
      }),
      prisma.invoice.aggregate({
        _sum:  { outstandingBalance: true },
        _count: true,
        where: {
          dueDate: { lt: startOfDay(new Date()) },
          status:  { in: [...OUTSTANDING_STATUSES] },
          outstandingBalance: { gt: 0 },
        },
      }),
    ]);

    const byClient = new Map<string, { clientName: string; invoiceIds: Set<string>; amount: number }>();
    const addPay = (amount: number, invoiceId: string, clientId: string, clientName: string) => {
      const cur = byClient.get(clientId) ?? { clientName, invoiceIds: new Set<string>(), amount: 0 };
      cur.invoiceIds.add(invoiceId);
      cur.amount += amount;
      byClient.set(clientId, cur);
    };
    for (const p of manualPays)  addPay(p.amountPaid, p.invoice.id, p.invoice.clientId, p.invoice.client.clientName);
    for (const p of gatewayPays) addPay(p.amountPaid, p.invoice.id, p.invoice.clientId, p.invoice.client.clientName);

    const totalIn = ie.totalIn;
    const topClients = [...byClient.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.clientName,
        invoices:   v.invoiceIds.size,
        amount:     Math.round(v.amount),
        share:      totalIn > 0 ? Math.round((v.amount / totalIn) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trend: BusinessAnalysisReport['trend'] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      trend.push({
        key:      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label:    LABELS[d.getMonth()],
        moneyIn:  0,
        moneyOut: 0,
        net:      0,
      });
    }
    const bucketOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const r of trendRows) {
      const b = trend.find(m => m.key === bucketOf(r.date));
      if (!b) continue;
      if (r.type === 'IN') b.moneyIn += r.amount;
      else                 b.moneyOut += r.amount;
    }
    for (const b of trend) b.net = b.moneyIn - b.moneyOut;

    const today = startOfDay(new Date());
    const actions: BusinessAnalysisReport['actions'] = {
      pendingPayments: pendingRows.map(p => ({
        id:            p.id,
        invoiceNumber: p.invoice.invoiceNumber,
        clientName:    p.invoice.client.clientName,
        amount:        Math.round(p.amountPaid),
        mode:          p.mode,
        paymentDate:   p.paymentDate ? p.paymentDate.toISOString() : null,
        createdAt:     p.createdAt.toISOString(),
      })),
      pendingTotal: Math.round(pendingAgg._sum.amountPaid ?? 0),
      pendingCount: pendingAgg._count,
      overdueInvoices: overdueRows.map(i => ({
        id:            i.id,
        invoiceNumber: i.invoiceNumber,
        clientName:    i.client.clientName,
        outstanding:   Math.round(i.outstandingBalance),
        dueDate:       i.dueDate.toISOString(),
        daysOverdue:   Math.max(0, Math.floor((today.getTime() - startOfDay(i.dueDate).getTime()) / 86_400_000)),
      })),
      overdueCount: overdueAgg._count,
      overdueTotal: Math.round(overdueAgg._sum.outstandingBalance ?? 0),
    };

    return {
      month,
      year,
      totalIn,
      totalOut: ie.totalOut,
      topClients,
      costs: ie.expenses,
      trend,
      actions,
    };
  }

  /**
   * The same four figures the report opens with, aggregates only — the
   * dashboard reads these so its tiles can never disagree with the report.
   */
  async getMonthSummary(year: number, month: number): Promise<{
    moneyIn: number; moneyOut: number; paidOut: number; netRevenue: number;
  }> {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);
    const [inAgg, outAgg, manualAgg, payroll, reqAgg] = await Promise.all([
      prisma.cashbookEntry.aggregate({ _sum: { amount: true }, where: { type: 'IN',  date: { gte: periodStart, lte: periodEnd } } }),
      prisma.cashbookEntry.aggregate({ _sum: { amount: true }, where: { type: 'OUT', date: { gte: periodStart, lte: periodEnd } } }),
      // Manual expenses only: auto payouts (sourceRef set) are the paid side
      // of the payroll/requisition figures, never a second expense.
      prisma.cashbookEntry.aggregate({ _sum: { amount: true }, where: { type: 'OUT', sourceRef: null, date: { gte: periodStart, lte: periodEnd } } }),
      this.committedPayroll(year, month),
      prisma.requisition.aggregate({ _sum: { amount: true }, where: { status: { in: COMMITTED_REQ_STATUSES }, date: { gte: periodStart, lte: periodEnd } } }),
    ]);
    const moneyIn  = inAgg._sum.amount ?? 0;
    const paidOut  = outAgg._sum.amount ?? 0;
    const moneyOut = payroll.total + (reqAgg._sum.amount ?? 0) + (manualAgg._sum.amount ?? 0);
    return { moneyIn, moneyOut, paidOut, netRevenue: moneyIn - moneyOut };
  }

  /** The same figures as a workbook: summary, income, expenses, entries. */
  async generateIncomeExpensesExcel(month: number, year: number): Promise<Buffer> {
    const report = await this.getIncomeExpenses(month, year);
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const heading = `Income & Expenses — ${MONTH_NAMES[month - 1]} ${year}`;

    const wb = new ExcelJS.Workbook();

    const summary = wb.addWorksheet('Summary');
    summary.addRow([heading]);
    summary.getRow(1).font = { bold: true, size: 14 };
    const basis = summary.addRow(['Money Out = salaries given out (guards + staff) + requisitions handed out + manual expenses; Paid Out = cash actually spent.']);
    basis.font = { italic: true, color: { argb: 'FF6C757D' } };
    summary.addRow([]);
    summary.addRow(['Opening Balance (UGX)', report.openingBalance]);
    summary.addRow(['Money In (UGX)',        report.totalIn]);
    summary.addRow(['Money Out (UGX)',       report.totalOut]);
    summary.addRow(['Net Revenue (UGX)',     report.netRevenue]);
    summary.addRow(['Paid Out (UGX)',        report.paidOut]);
    summary.addRow(['Cash Closing (UGX)',    report.closingBalance]);
    summary.getColumn(1).width = 26;
    summary.getColumn(2).width = 20;

    const income = wb.addWorksheet('Money In');
    income.addRow(['Category', 'Entries', 'Amount (UGX)']);
    styleHeader(income.getRow(1));
    report.income.forEach((r, i) => {
      const row = income.addRow([r.category, r.count, r.amount]);
      styleRow(row, i);
    });
    const incTotal = income.addRow(['Total', report.income.reduce((s, r) => s + r.count, 0), report.totalIn]);
    incTotal.font = { bold: true };
    [24, 12, 20].forEach((w, i) => { income.getColumn(i + 1).width = w; });

    const expenses = wb.addWorksheet('Money Out');
    expenses.addRow(['Source', 'Category', 'Entries', 'Amount (UGX)']);
    styleHeader(expenses.getRow(1));
    report.expenses.forEach((r, i) => {
      const row = expenses.addRow([r.source, r.category, r.count, r.amount]);
      styleRow(row, i);
    });
    const expTotal = expenses.addRow(['', 'Total', report.expenses.reduce((s, r) => s + r.count, 0), report.totalOut]);
    expTotal.font = { bold: true };
    [16, 24, 12, 20].forEach((w, i) => { expenses.getColumn(i + 1).width = w; });

    const detail = wb.addWorksheet('Entries');
    detail.addRow(['Date', 'Description', 'Category', 'Type', 'Source', 'Amount (UGX)']);
    styleHeader(detail.getRow(1));
    report.entries.forEach((e, i) => {
      const row = detail.addRow([
        new Date(e.date).toLocaleDateString('en-UG'),
        e.description,
        e.category,
        e.type,
        e.source,
        e.amount,
      ]);
      styleRow(row, i);
    });
    [14, 46, 20, 8, 12, 20].forEach((w, i) => { detail.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /** The business analysis as a workbook: summary, clients, costs, trend, actions. */
  async generateBusinessAnalysisExcel(month: number, year: number): Promise<Buffer> {
    const report = await this.getBusinessAnalysis(month, year);
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const heading = `Business Analysis — ${MONTH_NAMES[month - 1]} ${year}`;

    const wb = new ExcelJS.Workbook();

    const summary = wb.addWorksheet('Summary');
    summary.addRow([heading]);
    summary.getRow(1).font = { bold: true, size: 14 };
    const basis = summary.addRow(['Money Out = salaries + requisitions + manual expenses (committed); client shares are of Money In.']);
    basis.font = { italic: true, color: { argb: 'FF6C757D' } };
    summary.addRow([]);
    summary.addRow(['Money In (UGX)',  report.totalIn]);
    summary.addRow(['Money Out (UGX)', report.totalOut]);
    summary.addRow(['Net (UGX)',       report.totalIn - report.totalOut]);
    summary.addRow([]);
    summary.addRow(['Awaiting approval (UGX)', report.actions.pendingTotal]);
    summary.addRow(['Payments pending',        report.actions.pendingPayments.length]);
    summary.addRow(['Overdue owed (UGX)',      report.actions.overdueTotal]);
    summary.addRow(['Overdue invoices',        report.actions.overdueCount]);
    summary.getColumn(1).width = 26;
    summary.getColumn(2).width = 20;

    const clients = wb.addWorksheet('Top Clients');
    clients.addRow(['#', 'Client', 'Invoices paid', 'Amount (UGX)', '% of money in']);
    styleHeader(clients.getRow(1));
    report.topClients.forEach((c, i) => {
      const row = clients.addRow([i + 1, c.clientName, c.invoices, c.amount, c.share / 100]);
      row.getCell(5).numFmt = '0.0%';
      styleRow(row, i);
    });
    [5, 36, 14, 20, 16].forEach((w, i) => { clients.getColumn(i + 1).width = w; });

    const costs = wb.addWorksheet('Where Money Went');
    costs.addRow(['Source', 'Cost line', 'Items', 'Amount (UGX)', '% of spend']);
    styleHeader(costs.getRow(1));
    report.costs.forEach((c, i) => {
      const row = costs.addRow([
        c.source,
        c.category,
        c.count,
        c.amount,
        report.totalOut > 0 ? c.amount / report.totalOut : 0,
      ]);
      row.getCell(5).numFmt = '0.0%';
      styleRow(row, i);
    });
    const costTotal = costs.addRow(['', 'Total', '', report.totalOut, report.totalOut > 0 ? 1 : 0]);
    costTotal.font = { bold: true };
    costTotal.getCell(5).numFmt = '0.0%';
    [16, 26, 10, 20, 14].forEach((w, i) => { costs.getColumn(i + 1).width = w; });

    const trend = wb.addWorksheet('Money In vs Out');
    trend.addRow(['Month', 'Money In (UGX)', 'Money Out (UGX)', 'Net (UGX)']);
    styleHeader(trend.getRow(1));
    report.trend.forEach((t, i) => {
      const row = trend.addRow([`${t.label} ${report.year}`, t.moneyIn, t.moneyOut, t.net]);
      styleRow(row, i);
    });
    [16, 20, 20, 20].forEach((w, i) => { trend.getColumn(i + 1).width = w; });

    const pending = wb.addWorksheet('Awaiting Approval');
    pending.addRow(['Client', 'Invoice', 'Amount (UGX)', 'Mode', 'Payment date', 'Recorded']);
    styleHeader(pending.getRow(1));
    report.actions.pendingPayments.forEach((p, i) => {
      const row = pending.addRow([
        p.clientName, p.invoiceNumber, p.amount, p.mode,
        p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-UG') : '',
        new Date(p.createdAt).toLocaleDateString('en-UG'),
      ]);
      styleRow(row, i);
    });
    const pendTotal = pending.addRow(['Total', '', report.actions.pendingTotal, '', '', '']);
    pendTotal.font = { bold: true };
    [34, 24, 20, 16, 14, 14].forEach((w, i) => { pending.getColumn(i + 1).width = w; });

    const overdue = wb.addWorksheet('Overdue');
    overdue.addRow(['Invoice', 'Client', 'Outstanding (UGX)', 'Due date', 'Days overdue']);
    styleHeader(overdue.getRow(1));
    report.actions.overdueInvoices.forEach((o, i) => {
      const row = overdue.addRow([
        o.invoiceNumber, o.clientName, o.outstanding,
        new Date(o.dueDate).toLocaleDateString('en-UG'), o.daysOverdue,
      ]);
      styleRow(row, i);
    });
    const odTotal = overdue.addRow(['', 'All overdue', report.actions.overdueTotal, `${report.actions.overdueCount} invoices`, '']);
    odTotal.font = { bold: true };
    [24, 34, 22, 14, 14].forEach((w, i) => { overdue.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async scheduleReport(data: ScheduledReportInput, createdBy: string): Promise<any> {
    const record = await prisma.scheduledReport.create({
      data: {
        name:       data.name,
        reportType: data.reportType,
        schedule:   data.schedule,
        recipients: data.recipients,
        isActive:   data.isActive,
        createdBy,
      },
    });

    const job = cron.schedule(
      data.schedule,
      async () => { await this.runScheduledReport(record.id); },
      { timezone: 'Africa/Kampala' },
    );
    scheduledJobs.set(record.id, job);

    return record;
  }

  async runScheduledReport(reportId: string): Promise<void> {
    const report = await prisma.scheduledReport.findUnique({ where: { id: reportId } });
    if (!report || !report.isActive) return;

    let buffer: Buffer;
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    switch (report.reportType) {
      case 'DAILY_OPS':
        buffer = await this.generateDailyOpsReport(now.toISOString().split('T')[0]); break;
      case 'MONTHLY_AR_AGING':
        buffer = await this.generateARAgingExcel(); break;
      case 'MONTHLY_PAYROLL':
        buffer = await this.generateMonthlyPayrollExcel(month, year); break;
      default:
        buffer = await this.generateDailyOpsReport(now.toISOString().split('T')[0]);
    }

    const emailPrefix = await settingsService.getScheduledReportEmailPrefix();
    await Promise.all(
      report.recipients.map(to =>
        QueueService.sendEmail({
          to,
          subject:  `${emailPrefix}: ${report.name}`,
          template: 'scheduled-report',
          data:     { reportName: report.name, generatedAt: now },
        }),
      ),
    );

    await prisma.scheduledReport.update({
      where: { id: reportId },
      data:  { lastRunAt: now },
    });
  }

  async initScheduledReports(): Promise<void> {
    const reports = await prisma.scheduledReport.findMany({ where: { isActive: true } });
    for (const report of reports) {
      const job = cron.schedule(
        report.schedule,
        async () => { await this.runScheduledReport(report.id); },
        { timezone: 'Africa/Kampala' },
      );
      scheduledJobs.set(report.id, job);
    }
  }

  cancelScheduledReport(id: string): void {
    const job = scheduledJobs.get(id);
    if (job) { job.stop(); scheduledJobs.delete(id); }
  }
}

export const reportService = new ReportService();
