/**
 * @openapi
 * tags:
 *   - name: Marketing
 *     description: >
 *       Prospective clients and their pipeline, bids and tenders, officer
 *       targets, and the reports drawn from all three.
 *
 * /api/v1/marketing/prospects:
 *   get:
 *     tags: [Marketing]
 *     summary: List prospects (paginated, filterable by status, officer, search)
 *     responses:
 *       200: { description: Prospects }
 *   post:
 *     tags: [Marketing]
 *     summary: Add a prospective client
 *     responses:
 *       201: { description: Prospect created }
 *
 * /api/v1/marketing/prospects/{id}/convert:
 *   post:
 *     tags: [Marketing]
 *     summary: Turn a won prospect into a client
 *     responses:
 *       201: { description: Client created }
 *
 * /api/v1/marketing/bids:
 *   get:
 *     tags: [Marketing]
 *     summary: List bids and tenders
 *     responses:
 *       200: { description: Bids }
 *
 * /api/v1/marketing/dashboard:
 *   get:
 *     tags: [Marketing]
 *     summary: Pipeline counts, target progress and recent activity
 *     responses:
 *       200: { description: Dashboard }
 *
 * /api/v1/marketing/reports/{type}:
 *   get:
 *     tags: [Marketing]
 *     summary: Report data as JSON; append /export for an Excel download
 *     responses:
 *       200: { description: Report }
 */
import { Router, type IRouter, type Request, type Response } from 'express';
import * as XLSX from 'xlsx';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../errors/AppError';
import { marketingService } from '../services/marketingService';
import {
  ROLES,
  MARKETING_REPORT_VALUES,
  CreateProspectSchema,
  UpdateProspectSchema,
  CreateBidSchema,
  UpdateBidSchema,
  CreateTargetSchema,
} from '@stap/shared';
import type { MarketingReportType } from '@stap/shared';

const router: IRouter = Router();
router.use(authenticate);

const MARKETING_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MARKETING] as const;
/** Setting someone's target is a management act, not a marketing one. */
const TARGET_WRITE_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER] as const;

router.use(requireRole(...MARKETING_ROLES));

const page  = (req: Request) => Number(req.query.page ?? 1);
const limit = (req: Request) => Math.min(Number(req.query.limit ?? 50), 200);

function reportType(raw: string): MarketingReportType {
  if (!(MARKETING_REPORT_VALUES as readonly string[]).includes(raw)) {
    throw new AppError(
      `Unknown report "${raw}". Choose one of: ${MARKETING_REPORT_VALUES.join(', ')}.`,
      400,
    );
  }
  return raw as MarketingReportType;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.getDashboard(req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Reports ───────────────────────────────────────────────────────────────────
// Declared before /prospects/:id etc. so the literal segments win.

router.get(
  '/reports/:type/export',
  asyncHandler(async (req: Request, res: Response) => {
    const report = await marketingService.generateReport(reportType(req.params.type), {
      dateFrom:     req.query.dateFrom     as string | undefined,
      dateTo:       req.query.dateTo       as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
    });

    const sheet = XLSX.utils.aoa_to_sheet([
      [report.title],
      [`Generated ${new Date(report.generatedAt).toLocaleString('en-GB')}`],
      ...(report.summary.length ? [report.summary.map(s => `${s.label}: ${s.value}`)] : []),
      [],
      report.columns,
      ...report.rows,
    ]);
    sheet['!cols'] = report.columns.map(c => ({ wch: Math.max(14, c.length + 2) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, report.title.slice(0, 31));
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `STAP_${report.type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }),
);

router.get(
  '/reports/:type',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.generateReport(reportType(req.params.type), {
      dateFrom:     req.query.dateFrom     as string | undefined,
      dateTo:       req.query.dateTo       as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
    });
    res.json({ success: true, data });
  }),
);

// ── Prospects ─────────────────────────────────────────────────────────────────

router.get(
  '/prospects',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await marketingService.listProspects({
      status:       req.query.status       as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
      search:       req.query.search       as string | undefined,
      page:         page(req),
      limit:        limit(req),
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/prospects',
  validate(CreateProspectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.createProspect(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/prospects/:id/convert',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.convertProspect(req.params.id, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/prospects/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.getProspect(req.params.id);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/prospects/:id',
  validate(UpdateProspectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.updateProspect(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Bids ──────────────────────────────────────────────────────────────────────

router.get(
  '/bids',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await marketingService.listBids({
      status:       req.query.status       as string | undefined,
      bidType:      req.query.bidType      as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
      search:       req.query.search       as string | undefined,
      page:         page(req),
      limit:        limit(req),
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/bids',
  validate(CreateBidSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.createBid(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/bids/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.getBid(req.params.id);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/bids/:id',
  validate(UpdateBidSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.updateBid(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Targets ───────────────────────────────────────────────────────────────────

router.get(
  '/targets',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.listTargets({
      assignedToId: req.query.assignedToId as string | undefined,
      period:       req.query.period       as string | undefined,
    });
    res.json({ success: true, data });
  }),
);

router.post(
  '/targets',
  requireRole(...TARGET_WRITE_ROLES),
  validate(CreateTargetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.createTarget(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/targets/:id/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await marketingService.refreshTarget(req.params.id);
    res.json({ success: true, data });
  }),
);

export { router as marketingRouter };
