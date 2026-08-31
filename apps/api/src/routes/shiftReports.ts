/**
 * @openapi
 * tags:
 *   - name: Shift Reports
 *     description: Control Room end-of-shift handover reports
 */
import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { shiftReportService } from '../services/shiftReportService';
import { renderShiftReportPdf } from '../lib/shiftReportPdf';
import { ShiftReportBodySchema, SHIFT_VALUES, SHIFT_REPORT_STATUSES } from '@stap/shared';
import { z } from 'zod';

const router: IRouter = Router();

const ListQuery = z.object({
  shift:    z.enum(SHIFT_VALUES).optional(),
  status:   z.enum(SHIFT_REPORT_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticate);

// GET /shift-reports/form-options — zone names for sections 3 and 5
router.get(
  '/form-options',
  requirePermission(PERMISSIONS.SHIFT_REPORT_VIEW),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await shiftReportService.formOptions() });
  }),
);

// GET /shift-reports
router.get(
  '/',
  requirePermission(PERMISSIONS.SHIFT_REPORT_VIEW),
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    const result = await shiftReportService.list(req.query as never);
    res.json({ success: true, ...result });
  }),
);

// GET /shift-reports/:id/pdf — before /:id so "pdf" is not read as an id
router.get(
  '/:id/pdf',
  requirePermission(PERMISSIONS.SHIFT_REPORT_VIEW),
  asyncHandler(async (req, res) => {
    const report = await shiftReportService.getById(req.params.id);
    const pdf    = await renderShiftReportPdf(report as never);
    const name   = report.systemId ?? `shift-report-${report.id.slice(-6)}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    res.send(pdf);
  }),
);

// GET /shift-reports/:id
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SHIFT_REPORT_VIEW),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await shiftReportService.getById(req.params.id) });
  }),
);

// POST /shift-reports — submit, or save a draft with status: "DRAFT"
router.post(
  '/',
  requirePermission(PERMISSIONS.SHIFT_REPORT_CREATE),
  validate(ShiftReportBodySchema),
  asyncHandler(async (req, res) => {
    const data = await shiftReportService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// PATCH /shift-reports/:id — only while it is still a draft
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SHIFT_REPORT_CREATE),
  validate(ShiftReportBodySchema),
  asyncHandler(async (req, res) => {
    const data = await shiftReportService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// PATCH /shift-reports/:id/acknowledge
router.patch(
  '/:id/acknowledge',
  requirePermission(PERMISSIONS.SHIFT_REPORT_ACKNOWLEDGE),
  asyncHandler(async (req, res) => {
    const data = await shiftReportService.acknowledge(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as shiftReportsRouter };
