import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { invoiceService } from '../services/invoiceService';
import { deductionService } from '../services/deductionService';
import { payrollService } from '../services/payrollService';
import { cashbookService } from '../services/cashbookService';
import {
  ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  CreateInvoiceSchema,
  RecordPaymentSchema,
  CreateDeductionSchema,
  RunPayrollSchema,
  CashbookEntrySchema,
} from '@stap/shared';

const router: IRouter = Router();
router.use(authenticate);

// ── Invoices ──────────────────────────────────────────────────────────────────

router.get(
  '/invoices',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await invoiceService.list({
      clientId: req.query.clientId as string | undefined,
      status:   req.query.status as string | undefined,
      from:     req.query.from as string | undefined,
      to:       req.query.to as string | undefined,
      page:     Number(req.query.page ?? 1),
      limit:    Number(req.query.limit ?? 20),
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/invoices',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(CreateInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: invoice });
  }),
);

router.get(
  '/invoices/aging',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (_req: Request, res: Response) => {
    const report = await invoiceService.getARAgingReport();
    res.json({ success: true, data: report });
  }),
);

router.get(
  '/invoices/:id',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.getById(req.params.id);
    res.json({ success: true, data: invoice });
  }),
);

router.post(
  '/invoices/:id/pay',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(RecordPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await invoiceService.recordManualPayment(
      { ...req.body, invoiceId: req.params.id },
      req.user!.userId,
    );
    res.json({ success: true, data: payment });
  }),
);

router.post(
  '/invoices/:id/yo-payment',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await invoiceService.initiateYoPayment(req.params.id);
    res.json({ success: true, data: result });
  }),
);

// Yo! Payments webhook — no auth, Yo! calls this externally
router.post(
  '/webhooks/yo-payments',
  asyncHandler(async (req: Request, res: Response) => {
    await invoiceService.handleYoWebhook(req.body);
    res.json({ success: true });
  }),
);

// ── Deductions ────────────────────────────────────────────────────────────────

router.get(
  '/deductions',
  requireRole(...HR_ROLES, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await deductionService.list({
      guardId: req.query.guardId as string | undefined,
      status:  req.query.status as string | undefined,
    });
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/deductions',
  requireRole(...HR_ROLES, ROLES.ACCOUNTS_OFFICER),
  validate(CreateDeductionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const deduction = await deductionService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: deduction });
  }),
);

router.patch(
  '/deductions/:id/cancel',
  requireRole(...HR_ROLES, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req: Request, res: Response) => {
    const deduction = await deductionService.cancel(req.params.id, req.user!.userId);
    res.json({ success: true, data: deduction });
  }),
);

// ── Payroll ───────────────────────────────────────────────────────────────────

router.get(
  '/payroll',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await payrollService.getRunHistory({
      page:  Number(req.query.page ?? 1),
      limit: Number(req.query.limit ?? 20),
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/payroll/calculate',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(RunPayrollSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await payrollService.calculateRun(
      req.body.month,
      req.body.year,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: summary });
  }),
);

router.post(
  '/payroll/:id/approve',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req: Request, res: Response) => {
    const run = await payrollService.approve(req.params.id, req.user!.userId);
    res.json({ success: true, data: run });
  }),
);

router.post(
  '/payroll/:id/disburse',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req: Request, res: Response) => {
    await payrollService.disburse(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

router.get(
  '/payroll/:id',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const detail = await payrollService.getRunDetail(req.params.id);
    res.json({ success: true, data: detail });
  }),
);

router.get(
  '/payroll/:id/payslips',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const payslips = await payrollService.getPayslipsByRun(req.params.id);
    res.json({ success: true, data: payslips });
  }),
);

router.get(
  '/payslips/:id',
  requireRole(...FINANCE_ROLES, ...HR_ROLES, ROLES.GUARD),
  asyncHandler(async (req: Request, res: Response) => {
    const payslip = await payrollService.getPayslip(req.params.id);
    // Guards can only view their own payslip
    if (req.user!.role === ROLES.GUARD && payslip.guardId !== req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: payslip });
  }),
);

// ── Cashbook ──────────────────────────────────────────────────────────────────

router.get(
  '/cashbook',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await cashbookService.list({
      month: req.query.month ? Number(req.query.month) : undefined,
      year:  req.query.year  ? Number(req.query.year)  : undefined,
      type:  req.query.type  as string | undefined,
      page:  Number(req.query.page  ?? 1),
      limit: Number(req.query.limit ?? 50),
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/cashbook',
  requireRole(ROLES.ACCOUNTS_OFFICER, ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(CashbookEntrySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await cashbookService.addEntry(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: entry });
  }),
);

router.get(
  '/cashbook/summary',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const month = Number(req.query.month ?? new Date().getMonth() + 1);
    const year  = Number(req.query.year  ?? new Date().getFullYear());
    const summary = await cashbookService.getMonthSummary(month, year);
    res.json({ success: true, data: summary });
  }),
);

export { router as financeRouter };
