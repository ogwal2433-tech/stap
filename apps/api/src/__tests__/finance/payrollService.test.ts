import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    payrollRun:       { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payslip:          { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    guard:            { findMany: vi.fn() },
    attendanceRecord: { count: vi.fn(), groupBy: vi.fn() },
    guardDeduction:   { findMany: vi.fn(), updateMany: vi.fn() },
    zone:             { findUnique: vi.fn(), findMany: vi.fn() },
    deployment:       { findMany: vi.fn() },
    user:             { findUnique: vi.fn() },
    // Synchronous passthrough so reject()'s rewind steps run inline.
    $transaction:     (fn: any) => fn({
      guardDeduction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      payslip:        { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      payrollRun:     { update: vi.fn() },
    }),
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
  generateDisbursementRef: vi.fn((guardId: string, period: string) => `S360-SAL-${guardId}-${period}`),
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

// disburse() stamps the payment description with the company name via
// companyProfile(), which otherwise reads SystemSetting/branding rows the mock
// prisma does not model — the unit under test only needs the string back.
vi.mock('../../services/integrationSettings', () => ({
  companyProfile: vi.fn().mockResolvedValue({ name: 'Tiger Security Services Ltd' }),
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
  id: 'guard-1', firstName: 'David', lastName: 'Ochieng', systemId: 'SSLG0001',
  phone: '+256772345678', salaryRate: 480000, employmentStatus: 'ACTIVE',
};

const MOCK_GUARD_2 = {
  id: 'guard-2', firstName: 'Amina', lastName: 'Nakato', systemId: 'SSLG0002',
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

// Payroll is run per zone: every calculateRun call below pays zone-1, and the
// attribution engine reads zone.findMany + deployment.findMany to decide whose
// run a guard belongs to. Both mocks put each mock guard at one zone-1 site.
const ZONE_1 = { id: 'zone-1', name: 'Kampala' };
const SITE_1 = { id: 'site-1', siteName: 'Site 1', zoneId: 'zone-1' };
// prisma resolves `select: { site: { select: { id, siteName, zoneId } } }` to a
// plain site object on each row — the fixtures must mirror the unpacked shape,
// otherwise buildZoneAttribution sees no zone and nobody is attributed.
const zoneDeployment = (guardId: string) => ({
  guardId,
  siteId: SITE_1.id,
  site:   SITE_1,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.payrollRun.findFirst.mockResolvedValue(null);
  mp.zone.findUnique.mockResolvedValue({ ...ZONE_1, isActive: true });
  mp.zone.findMany.mockResolvedValue([{ ...ZONE_1, isActive: true }]);
  mp.deployment.findMany.mockResolvedValue([zoneDeployment('guard-1'), zoneDeployment('guard-2')]);
  mp.attendanceRecord.groupBy.mockResolvedValue([
    { guardId: 'guard-1', _count: { _all: 26 } },
    { guardId: 'guard-2', _count: { _all: 20 } },
  ]);
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
  mp.user.findUnique.mockResolvedValue({ role: 'DIRECTOR' });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('payrollService.calculateRun()', () => {
  it('returns correct gross for full attendance (26/26 days)', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    const summary = await payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']);
    expect(summary.byGuard[0].grossSalary).toBe(480000);
    expect(summary.byGuard[0].daysWorked).toBe(26);
  });

  it('calculates pro-rata gross for partial attendance', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.attendanceRecord.count.mockResolvedValue(13); // 13/26 = 50%
    await payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']);
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.grossSalary).toBe(240000); // 480000 / 2
  });

  it('applies pending deductions and reflects in totalDeductions', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([
      { id: 'ded-1', type: 'NSSF', amount: 48000, description: 'NSSF 10%', effectiveDate: new Date('2026-04-15') },
    ]);
    await payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']);
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.totalDeductions).toBe(48000);
    expect(createData.netSalary).toBe(432000);
  });

  it('net salary never goes below 0', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    mp.guardDeduction.findMany.mockResolvedValue([
      { id: 'ded-1', type: 'DAMAGE_LOSS', amount: 600000, description: 'Equipment', effectiveDate: new Date('2026-04-15') },
    ]);
    await payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']);
    const createData = mp.payslip.create.mock.calls[0][0].data;
    expect(createData.netSalary).toBe(0);
  });

  it('throws 409 if a run already exists for this zone and period', async () => {
    mp.payrollRun.findFirst.mockResolvedValue(MOCK_RUN);
    await expect(
      payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']),
    ).rejects.toThrow('Payroll has already been run for Kampala');
  });

  it('recalculating a rejected run reopens it in place instead of creating a new one', async () => {
    mp.guard.findMany.mockResolvedValue([MOCK_GUARD]);
    // calculateRun checks live runs first (none), then persistRun finds the
    // rejected run for the same zone/period and updates it back to DRAFT.
    mp.payrollRun.findFirst
      .mockResolvedValueOnce(null)                                            // no live zone run
      .mockResolvedValueOnce(null)                                            // no live company-wide run
      .mockResolvedValueOnce({ ...MOCK_RUN, zoneId: 'zone-1', status: 'REJECTED' }); // rejected to reopen
    mp.payrollRun.update.mockResolvedValue({ ...MOCK_RUN, zoneId: 'zone-1', status: 'DRAFT' });
    mp.payslip.deleteMany.mockResolvedValue({ count: 0 });

    const summary = await payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']);

    expect(mp.payrollRun.create).not.toHaveBeenCalled();
    expect(mp.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'DRAFT', approvedBy: null, disbursedBy: null }),
      }),
    );
    expect(mp.payslip.deleteMany).toHaveBeenCalledWith({ where: { payrollRunId: 'run-1' } });
    expect(summary.zoneName).toBe('Kampala');
    expect(summary.byGuard).toHaveLength(1);
  });

  it('throws 404 when the zone does not exist', async () => {
    mp.zone.findUnique.mockResolvedValue(null);
    await expect(
      payrollService.calculateRun(4, 2026, 'zone-x', 'user-1', ['guard-1']),
    ).rejects.toThrow('Zone not found');
  });

  it('throws 400 when the zone is deactivated', async () => {
    mp.zone.findUnique.mockResolvedValue({ ...ZONE_1, isActive: false });
    await expect(
      payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a guard attributed to another zone — nobody is paid from two runs', async () => {
    // guard-2 spent most of the month in zone-2, so submitting them to zone-1's
    // run must fail even if a stale screen had them ticked.
    const ZONE_2 = { id: 'zone-2', name: 'Entebbe' };
    const SITE_2 = { id: 'site-2', siteName: 'Site 2', zoneId: 'zone-2' };
    mp.zone.findMany.mockResolvedValue([{ ...ZONE_1, isActive: true }, { ...ZONE_2, isActive: true }]);
    mp.deployment.findMany.mockResolvedValue([
      zoneDeployment('guard-1'),
      { guardId: 'guard-2', siteId: SITE_2.id, site: SITE_2 },
    ]);
    await expect(
      payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1', 'guard-2']),
    ).rejects.toThrow(/Not on this zone's payroll.*Entebbe/);
  });
});

