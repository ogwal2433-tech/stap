/**
 * @openapi
 * tags:
 *   - name: Finance
 *     description: Invoicing, AR aging, payroll, deductions, cashbook, Yo! Payments
 *
 * /api/v1/finance/invoices:
 *   get:
 *     tags: [Finance]
 *     summary: List invoices (paginated, filterable by status/client/raised date)
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, PARTIALLY_PAID, OVERDUE, PAID, VOID] }
 *       - in: query
 *         name: from
 *         description: Oldest raised date to return, inclusive (YYYY-MM-DD or date-time)
 *         schema: { type: string }
 *       - in: query
 *         name: to
 *         description: Latest raised date to return; the whole of that day is included
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 500 }
 *     responses:
 *       200:
 *         description: Paginated invoices
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       400:
 *         description: Unknown status, unreadable date, or from after to
 *   post:
 *     tags: [Finance]
 *     summary: Create invoice manually
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, periodStart, periodEnd, guardsDeployed, ratePerGuard, dueDate]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               periodStart: { type: string, format: date-time }
 *               periodEnd: { type: string, format: date-time }
 *               guardsDeployed: { type: integer }
 *               ratePerGuard: { type: number, description: 'UGX — whole or up to two decimals' }
 *               taxAmount: { type: number, default: 0 }
 *               dueDate: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Invoice created, PDF queued, email queued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invoice'
 *       404:
 *         description: Client not found
 *
 * /api/v1/finance/invoices/aging:
 *   get:
 *     tags: [Finance]
 *     summary: AR aging report — buckets current, 1-30, 31-60, 61-90, 90+ days
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         description: Oldest raised date to include, inclusive (YYYY-MM-DD or date-time)
 *         schema: { type: string }
 *       - in: query
 *         name: to
 *         description: Latest raised date to include; the whole of that day is included
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Aging report with totals per bucket
 *       400:
 *         description: Unreadable date, or from after to
 *
 * /api/v1/finance/invoices/{id}/pay:
 *   post:
 *     tags: [Finance]
 *     summary: Record manual payment against an invoice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountPaid, mode]
 *             properties:
 *               amountPaid: { type: number, description: 'UGX — whole or up to two decimals' }
 *               mode: { type: string, enum: [CASH, BANK, MOBILE_MONEY, CHEQUE] }
 *               referenceNumber: { type: string }
 *     responses:
 *       200:
 *         description: Payment recorded; invoice status updated to PAID if fully paid
 *
 * /api/v1/finance/payroll/calculate:
 *   post:
 *     tags: [Finance]
 *     summary: Run payroll calculation for one zone in a given month/year
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [month, year, zoneId, guardIds]
 *             properties:
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year: { type: integer }
 *               zoneId: { type: string }
 *               guardIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: The tick-list of guards to pay, all attributed to this zone
 *     responses:
 *       201:
 *         description: Payroll run created (DRAFT status)
 *       400:
 *         description: Zone inactive, or a submitted guard belongs to another zone
 *       409:
 *         description: Run already exists for this zone and period
 *
 * /api/v1/finance/payroll/{id}/approve:
 *   post:
 *     tags: [Finance]
 *     summary: Approve a payroll run — queues payslip PDFs (DIRECTOR only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Run approved, payslip generation queued
 *       400:
 *         description: Run is not in DRAFT status
 *
 * /api/v1/finance/deductions:
 *   get:
 *     tags: [Finance]
 *     summary: List deductions for a guard
 *   post:
 *     tags: [Finance]
 *     summary: Create a deduction for a guard
 *     responses:
 *       201:
 *         description: Deduction created
 *
 * /api/v1/finance/cashbook:
 *   get:
 *     tags: [Finance]
 *     summary: List cashbook entries
 *   post:
 *     tags: [Finance]
 *     summary: Add cashbook entry
 *     responses:
 *       201:
 *         description: Entry added
 */
import { Router, type IRouter, type Request, type Response } from 'express';
import prisma from '../db/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { invoiceService } from '../services/invoiceService';
import { softDeleteService } from '../services/softDeleteService';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { VoidInvoiceSchema } from '@security360/shared';
import { runInvoiceEmailJob } from '../jobs/invoiceCron';
import { deductionService } from '../services/deductionService';
import { payrollService } from '../services/payrollService';
import { payrollExportService } from '../services/payrollExportService';
import { cashbookService } from '../services/cashbookService';
import {
  ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  CreateInvoiceSchema,
  InvoiceListQuerySchema,
  ARAgingQuerySchema,
  type InvoiceListQuery,
  type ARAgingQuery,
  GenerateInvoiceSchema,
  UpdateInvoiceSchema,
  RecordPaymentSchema,
  AddFeeIncrementSchema,
  CreateDeductionSchema,
  RunPayrollSchema,
  PayrollRosterQuerySchema,
  CashbookEntrySchema,
  FlagPayslipSchema,
  HrApprovePayrollSchema,
  RejectPayrollSchema,
} from '@security360/shared';

const router: IRouter = Router();
router.use(authenticate);

// ── Invoices ──────────────────────────────────────────────────────────────────

