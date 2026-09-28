import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    deployment:       { count: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { count: vi.fn(), findMany: vi.fn() },
    clientComplaint:  { count: vi.fn(), findMany: vi.fn() },
    requisition:      { count: vi.fn() },
    supervisorCheckin:{ count: vi.fn(), findMany: vi.fn() },
    invoice:          { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    payrollRun:       { aggregate: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    guard:            { count: vi.fn() },
    contract:         { count: vi.fn() },
    incident:         { findMany: vi.fn() },
    scheduledReport:  { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    systemSetting: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    sendEmail: vi.fn().mockResolvedValue(undefined),
    logAudit:  vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock node-cron so scheduling doesn't actually run
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockReturnValue({ stop: vi.fn() }),
  },
}));

import prisma from '../../db/prisma';
import { reportService } from '../../services/reportService';
import { settingsService } from '../../services/settingsService';

const mp = prisma as any;

// ── Common fixtures ────────────────────────────────────────────────────────────

function mockAgg(value: number) {
  return { _sum: { totalAmount: value, totalNet: value } };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsService.clearReportTitleCache();
  mp.systemSetting.findUnique.mockResolvedValue(null);

  // Scalar counts
  mp.deployment.count.mockResolvedValue(10);
  mp.attendanceRecord.count.mockResolvedValue(3);
  mp.clientComplaint.count.mockResolvedValue(2);
  mp.requisition.count.mockResolvedValue(1);
  mp.supervisorCheckin.count.mockResolvedValue(4);
  mp.invoice.count.mockResolvedValue(0);
  mp.guard.count.mockResolvedValue(50);
  mp.contract.count.mockResolvedValue(2);

  // Aggregates
  mp.invoice.aggregate.mockResolvedValue(mockAgg(5_000_000));
  mp.payrollRun.aggregate.mockResolvedValue(mockAgg(3_000_000));

  // findMany — default empty
  mp.invoice.findMany.mockResolvedValue([]);
  mp.payrollRun.findMany.mockResolvedValue([]);
  mp.payrollRun.findFirst.mockResolvedValue(null);
  mp.attendanceRecord.findMany.mockResolvedValue([]);
  mp.deployment.findMany.mockResolvedValue([]);
  mp.supervisorCheckin.findMany.mockResolvedValue([]);
  mp.incident.findMany.mockResolvedValue([]);
  mp.clientComplaint.findMany.mockResolvedValue([]);
  mp.scheduledReport.findMany.mockResolvedValue([]);
});

// ── getDirectorDashboard() ─────────────────────────────────────────────────────

describe('reportService.getDirectorDashboard()', () => {
  it('returns all required top-level sections', async () => {
    const stats = await reportService.getDirectorDashboard();

    expect(stats).toMatchObject({
      operations:      expect.any(Object),
      finance:         expect.any(Object),
      hr:              expect.any(Object),
      revenueVsPayroll: expect.any(Array),
      attendanceTrend:  expect.any(Array),
    });
  });

  it('maps scalar counts into the operations section correctly', async () => {
    const stats = await reportService.getDirectorDashboard();

    expect(stats.operations.guardsDeployedToday).toBe(10);
    expect(stats.operations.pendingApprovals).toBe(1);
  });

  it('maps aggregate values into the finance section correctly', async () => {
    mp.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { totalAmount: 8_000_000 } })  // monthlyRevenue (PAID)
      // outstandingAR sums what is owed, so a part-paid invoice reduces it by
      // the amount paid rather than dropping out of the figure entirely.
      .mockResolvedValueOnce({ _sum: { outstandingBalance: 2_000_000 } });

    const stats = await reportService.getDirectorDashboard();

    expect(stats.finance.monthlyRevenue).toBe(8_000_000);
    expect(stats.finance.outstandingAR).toBe(2_000_000);
  });

  it('builds revenueVsPayroll with 6 months of data', async () => {
    const stats = await reportService.getDirectorDashboard();

    expect(stats.revenueVsPayroll).toHaveLength(6);
    for (const bucket of stats.revenueVsPayroll) {
      expect(bucket).toMatchObject({
        month:   expect.any(String),
        revenue: expect.any(Number),
        payroll: expect.any(Number),
      });
    }
  });

  it('returns 0s for revenue/payroll when there are no records', async () => {
    mp.invoice.findMany.mockResolvedValue([]);
    mp.payrollRun.findMany.mockResolvedValue([]);

    const stats = await reportService.getDirectorDashboard();

    const total = stats.revenueVsPayroll.reduce((s, m) => s + m.revenue + m.payroll, 0);
    expect(total).toBe(0);
  });
});

// ── generateDailyOpsReport() ───────────────────────────────────────────────────

describe('reportService.generateDailyOpsReport()', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await reportService.generateDailyOpsReport('2026-04-16');

    expect(buf).toBeInstanceOf(Buffer);
    expect((buf as Buffer).length).toBeGreaterThan(0);
  });

  it('renders the configured title in the workbook without changing worksheet names', async () => {
    mp.systemSetting.findUnique.mockResolvedValue({
      key: 'report_titles', value: JSON.stringify({ daily_operations_report: { title: 'Operations Brief' } }),
    });
    const buf = await reportService.generateDailyOpsReport('2026-04-16');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    expect(wb.getWorksheet('Summary')?.getCell('A1').value).toBe('Operations Brief');
  });

  it('queries deployment and attendance for the given date', async () => {
    await reportService.generateDailyOpsReport('2026-04-16');

    expect(mp.deployment.findMany).toHaveBeenCalledOnce();
    expect(mp.attendanceRecord.findMany).toHaveBeenCalledOnce();
  });
});

// ── generateARAgingExcel() ─────────────────────────────────────────────────────

describe('reportService.generateARAgingExcel()', () => {
  it('returns a non-empty Buffer', async () => {
    mp.invoice.findMany.mockResolvedValue([]);

    const buf = await reportService.generateARAgingExcel();

    expect(buf).toBeInstanceOf(Buffer);
    expect((buf as Buffer).length).toBeGreaterThan(0);
  });
});

// ── generateMonthlyPayrollExcel() ─────────────────────────────────────────────

describe('reportService.generateMonthlyPayrollExcel()', () => {
  it('returns a non-empty Buffer', async () => {
    mp.payrollRun.findMany.mockResolvedValue([]);

    const buf = await reportService.generateMonthlyPayrollExcel(4, 2026);

    expect(buf).toBeInstanceOf(Buffer);
    expect((buf as Buffer).length).toBeGreaterThan(0);
  });
});