// ── Zone roster (the Payroll tab tick-list source) ───────────────────────────────

describe('payrollService.getZonePayrollRoster()', () => {
  it('groups the zone guards by site, pre-assigning the majority-zone guard', async () => {
    const roster = await payrollService.getZonePayrollRoster(4, 2026);
    expect(roster.month).toBe(4);
    expect(roster.year).toBe(2026);
    expect(roster.unZonedGuardCount).toBe(0);
    expect(roster.zones).toHaveLength(1);

    const zone = roster.zones[0];
    expect(zone.zoneName).toBe('Kampala');
    expect(zone.assignedCount).toBe(2);
    expect(zone.alsoElsewhereCount).toBe(0);
    expect(zone.sites[0].siteName).toBe('Site 1');
    // Assigned-first then name: David before Amina would be by name; both are
    // assigned here so order is by name — Amina first.
    expect(zone.sites[0].guards.map((g) => g.name)).toEqual(['Amina Nakato', 'David Ochieng']);
    expect(zone.sites[0].guards[0]).toMatchObject({
      guardId: 'guard-2', assignedHere: true, assignedZoneName: null,
      deploymentDays: 1, attendanceDays: 20,
    });
  });

  it('shows a majority-zone guard as disabled under the minority zone with a badge name', async () => {
    // guard-1: 1 day at zone-1's site; guard-2 also has more days at zone-2.
    const ZONE_2 = { id: 'zone-2', name: 'Entebbe' };
    const SITE_2 = { id: 'site-2', siteName: 'Site 2', zoneId: 'zone-2' };
    mp.zone.findMany.mockResolvedValue([{ ...ZONE_1, isActive: true }, { ...ZONE_2, isActive: true }]);
    // One row per guard per day (@@unique([guardId, date])) — two distinct days
    // at zone-2 vs one at zone-1, so Amina's majority zone is Entebbe.
    mp.deployment.findMany.mockResolvedValue([
      zoneDeployment('guard-1'),
      zoneDeployment('guard-2'),
      { guardId: 'guard-2', date: new Date('2026-04-02'), siteId: SITE_2.id, site: SITE_2 },
      { guardId: 'guard-2', date: new Date('2026-04-03'), siteId: SITE_2.id, site: SITE_2 },
    ]);
    const roster = await payrollService.getZonePayrollRoster(4, 2026);
    const z1 = roster.zones.find((z) => z.zoneId === 'zone-1')!;
    expect(z1.assignedCount).toBe(1);      // only David
    expect(z1.alsoElsewhereCount).toBe(1); // Amina is paid under Entebbe
    const amina = z1.sites[0].guards.find((g) => g.guardId === 'guard-2')!;
    expect(amina).toMatchObject({ assignedHere: false, assignedZoneName: 'Entebbe' });
  });

  it('counts guards deployed only to un-zoned sites outside every zone payroll', async () => {
    const SITE_NO_ZONE = { id: 'site-9', siteName: 'Roadside', zoneId: null };
    mp.deployment.findMany.mockResolvedValue([
      zoneDeployment('guard-1'),
      { guardId: 'guard-2', siteId: SITE_NO_ZONE.id, site: SITE_NO_ZONE },
    ]);
    const roster = await payrollService.getZonePayrollRoster(4, 2026);
    expect(roster.unZonedGuardCount).toBe(1);
    expect(roster.zones[0].assignedCount).toBe(1);
  });
});

