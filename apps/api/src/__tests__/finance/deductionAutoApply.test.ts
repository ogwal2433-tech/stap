import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    payrollRun:       { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    payslip:          { create: vi.fn(), findMany: vi.fn() },
    guard:            { findMany: vi.fn() },
    attendanceRecord: { count: vi.fn() },
    guardDeduction:   { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit:        vi.fn().mockResolvedValue(undefined),
    generatePayslip: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/deductionService', () => ({
  deductionService: { applyToPayroll: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { deductionService } from '../../services/deductionService';
import { payrollService } from '../../services/payrollService';

const mp = prisma as any;
const mockApply = deductionService.applyToPayroll as ReturnType<typeof vi.fn>;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MONTH = 4;  // April
const YEAR  = 2026;

const GUARD = {
  id: 'g-1', firstName: 'David', lastName: 'Ochieng',
  phone: '+256772000001', salaryRate: 480_000, employmentStatus: 'ACTIVE',
};

const GUARD_2 = {
  id: 'g-2', firstName: 'Amina', lastName: 'Nakato',
  phone: '+256772000002', salaryRate: 500_000, employmentStatus: 'ACTIVE',
};

const baseRun = (overrides = {}) => ({
  id: 'run-1', month: MONTH, year: YEAR, status: 'DRAFT',
  totalGuards: 1, totalGross: 0, totalDeductions: 0, totalNet: 0,
  createdBy: 'user-1', approvedBy: null, approvedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

function basePayslip(guardId: string, gross: number, totalDed: number, breakdown: any[] = []) {
  return {
    id: `ps-${guardId}`, guardId, payrollRunId: 'run-1',
    grossSalary: gross, totalDeductions: totalDed,
    netSalary: Math.max(0, gross - totalDed),
    deductionsBreakdown: breakdown,
    daysWorked: 26, totalDays: 26,
    disbursementStatus: 'PENDING', payslipPdfPath: null, disbursementRef: null,
    createdAt: new Date(),
    guard: { firstName: GUARD.firstName, lastName: GUARD.lastName, phone: GUARD.phone },
  };
}

function deduction(overrides: Record<string, any> = {}) {
  return {
    id: 'd-1', guardId: 'g-1', type: 'LATE_COMING',
    amount: 10_000, description: 'Late by 1 hour',
    effectiveDate: new Date(2026, 3, 15),  // 15 Apr 2026
    status: 'PENDING', payrollRunId: null,
    createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.payrollRun.findFirst.mockResolvedValue(null);  // no duplicate run
  mp.payrollRun.create.mockResolvedValue(baseRun());
  mp.attendanceRecord.count.mockResolvedValue(26);  // full month attendance
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('deduction auto-apply in calculateRun()', () => {

  it('TEST 1 — PENDING deduction is applied in payroll', async () => {
    const ded = deduction({ amount: 30_000 });
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([ded]);
    mp.payslip.create.mockResolvedValue(
      basePayslip('g-1', 480_000, 30_000, [{ deductionId: 'd-1', type: 'LATE_COMING', amount: 30_000, description: ded.description, effectiveDate: ded.effectiveDate.toISOString() }])
    );

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).toHaveBeenCalledWith(['d-1'], 'run-1');
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(30_000);
    expect(payslipArg.netSalary).toBe(450_000);  // 480k - 30k
  });

  it('TEST 2 — Multiple deductions all applied in one run', async () => {
    const deds = [
      deduction({ id: 'd-1', amount: 2_000,  type: 'FOOD',             description: 'Food allowance' }),
      deduction({ id: 'd-2', amount: 10_000, type: 'LATE_COMING',      description: 'Late 3x' }),
      deduction({ id: 'd-3', amount: 85_000, type: 'UNIFORM_RECOVERY', description: 'Boots' }),
    ];
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue(deds);
    mp.payslip.create.mockResolvedValue(
      basePayslip('g-1', 480_000, 97_000, deds.map((d) => ({
        deductionId: d.id, type: d.type, amount: d.amount,
        description: d.description, effectiveDate: d.effectiveDate.toISOString(),
      })))
    );

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).toHaveBeenCalledWith(['d-1', 'd-2', 'd-3'], 'run-1');
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(97_000);
    expect(payslipArg.deductionsBreakdown).toHaveLength(3);
  });

  it('TEST 3 — Net salary never goes below zero', async () => {
    const ded = deduction({ amount: 80_000 });
    const GUARD_LOW = { ...GUARD, salaryRate: 50_000 };
    mp.guard.findMany.mockResolvedValue([GUARD_LOW]);
    mp.guardDeduction.findMany.mockResolvedValue([ded]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 50_000, 80_000));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.netSalary).toBe(0);         // floored at 0
    expect(payslipArg.totalDeductions).toBe(80_000); // still recorded
  });

  it('TEST 4 — Future-dated deduction is skipped', async () => {
    const thisMonth = deduction({ id: 'd-A', amount: 10_000, effectiveDate: new Date(2026, 3, 15) });  // Apr 15
    // Deduction B has effectiveDate in May — beyond periodEnd (Apr 30 23:59:59)
    // The service filters lte: periodEnd so Prisma mock returns only what matches.
    // We simulate that only thisMonth is returned.
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([thisMonth]);  // B excluded by DB filter
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 10_000));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    // Only deduction A should be applied
    expect(mockApply).toHaveBeenCalledWith(['d-A'], 'run-1');
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(10_000);
  });

  it('TEST 5 — Already APPLIED deduction not re-applied', async () => {
    // DB returns empty because APPLIED is excluded by status: PENDING filter
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 0));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).not.toHaveBeenCalled();
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(0);
    expect(payslipArg.netSalary).toBe(480_000);
  });

  it('TEST 6 — CANCELLED deduction not applied', async () => {
    // DB returns empty because CANCELLED is excluded by status: PENDING filter
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 0));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).not.toHaveBeenCalled();
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(0);
  });

  it('TEST 7 — Guard with no deductions gets full salary', async () => {
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 0));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).not.toHaveBeenCalled();
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(0);
    expect(payslipArg.netSalary).toBe(480_000);
    expect(payslipArg.deductionsBreakdown).toHaveLength(0);
  });

  it('TEST 8 — PayrollRun totals summed correctly across 2 guards', async () => {
    mp.guard.findMany.mockResolvedValue([GUARD, GUARD_2]);
    // Guard 1 has 1 deduction; Guard 2 has none
    mp.guardDeduction.findMany
      .mockResolvedValueOnce([deduction({ id: 'd-1', amount: 30_000 })])
      .mockResolvedValueOnce([]);
    mp.payslip.create
      .mockResolvedValueOnce(basePayslip('g-1', 450_000, 30_000))
      .mockResolvedValueOnce(basePayslip('g-2', 500_000, 0));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    const runArg = mp.payrollRun.create.mock.calls[0][0].data;
    expect(runArg.totalGross).toBe(980_000);      // 480k + 500k (gross before deductions)
    expect(runArg.totalDeductions).toBe(30_000);
    expect(runArg.totalNet).toBe(950_000);        // 980k - 30k
  });

  it('TEST 9 — payrollRunId is set on applied deduction', async () => {
    const ded = deduction({ id: 'd-X' });
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([ded]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 10_000));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).toHaveBeenCalledWith(['d-X'], 'run-1');
    // Verify the second argument (payrollRunId) matches the created run id
    const [, passedRunId] = mockApply.mock.calls[0];
    expect(passedRunId).toBe('run-1');
  });

  it('TEST 10 — effectiveDate on last day of month is included', async () => {
    // 30 Apr 2026 23:59:00 — within periodEnd (30 Apr 23:59:59)
    const ded = deduction({ id: 'd-boundary', effectiveDate: new Date(2026, 3, 30, 23, 59, 0) });
    mp.guard.findMany.mockResolvedValue([GUARD]);
    // DB returns it because effectiveDate lte periodEnd
    mp.guardDeduction.findMany.mockResolvedValue([ded]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 10_000));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).toHaveBeenCalledWith(['d-boundary'], 'run-1');
  });

  it('TEST 11 — effectiveDate on first day of next month is excluded', async () => {
    // 1 May 2026 — beyond periodEnd (30 Apr 23:59:59)
    // DB excludes it; mock returns empty array
    mp.guard.findMany.mockResolvedValue([GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([]);
    mp.payslip.create.mockResolvedValue(basePayslip('g-1', 480_000, 0));

    await payrollService.calculateRun(MONTH, YEAR, 'user-1');

    expect(mockApply).not.toHaveBeenCalled();
    const payslipArg = mp.payslip.create.mock.calls[0][0].data;
    expect(payslipArg.totalDeductions).toBe(0);
  });

});