router.get(
  '/invoices',
  requireRole(...FINANCE_ROLES),
  validateQuery(InvoiceListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as InvoiceListQuery;
    const result = await invoiceService.list({
      clientId: query.clientId,
      status:   query.status,
      from:     query.from,
      to:       query.to,
      page:     query.page,
      limit:    query.limit,
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
  validateQuery(ARAgingQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, from, to } = req.query as unknown as ARAgingQuery;
    const report = await invoiceService.getARAgingReport({ clientId, from, to });
    res.json({ success: true, data: report });
  }),
);

router.get(
  '/invoices/preview',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req: Request, res: Response) => {
    const { contractId, billingDays } = req.query;
    const preview = await invoiceService.getInvoicePreview(
      contractId as string,
      parseInt(billingDays as string) || 30,
    );
    res.json({ success: true, data: preview });
  }),
);

router.post(
  '/invoices/generate',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(GenerateInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.generateInvoice(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: invoice });
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

// ── PATCH /invoices/:id — edit a still-PENDING invoice ────────────────────────
// Dates only, or dates plus a wholesale replacement of the line items.
// The service refuses anything past PENDING; corrections there go through
// Add Fees or void-and-reissue instead.
router.patch(
  '/invoices/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(UpdateInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: invoice });
  }),
);

// POST /finance/invoices/run-auto-send — manually trigger the batch email job
router.post(
  '/invoices/run-auto-send',
  requireRole(ROLES.DIRECTOR, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (_req: Request, res: Response) => {
    await runInvoiceEmailJob();
    res.json({ success: true, message: 'Auto-send job completed' });
  }),
);

// POST /finance/invoices/:id/send-email — send a specific invoice by email
// ── POST /invoices/:id/void — void, never delete ──────────────────────────────
// The invoice stays on file marked VOID with the reason, and drops out of
// balances, AR and revenue. Refused once any money has moved against it.
router.post(
  '/invoices/:id/void',
  requirePermission(PERMISSIONS.INVOICES_VOID),
  validate(VoidInvoiceSchema),
  asyncHandler(async (req, res) => {
    const data = await softDeleteService.voidInvoice(req.params.id, req.body.reason, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

router.post(
  '/invoices/:id/send-email',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req: Request, res: Response) => {
    await invoiceService.sendInvoiceEmail(req.params.id);
    res.json({ success: true, message: 'Invoice email sent' });
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

// ── POST /invoices/:id/increment — extra charge on an unsettled invoice ───────
router.post(
  '/invoices/:id/increment',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(AddFeeIncrementSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.addFeeIncrement(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: invoice });
  }),
);

// ── GET /invoices/:id/pdf — printable invoice ────────────────────────────────
router.get(
  '/invoices/:id/pdf',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const { pdf, filename } = await invoiceService.buildInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
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
      page:           Number(req.query.page ?? 1),
      limit:          Number(req.query.limit ?? 20),
    });
    res.json({ success: true, ...result });
  }),
);

// Zone → sites → employees tick-list for a period. Registered before every
// '/payroll/:id' route so the literal path is never shadowed.
router.get(
  '/payroll/zones-roster',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  validateQuery(PayrollRosterQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const roster = await payrollService.getZonePayrollRoster(
      Number(req.query.month),
      Number(req.query.year),
    );
    res.json({ success: true, data: roster });
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
      req.body.zoneId,
      req.user!.userId,
      req.body.guardIds,
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

router.delete(
  '/payroll/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req: Request, res: Response) => {
    await payrollService.remove(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

router.patch(
  '/payroll/payslips/:id/flag',
  requireRole(...HR_ROLES),
  validate(FlagPayslipSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const payslip = await payrollService.flagPayslip({
      payslipId:      req.params.id,
      flagReason:     req.body.flagReason,
      adjustedAmount: req.body.adjustedAmount,
    });
    res.json({ success: true, data: payslip });
  }),
);

router.patch(
  '/payroll/payslips/:id/unflag',
  requireRole(...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const payslip = await payrollService.unflagPayslip(req.params.id);
    res.json({ success: true, data: payslip });
  }),
);

router.post(
  '/payroll/:id/hr-approve',
  requireRole(...HR_ROLES),
  validate(HrApprovePayrollSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const run = await payrollService.hrApprove(req.params.id, req.user!.userId, req.body.notes);
    res.json({ success: true, data: run });
  }),
);

router.post(
  '/payroll/:id/reject',
  // Both windows cover these two roles; the service narrows APPROVED further
  // to DIRECTOR, the role that granted the approval.
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(RejectPayrollSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const run = await payrollService.reject(req.params.id, req.user!.userId, req.body.reason);
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

// ── GET /payroll/:id/export/{excel|pdf} — printable payroll schedule ──────────
// Both carry the header block (month, year, group, print date, generated by)
// so a printed or emailed copy is traceable to its run and exporter.
router.get(
  '/payroll/:id/export/excel',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await payrollExportService.buildRunExcel(req.params.id, req.user!.name);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }),
);

router.get(
  '/payroll/:id/export/pdf',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const { pdf, filename } = await payrollExportService.buildRunPdf(req.params.id, req.user!.name);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }),
);

router.get(
  '/payslips/:id',
  requireRole(...FINANCE_ROLES, ...HR_ROLES, ROLES.GUARD),
  asyncHandler(async (req: Request, res: Response) => {
    const payslip = await payrollService.getPayslip(req.params.id);
    // Guards can only view their own payslip. req.user!.userId is the User.id
    // (login account) — Guard.id is a separate id space linked via
    // Guard.userId, so it must be resolved, not compared directly.
    if (req.user!.role === ROLES.GUARD) {
      const guard = await prisma.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } });
      if (guard?.id !== payslip.guardId) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
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
