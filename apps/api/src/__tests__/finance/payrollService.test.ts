import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    payrollRun:       { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payslip:          { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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

vi.mock('../../lib/xcel', () => ({
  normalisePhone:  vi.fn((p: string) => p.replace(/\D/g, '').replace(/^0/, '256')),
  detectNetwork:   vi.fn(() => 'MTN'),
  generateDisbursementRef: vi.fn((guardId: string, period: string) => `STAP-SAL-${guardId}-${period}`),
}));

vi.mock('../../lib/xcelPartner', () => ({
  generateDynamicLinkOtp: vi.fn().mockResolvedValue('DL-STUB'),
  initiateBankPayment: vi.fn().mockResolvedValue({
    success: true, message: 'ok', data: { reference: 'CUD-STUB', status: 'pending' },
  }),
}));

// Import deductionService so we can mock applyToPayroll
vi.mock('../../services/deductionService', () => ({
  deductionService: { applyToPayroll: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import * as xcel from '../../lib/xcel';
import * as xcelPartner from '../../lib/xcelPartner';
import { payrollService } from '../../services/payrollService';

const mp   = prisma as any;
const mxcel = xcel as any;
const mxcelPartner = xcelPartner as any;

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
  status: 'DRAFT', approvedBy: null, approvedAt: null,
  hrApprovedBy: null, hrApprovedAt: null, hrNotes: null,
  disbursedBy: null, disbursedAt: null, successCount: 0, failedCount: 0,
  createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_PAYSLIP = {
  id: 'ps-1', guardId: 'guard-1', payrollRunId: 'run-1',
  grossSalary: 480000, deductionsBreakdown: [], totalDeductions: 0, netSalary: 480000,
  daysWorked: 26, totalDays: 26, payslipPdfPath: null,
  disbursementStatus: 'PENDING', disbursementRef: null, disbursementFailureReason: null,
  hrFlagged: false, hrFlagReason: null, hrAdjustedAmount: null, xcelDlCode: null,
  createdAt: new Date(),
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
  mp.payslip.update.mockResolvedValue({ ...MOCK_PAYSLIP, disbursementStatus: 'SENT', disbursementRef: 'CUD-STUB' });
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
      { id: 'ded-1', type: 'NSSF', amount: 48000, description: 'NSSF 10%', effectiveDate: new Date('2026-04-15') },
    ]);
    await payrollService.calculateRun(4, 2026, 'user-1');
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.totalDeductions).toBe(48000);
    expect(createData.netSalary).toBe(432000);
  });

  it('net salary never goes below 0', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([
      { id: 'ded-1', type: 'DAMAGE_LOSS', amount: 600000, description: 'Equipment', effectiveDate: new Date('2026-04-15') },
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

describe('payrollService.hrApprove()', () => {
  beforeEach(() => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'APPROVED', _count: { payslips: 2 } });
    mp.payrollRun.update.mockResolvedValue({
      ...MOCK_RUN, status: 'HR_APPROVED', hrApprovedBy: 'hr-1', hrApprovedAt: new Date(), _count: { payslips: 2 },
    });
  });

  it('changes status from APPROVED to HR_APPROVED', async () => {
    const result = await payrollService.hrApprove('run-1', 'hr-1', 'Looks good');
    expect(result.status).toBe('HR_APPROVED');
    expect(mp.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'HR_APPROVED', hrApprovedBy: 'hr-1', hrNotes: 'Looks good' }),
      }),
    );
  });

  it('throws 400 if run is not APPROVED (e.g. still DRAFT)', async () => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'DRAFT', _count: { payslips: 2 } });
    await expect(payrollService.hrApprove('run-1', 'hr-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws NotFoundError when run does not exist', async () => {
    mp.payrollRun.findUnique.mockResolvedValue(null);
    await expect(payrollService.hrApprove('no-such', 'hr-1')).rejects.toThrow('not found');
  });
});

describe('payrollService.flagPayslip() / unflagPayslip()', () => {
  it('flags a payslip with a reason', async () => {
    mp.payslip.update.mockResolvedValue({ ...MOCK_PAYSLIP, hrFlagged: true, hrFlagReason: 'Needs review' });
    const result = await payrollService.flagPayslip({ payslipId: 'ps-1', flagReason: 'Needs review' });
    expect(result.hrFlagged).toBe(true);
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hrFlagged: true, hrFlagReason: 'Needs review', hrAdjustedAmount: null }),
      }),
    );
  });

  it('flags with an adjusted amount when provided', async () => {
    await payrollService.flagPayslip({ payslipId: 'ps-1', flagReason: 'Partial month', adjustedAmount: 200000 });
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hrAdjustedAmount: 200000 }) }),
    );
  });

  it('unflags a payslip, clearing reason and adjustment', async () => {
    await payrollService.unflagPayslip('ps-1');
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hrFlagged: false, hrFlagReason: null, hrAdjustedAmount: null },
      }),
    );
  });
});