// ── Company-wide run — pay every deployed guard, zone ignored ───────────────────

describe('payrollService.calculateCompanyRun()', () => {
  it('creates one run with no zone covering every selected deployed guard', async () => {
    const summary = await payrollService.calculateCompanyRun(4, 2026, 'user-1', ['guard-1', 'guard-2']);
    const createData = mp.payrollRun.create.mock.calls[0][0].data;
    expect(createData.zoneId).toBeNull();
    expect(createData.totalGuards).toBe(2);
    expect(summary.zoneId).toBeNull();
    expect(summary.zoneName).toBeNull();
    expect(summary.byGuard).toHaveLength(2);
  });

  it('refuses when any live run already covers the period — the either/or rule', async () => {
    // A zone run (or a prior company-wide one) existing means a company-wide run
    // would pay those guards a second time.
    mp.payrollRun.findFirst.mockResolvedValue({ ...MOCK_RUN, zoneId: 'zone-1' });
    await expect(
      payrollService.calculateCompanyRun(4, 2026, 'user-1', ['guard-1', 'guard-2']),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses a guard who was not deployed in the period', async () => {
    // Only David has a deployment row this month, so submitting Amina is rejected
    // rather than silently paying an absent guard.
    mp.deployment.findMany.mockResolvedValue([zoneDeployment('guard-1')]);
    await expect(
      payrollService.calculateCompanyRun(4, 2026, 'user-1', ['guard-1', 'guard-2']),
    ).rejects.toThrow(/Not eligible for the company-wide payroll.*Amina/);
  });

  it('a zone run is blocked while a live company-wide run covers the period', async () => {
    // calculateRun checks the per-zone duplicate first (none), then the
    // company-wide run for the same period — which exists here.
    mp.payrollRun.findFirst
      .mockResolvedValueOnce(null)                        // no existing zone-1 run
      .mockResolvedValueOnce({ ...MOCK_RUN, zoneId: null }); // a live company-wide run
    await expect(
      payrollService.calculateRun(4, 2026, 'zone-1', 'user-1', ['guard-1']),
    ).rejects.toThrow(/already run company-wide/);
  });
});

// ── Company-wide roster (the Company-wide tick-list source) ─────────────────────

describe('payrollService.getCompanyPayrollRoster()', () => {
  it('lists every deployed guard under their main site, zone or not', async () => {
    const SITE_NO_ZONE = { id: 'site-9', siteName: 'Roadside', zoneId: null };
    mp.deployment.findMany.mockResolvedValue([
      zoneDeployment('guard-1'),
      { guardId: 'guard-2', siteId: SITE_NO_ZONE.id, site: SITE_NO_ZONE },
    ]);
    const roster = await payrollService.getCompanyPayrollRoster(4, 2026);
    expect(roster.guardCount).toBe(2);
    // Grouped by site NAME, alphabetical: Roadside before Site 1.
    expect(roster.sites.map((s) => s.siteName)).toEqual(['Roadside', 'Site 1']);
    // Amina is deployed only to an un-zoned site — still offered, with no zone.
    expect(roster.sites[0].guards[0]).toMatchObject({
      guardId: 'guard-2', primarySiteName: 'Roadside', primaryZoneName: null,
    });
  });

  it('omits a payable guard who had no deployment in the period', async () => {
    mp.deployment.findMany.mockResolvedValue([zoneDeployment('guard-1')]);
    const roster = await payrollService.getCompanyPayrollRoster(4, 2026);
    expect(roster.guardCount).toBe(1);
    expect(roster.sites.flatMap((s) => s.guards).map((g) => g.guardId)).toEqual(['guard-1']);
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

describe('payrollService.reject()', () => {
  const REJECTED_RUN = {
    ...MOCK_RUN, status: 'REJECTED', zoneId: 'zone-1', zone: ZONE_1,
    rejectedBy: 'director-1',
    rejectedAt: new Date(), rejectReason: 'Rates look stale — recalculate',
    _count: { payslips: 0 },
  };

  it('rejects a DRAFT run with a reason, marking the trail and reporting the rewind', async () => {
    mp.payrollRun.findUnique
      .mockResolvedValueOnce({ ...MOCK_RUN, zoneId: 'zone-1', zone: ZONE_1, _count: { payslips: 2 } })
      .mockResolvedValueOnce(REJECTED_RUN);
    const result = await payrollService.reject('run-1', 'director-1', 'Rates look stale — recalculate');
    expect(result.status).toBe('REJECTED');
    expect(result.rejectReason).toBe('Rates look stale — recalculate');
    expect(result.payslipCount).toBe(0); // re-read reflects the deleted payslips
  });

  it('an APPROVED run is rejectable by either payroll run role (Director here)', async () => {
    mp.payrollRun.findUnique
      .mockResolvedValueOnce({ ...MOCK_RUN, status: 'APPROVED', _count: { payslips: 2 } })
      .mockResolvedValueOnce({ ...REJECTED_RUN, status: 'REJECTED' });
    const result = await payrollService.reject('run-1', 'director-1', 'Wrong guard list');
    expect(result.status).toBe('REJECTED');
  });

  it('an Assistant Manager can also reject an APPROVED run — no Director-only gate', async () => {
    mp.payrollRun.findUnique
      .mockResolvedValueOnce({ ...MOCK_RUN, status: 'APPROVED', _count: { payslips: 2 } })
      .mockResolvedValueOnce({ ...REJECTED_RUN, rejectedBy: 'am-1', status: 'REJECTED' });
    const result = await payrollService.reject('run-1', 'am-1', 'Wrong guard list');
    expect(result.status).toBe('REJECTED');
    expect(result.rejectedBy).toBe('am-1');
  });

  it('refuses to reject once HR has approved — the run is in the pay queue', async () => {
    mp.payrollRun.findUnique.mockResolvedValue({ ...MOCK_RUN, status: 'HR_APPROVED', _count: { payslips: 2 } });
    await expect(payrollService.reject('run-1', 'director-1', 'Too late')).rejects.toThrow(/only DRAFT or APPROVED/);
  });

  it('throws 404 for an unknown run', async () => {
    mp.payrollRun.findUnique.mockResolvedValue(null);
    await expect(payrollService.reject('no-such', 'director-1', 'Anything')).rejects.toThrow('not found');
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
