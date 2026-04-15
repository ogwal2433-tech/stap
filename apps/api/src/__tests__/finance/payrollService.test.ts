import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    payrollRun:       { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payslip:          { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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

vi.mock('../../lib/yoPayments', () => ({
  yoPayments: {
    requestPayment: vi.fn().mockResolvedValue({
      success: true, transactionRef: 'YO-STUB', status: 'PENDING', message: 'ok',
    }),
  },
}));

// Import deductionService so we can mock applyToPayroll
vi.mock('../../services/deductionService', () => ({
  deductionService: { applyToPayroll: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { payrollService } from '../../services/payrollService';

const mp = prisma as any;

const MOCK_GUARD = {
  id: 'guard-1', firstName: 'David', lastName: 'Ochieng',
  phone: '+256772345678', salaryRate: 480000, employmentStatus: 'ACTIVE',
};

const MOCK_GUARD_2 = {
  id: 'guard-2', firstName: 'Amina', lastName: 'Nakato',
  phone: '+256782456789', salaryRate: 520000, employmentStatus: 'ACTIVE',
};

const MOCK_RUN = {
  id: 'run-1', month: 4, year: 2026, totalGuards: 2,
  totalGross: 1000000, totalDeductions: 50000, totalNet: 950000,
  status: 'DRAFT', approvedBy: null, approvedAt: null, createdBy: 'user-1',
  createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_PAYSLIP = {
  id: 'ps-1', guardId: 'guard-1', payrollRunId: 'run-1',
  grossSalary: 480000, deductionsBreakdown: [], totalDeductions: 0, netSalary: 480000,
  daysWorked: 26, totalDays: 26, payslipPdfPath: null,
  disbursementStatus: 'PENDING', disbursementRef: null, createdAt: new Date(),
  guard: MOCK_GUARD,
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.payrollRun.findFirst.mockResolvedValue(null);
  mp.payrollRun.create.mockResolvedValue(MOCK_RUN);
  mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, _count: { payslips: 2 }, payslips: [MOCK_PAYSLIP] });
  mp.payrollRun.update.mockResolvedValue({ ...MOCK_RUN, status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date(), _count: { payslips: 2 } });
  mp.guard.findMany.mockResolvedValue([MOCK_GUARD, MOCK_GUARD_2]);
  mp.attendanceRecord.count.mockResolvedValue(26); // full attendance
  mp.guardDeduction.findMany.mockResolvedValue([]);
  mp.payslip.create.mockResolvedValue(MOCK_PAYSLIP);
  mp.payslip.findMany.mockResolvedValue([MOCK_PAYSLIP]);
  mp.payslip.findUnique.mockResolvedValue(MOCK_PAYSLIP);
  mp.payslip.update.mockResolvedValue({ ...MOCK_PAYSLIP, disbursementStatus: 'SENT', disbursementRef: 'YO-STUB' });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('payrollService.calculateRun()', () => {
  it('returns correct gross for full attendance (26/26 days)', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    const summary = await payrollService.calculateRun(4, 2026, 'user-1');
    expect(summary.byGuard[0].grossSalary).toBe(480000);
    expect(summary.byGuard[0].daysWorked).toBe(26);
  });

  it('calculates pro-rata gross for partial attendance', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.attendanceRecord.count.mockResolvedValue(13); // 13/26 = 50%
    await payrollService.calculateRun(4, 2026, 'user-1');
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.grossSalary).toBe(240000); // 480000 / 2
  });

  it('applies pending deductions and reflects in totalDeductions', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([
      { id: 'ded-1', type: 'NSSF', amount: 48000, description: 'NSSF 10%' },
    ]);
    await payrollService.calculateRun(4, 2026, 'user-1');
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.totalDeductions).toBe(48000);
    expect(createData.netSalary).toBe(432000);
  });

  it('net salary never goes below 0', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([
      { id: 'ded-1', type: 'DAMAGE_LOSS', amount: 600000, description: 'Equipment' },
    ]);
    await payrollService.calculateRun(4, 2026, 'user-1');
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.netSalary).toBe(0);
  });

  it('throws 409 if run already exists for this period', async () => {
    mp.payrollRun.findFirst.mockResolvedValue(MOCK_RUN);
    await expect(payrollService.calculateRun(4, 2026, 'user-1')).rejects.toThrow('Payroll already run');
  });
});

describe('payrollService.approve()', () => {
  it('changes status from DRAFT to APPROVED', async () => {
    await payrollService.approve('run-1', 'director-1');
    expect(mp.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('throws 400 if status is not DRAFT', async () => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'APPROVED', _count: { payslips: 0 } });
    await expect(payrollService.approve('run-1', 'director-1')).rejects.toThrow('Only DRAFT');
  });

  it('queues payslip generation for each guard', async () => {
    await payrollService.approve('run-1', 'director-1');
    expect(QueueService.generatePayslip).toHaveBeenCalledTimes(1);
    expect(QueueService.generatePayslip).toHaveBeenCalledWith(
      expect.objectContaining({ guardId: 'guard-1', payrollRunId: 'run-1' }),
    );
  });
});
