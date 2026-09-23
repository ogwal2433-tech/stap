import ExcelJS from 'exceljs';
import { APP_NAME } from '../config/branding';
import cron from 'node-cron';
import prisma from '../db/prisma';
import { OUTSTANDING_STATUSES } from './invoiceService';
import { QueueService } from '../jobs/QueueService';
import type { DirectorDashboardStats, ScheduledReportInput } from '@stap/shared';

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

// ── Service ────────────────────────────────────────────────────────────────────

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
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }), revenue: 0, payroll: 0 };
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
        monthlyRevenue:       monthlyRevenueAgg._sum.totalAmount ?? 0,
        outstandingAR:        outstandingARAgg._sum.outstandingBalance ?? 0,
        payrollCostThisMonth: payrollCostAgg._sum.totalNet       ?? 0,
        overdueInvoices,
      },
      hr: {
        totalActiveGuards: totalActiveGuards,
        newThisMonth:      newGuardsThisMonth,
        expiringContracts,
        openDisciplinary,
      },
      revenueVsPayroll: months.map(m => ({ month: m.label, revenue: m.revenue, payroll: m.payroll })),
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

    // Sheet 1: Summary
    const summary = wb.addWorksheet('Summary');
    summary.addRow(['STAP Security — Daily Operations Report']);
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
        new Date(inc.occurredAt).toLocaleString('en-UG'),
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
      const bal  = inv.totalAmount - paid;
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
      .forEach(([k, v], i) => { const r = summary.addRow([k, v]); styleRow(r, i); });
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

  async generateMonthlyPayrollExcel(month: number, year: number): Promise<Buffer> {
    const run = await prisma.payrollRun.findFirst({
      where:   { month, year },
      include: {
        payslips: {
          include: { guard: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet('Summary');
    summary.addRow([`STAP Security — Payroll Report ${month}/${year}`]);
    summary.getRow(1).font = { bold: true, size: 14 };
    summary.addRow([]);
    if (run) {
      summary.addRow(['Total Guards',     run.totalGuards]);
      summary.addRow(['Total Gross (UGX)', run.totalGross]);
      summary.addRow(['Total Deductions', run.totalDeductions]);
      summary.addRow(['Total Net (UGX)',   run.totalNet]);
      summary.addRow(['Status',            run.status]);
    } else {
      summary.addRow(['No payroll run found for this period']);
    }

    const detail = wb.addWorksheet('Guard Detail');
    detail.addRow(['Guard', 'Gross (UGX)', 'Deductions (UGX)', 'Net (UGX)', 'Days Worked', 'Disbursement']);
    styleHeader(detail.getRow(1));
    (run?.payslips ?? []).forEach((ps, i) => {
      const r = detail.addRow([
        `${ps.guard.firstName} ${ps.guard.lastName}`,
        ps.grossSalary,
        ps.totalDeductions,
        ps.netSalary,
        ps.daysWorked,
        ps.disbursementStatus,
      ]);
      styleRow(r, i);
    });
    [25, 16, 18, 16, 14, 16].forEach((w, i) => { detail.getColumn(i + 1).width = w; });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async generateInventoryLedgerExcel(): Promise<Buffer> {
    // Inventory module not yet built — return placeholder
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory Ledger');
    ws.addRow(['Inventory module coming in a future sprint']);
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

    await Promise.all(
      report.recipients.map(to =>
        QueueService.sendEmail({
          to,
          subject:  `STAP Report: ${report.name}`,
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
