/**
 * @openapi
 * tags:
 *   - name: Reports
 *     description: Director-level reporting — guard performance, finance, attendance summaries
 *
 * /api/v1/reports/guard-performance:
 *   get:
 *     tags: [Reports]
 *     summary: Guard performance report (attendance, deductions, disciplinary)
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Guard performance data
 *
 * /api/v1/reports/finance-summary:
 *   get:
 *     tags: [Reports]
 *     summary: Financial summary — revenue, payroll, outstanding AR
 *     responses:
 *       200:
 *         description: Finance KPIs
 *
 * /api/v1/reports/attendance-summary:
 *   get:
 *     tags: [Reports]
 *     summary: Attendance summary by site
 *     responses:
 *       200:
 *         description: Attendance rates and absences
 *
 * /api/v1/reports/income-expenses:
 *   get:
 *     tags: [Reports]
 *     summary: Income & expenses for a month (cash basis, from the ledger)
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, excel] }
 *     responses:
 *       200:
 *         description: Money in/out by category with period entries
 */
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { reportService } from '../services/reportService';
import {
  ROLES,
  FINANCE_ROLES,
  HR_ROLES,
  REPORT_ROLES,
  INTERNAL_ROLES,
  ScheduledReportSchema,
} from '@security360/shared';

const router = Router();

const REPORT_ACCESS = [...new Set([...REPORT_ROLES, ROLES.OPERATIONS_SUPERVISOR])] as const;

function sendExcel(res: any, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.use(authenticate);

// GET /reports/dashboard/director
// Backs the generic /dashboard landing page every internal-staff role hits
// straight after login (see App.tsx / LoginPage.tsx) — must stay open to all
// of them, not just Director/Assistant Manager.
router.get(
  '/dashboard/director',
  requireRole(...INTERNAL_ROLES, ROLES.HR),
  asyncHandler(async (_req, res) => {
    const data = await reportService.getDirectorDashboard();
    res.json({ success: true, data });
  }),
);

// GET /reports/daily-ops
router.get(
  '/daily-ops',
  requireRole(...REPORT_ACCESS),
  asyncHandler(async (req, res) => {
    const date   = (req.query.date as string) ?? new Date().toISOString().split('T')[0];
    const format = (req.query.format as string) ?? 'json';

    if (format === 'excel') {
      const buffer = await reportService.generateDailyOpsReport(date);
      sendExcel(res, buffer, `daily-ops-${date}.xlsx`);
    } else {
      const data = await reportService.getDirectorDashboard();
      res.json({ success: true, data });
    }
  }),
);

// GET /reports/ar-aging
router.get(
  '/ar-aging',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req, res) => {
    const format = (req.query.format as string) ?? 'json';
    if (format === 'excel') {
      const buffer = await reportService.generateARAgingExcel();
      sendExcel(res, buffer, 'ar-aging.xlsx');
    } else {
      res.json({ success: true, message: 'Use ?format=excel for Excel download' });
    }
  }),
);

// GET /reports/payroll/:month/:year
router.get(
  '/payroll/:month/:year',
  requireRole(...FINANCE_ROLES, ...HR_ROLES),
  asyncHandler(async (req, res) => {
    const month  = parseInt(req.params.month);
    const year   = parseInt(req.params.year);
    const format = (req.query.format as string) ?? 'json';

    if (format === 'excel') {
      const buffer = await reportService.generateMonthlyPayrollExcel(month, year);
      sendExcel(res, buffer, `payroll-${year}-${month}.xlsx`);
    } else {
      const data = await reportService.getMonthlyPayroll(month, year);
      res.json({ success: true, data });
    }
  }),
);

// GET /reports/deployment?month=&year=[&day=]
router.get(
  '/deployment',
  requireRole(...FINANCE_ROLES, ...HR_ROLES, ...REPORT_ACCESS),
  asyncHandler(async (req, res) => {
    const month = parseInt(String(req.query.month));
    const year  = parseInt(String(req.query.year));
    const day   = req.query.day ? parseInt(String(req.query.day)) : undefined;
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      res.status(400).json({ success: false, message: 'month (1-12) and year are required' });
      return;
    }
    const data = await reportService.getDeploymentReport({ month, year, day });
    res.json({ success: true, data });
  }),
);

// GET /reports/inventory-ledger
router.get(
  '/inventory-ledger',
  requireRole(ROLES.DIRECTOR, ROLES.ADMINISTRATOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req, res) => {
    const format = (req.query.format as string) ?? 'json';
    if (format === 'excel') {
      const buffer = await reportService.generateInventoryLedgerExcel();
      sendExcel(res, buffer, 'inventory-ledger.xlsx');
    } else {
      res.json({ success: true, message: 'Use ?format=excel for Excel download' });
    }
  }),
);

// GET /reports/income-expenses?month=10&year=2026[&format=excel]
// The MD's "how much have I made this month?" — cash in vs cash out for one
// month, from the ledger. json backs the on-screen view, excel the download.
router.get(
  '/income-expenses',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req, res) => {
    const now   = new Date();
    const month = req.query.month ? parseInt(String(req.query.month)) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(String(req.query.year))  : now.getFullYear();
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ success: false, error: 'Give a month 1-12 and a sensible year.' });
      return;
    }
    const format = (req.query.format as string) ?? 'json';
    if (format === 'excel') {
      const buffer = await reportService.generateIncomeExpensesExcel(month, year);
      sendExcel(res, buffer, `income-expenses-${year}-${String(month).padStart(2, '0')}.xlsx`);
    } else {
      const data = await reportService.getIncomeExpenses(month, year);
      res.json({ success: true, data });
    }
  }),
);

// GET /reports/business-analysis?month=10&year=2026[&format=excel]
// The MD's month analysis: biggest paying clients, biggest costs, the
// six-month money in/out shape and the live action block (payments to
// approve, invoices to chase) — same month filter as Income & Expenses.
router.get(
  '/business-analysis',
  requireRole(...FINANCE_ROLES),
  asyncHandler(async (req, res) => {
    const now   = new Date();
    const month = req.query.month ? parseInt(String(req.query.month)) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(String(req.query.year))  : now.getFullYear();
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2100) {
      res.status(400).json({ success: false, error: 'Give a month 1-12 and a sensible year.' });
      return;
    }
    const format = (req.query.format as string) ?? 'json';
    if (format === 'excel') {
      const buffer = await reportService.generateBusinessAnalysisExcel(month, year);
      sendExcel(res, buffer, `business-analysis-${year}-${String(month).padStart(2, '0')}.xlsx`);
    } else {
      const data = await reportService.getBusinessAnalysis(month, year);
      res.json({ success: true, data });
    }
  }),
);

// GET /reports/scheduled
router.get(
  '/scheduled',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (_req, res) => {
    const data = await prisma.scheduledReport.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data });
  }),
);

// POST /reports/scheduled
router.post(
  '/scheduled',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(ScheduledReportSchema),
  asyncHandler(async (req, res) => {
    const data = await reportService.scheduleReport(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// DELETE /reports/scheduled/:id
router.delete(
  '/scheduled/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    reportService.cancelScheduledReport(req.params.id);
    await prisma.scheduledReport.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  }),
);

import prisma from '../db/prisma';

export { router as reportsRouter };