describe('payrollService.disburse()', () => {
  beforeEach(() => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'HR_APPROVED' });
    mp.payslip.findMany.mockResolvedValue([MOCK_PAYSLIP]);
  });

  it('throws 400 if run is not HR_APPROVED', async () => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'APPROVED' });
    await expect(payrollService.disburse('run-1', 'director-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(mxcelPartner.generateDynamicLinkOtp).not.toHaveBeenCalled();
  });

  it('generates a DL code and initiates disbursement for each pending payslip', async () => {
    await payrollService.disburse('run-1', 'director-1');
    expect(mxcelPartner.generateDynamicLinkOtp).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 480000, bankCode: 'MTN', accountNum: '256772345678' }),
    );
    expect(mxcelPartner.initiateBankPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 480000, dlCode: 'DL-STUB', accountNum: '256772345678', bankCode: 'MTN' }),
    );
  });

  it('fails a guard with no number instead of sending null to XCEL', async () => {
    // Phone became optional on a guard, so a payslip can reach disbursement with
    // nothing to pay to. It must name the guard rather than surface a format error.
    mp.payslip.findMany.mockResolvedValue([{
      ...MOCK_PAYSLIP,
      guard: { ...MOCK_PAYSLIP.guard, phone: null, preferredPaymentContact: null },
    }]);

    await payrollService.disburse('run-1', 'director-1');

    expect(mxcelPartner.generateDynamicLinkOtp).not.toHaveBeenCalled();
    const call = mp.payslip.update.mock.calls.find(
      (c: any) => c[0].data?.disbursementStatus === 'FAILED',
    );
    expect(call).toBeDefined();
    expect(call[0].data.disbursementFailureReason).toMatch(/No mobile money number on record/);
  });

  it('marks payslip SENT with the XCEL reference on success', async () => {
    await payrollService.disburse('run-1', 'director-1');
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ps-1' },
        data: expect.objectContaining({ disbursementStatus: 'SENT', disbursementRef: 'CUD-STUB', xcelDlCode: 'DL-STUB' }),
      }),
    );
  });

  it('skips guards flagged by HR without an adjusted amount', async () => {
    mp.payslip.findMany.mockResolvedValue([{ ...MOCK_PAYSLIP, hrFlagged: true, hrAdjustedAmount: null }]);
    await payrollService.disburse('run-1', 'director-1');
    expect(mxcelPartner.initiateBankPayment).not.toHaveBeenCalled();
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disbursementStatus: 'FAILED',
          disbursementFailureReason: 'Skipped — flagged by HR for exclusion',
        }),
      }),
    );
  });

  it('pays the HR-adjusted amount when a flagged guard has one', async () => {
    mp.payslip.findMany.mockResolvedValue([{ ...MOCK_PAYSLIP, hrFlagged: true, hrAdjustedAmount: 300000 }]);
    await payrollService.disburse('run-1', 'director-1');
    expect(mxcelPartner.initiateBankPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 300000 }),
    );
  });

  it('marks payslip FAILED when XCEL initiation throws', async () => {
    mxcelPartner.initiateBankPayment.mockRejectedValueOnce(new Error('XCEL API error 500: boom'));
    await payrollService.disburse('run-1', 'director-1');
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disbursementStatus: 'FAILED', disbursementFailureReason: 'XCEL API error 500: boom' }),
      }),
    );
  });

  it('sets run to DISBURSING then DISBURSED with success/failed counts', async () => {
    await payrollService.disburse('run-1', 'director-1');
    const calls = mp.payrollRun.update.mock.calls.map((c: any) => c[0]);
    expect(calls[0].data).toMatchObject({ status: 'DISBURSING', disbursedBy: 'director-1' });
    expect(calls[1].data).toMatchObject({ status: 'DISBURSED', successCount: 1, failedCount: 0 });
  });
});

describe('payrollService.handleDisbursementWebhook()', () => {
  const SENT_PAYSLIP = { ...MOCK_PAYSLIP, disbursementStatus: 'SENT', disbursementRef: 'CUD-STUB', payrollRunId: 'run-1' };

  beforeEach(() => {
    mp.payslip.findFirst.mockResolvedValue(SENT_PAYSLIP);
    mp.payslip.findMany.mockResolvedValue([{ ...SENT_PAYSLIP, disbursementStatus: 'SUCCESS' }]);
  });

  it('marks payslip SUCCESS and updates run counts', async () => {
    await payrollService.handleDisbursementWebhook({ reference: 'CUD-STUB', status: 'success' });
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ disbursementStatus: 'SUCCESS' }) }),
    );
    expect(mp.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { successCount: 1, failedCount: 0 } }),
    );
  });

  it('marks payslip FAILED with reason on failure webhook', async () => {
    await payrollService.handleDisbursementWebhook({
      reference: 'CUD-STUB', status: 'failed', reason: 'Error validating DL code',
    });
    expect(mp.payslip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disbursementStatus: 'FAILED', disbursementFailureReason: 'Error validating DL code' }),
      }),
    );
  });

  it('does nothing when no matching payslip is found', async () => {
    mp.payslip.findFirst.mockResolvedValue(null);
    await payrollService.handleDisbursementWebhook({ reference: 'unknown-ref', status: 'success' });
    expect(mp.payslip.update).not.toHaveBeenCalled();
  });

  it('ignores webhooks for payslips that are not currently SENT', async () => {
    mp.payslip.findFirst.mockResolvedValue({ ...SENT_PAYSLIP, disbursementStatus: 'SUCCESS' });
    await payrollService.handleDisbursementWebhook({ reference: 'CUD-STUB', status: 'success' });
    expect(mp.payslip.update).not.toHaveBeenCalled();
  });

  it('leaves status unchanged for an unrecognised status value', async () => {
    await payrollService.handleDisbursementWebhook({ reference: 'CUD-STUB', status: 'weird-unknown-status' });
    expect(mp.payslip.update).not.toHaveBeenCalled();
  });
});
