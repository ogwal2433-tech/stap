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
  ScheduledReportSchema,
} from '@stap/shared';

const router = Router();

const REPORT_ACCESS = [...new Set([...REPORT_ROLES, ROLES.OPERATIONS_SUPERVISOR])] as const;

function sendExcel(res: any, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.use(authenticate);

// GET /reports/dashboard/director
router.get(
  '/dashboard/director',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
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
      res.json({ success: true, message: 'Use ?format=excel for Excel download' });
    }
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
