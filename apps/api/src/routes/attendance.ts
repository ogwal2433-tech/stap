/**
 * @openapi
 * tags:
 *   - name: Attendance
 *     description: Deployment sheets, daily attendance, check-ins, and roster management
 *
 * /api/v1/attendance/today:
 *   get:
 *     tags: [Attendance]
 *     summary: Get today's deployment sheet for all active sites
 *     responses:
 *       200:
 *         description: Today's deployment with guard attendance status
 *
 * /api/v1/attendance/save:
 *   post:
 *     tags: [Attendance]
 *     summary: Save attendance records for a date
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, records]
 *             properties:
 *               date: { type: string, format: date }
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deploymentId: { type: string }
 *                     status: { type: string, enum: [PRESENT, ABSENT, LATE, HALF_DAY] }
 *     responses:
 *       200:
 *         description: Attendance saved
 *
 * /api/v1/attendance/checkin:
 *   post:
 *     tags: [Attendance]
 *     summary: Field supervisor submits a site check-in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [siteId]
 *             properties:
 *               siteId: { type: string, format: uuid }
 *               notes: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       201:
 *         description: Check-in recorded
 *
 * /api/v1/attendance/roster:
 *   post:
 *     tags: [Attendance]
 *     summary: Create or update deployment roster for a site
 *     responses:
 *       201:
 *         description: Roster created
 */
import { Router, type IRouter } from 'express';
import prisma from '../db/prisma';
import { deploymentService } from '../services/deploymentService';
import { attendanceService } from '../services/attendanceService';
import { guardDocumentUpload } from '../config/multer';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import {
  ROLES,
  DEPLOYMENT_ROLES,
  DEPLOYMENT_VIEW_ROLES,
  INTERNAL_ROLES,
  CreateRosterSchema,
  CopyRosterSchema,
  MarkAttendanceSchema,
  SupervisorCheckinSchema,
  DeploymentListQuerySchema,
  AttendanceQuerySchema,
  RequestReplacementSchema,
  DeploymentSheetBatchSchema,
} from '@security360/shared';

const router: IRouter = Router();

router.use(authenticate);

// ── POST /deployment-sheet — save a whole Excel-style sheet in one call ───────
router.post(
  '/deployment-sheet',
  requireRole(...DEPLOYMENT_ROLES),
  validate(DeploymentSheetBatchSchema),
  asyncHandler(async (req, res) => {
    const result = await deploymentService.saveDeploymentSheet(
      req.body.rows,
      req.user!.userId,
      req.user!.role,
    );
    res.status(200).json({ success: true, data: result });
  }),
);

// ── POST /roster — create deployment roster ────────────────────────────────────
router.post(
  '/roster',
  requireRole(ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR),
  validate(CreateRosterSchema),
  asyncHandler(async (req, res) => {
    const result = await deploymentService.createRoster(req.body, req.user!.userId);

    if (result.created === 0 && result.conflicts.length === 0) {
      return res.status(400).json({ success: false, error: 'No guards were available to deploy.' });
    }

    if (result.created === 0 && result.conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'All selected guards are already deployed on this date.',
        data: { created: 0, conflicts: result.conflicts, skipped: result.skipped },
      });
    }

    const message = result.conflicts.length === 0
      ? `${result.created} guard(s) deployed successfully.`
      : `${result.created} guard(s) deployed. ${result.conflicts.length} guard(s) skipped due to conflicts — they are already deployed on this date.`;

    const status = result.conflicts.length === 0 ? 201 : 200;
    return res.status(status).json({ success: true, data: { ...result, message } });
  }),
);

// ── GET /today — today's deployments ──────────────────────────────────────────
router.get(
  '/today',
  requireRole(...DEPLOYMENT_VIEW_ROLES),
  validateQuery(DeploymentListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@security360/shared').DeploymentListQuery;
    const result = await deploymentService.getTodaysDeployments(query);
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /sheet — daily deployment sheet ───────────────────────────────────────
router.get(
  '/sheet',
  requireRole(...DEPLOYMENT_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const date   = typeof req.query.date   === 'string' ? req.query.date   : undefined;
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
    const result = await deploymentService.getDailySheet(date, siteId, zoneId);
    res.status(200).json({ success: true, data: result });
  }),
);

// ── DELETE /deployments/:id — remove a deployment ─────────────────────────────
router.delete(
  '/deployments/:id',
  requireRole(ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (req, res) => {
    await deploymentService.deleteDeployment(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, message: 'Deployment removed' });
  }),
);

// ── POST /attendance/mark — mark attendance ────────────────────────────────────
router.post(
  '/attendance/mark',
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ADMINISTRATOR,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
  ),
  validate(MarkAttendanceSchema),
  asyncHandler(async (req, res) => {
    const result = await attendanceService.markAttendance(
      req.body.records,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: result });
  }),
);

// ── GET /attendance — list attendance records ──────────────────────────────────
router.get(
  '/attendance',
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.ADMINISTRATOR,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.TRAINER,
    ROLES.ACCOUNTS_OFFICER,
    ROLES.MARKETING_HEAD,
    ROLES.SALES,
    // Reads attendance to answer a leave or discipline question; never edits it.
    ROLES.HR,
  ),
  validateQuery(AttendanceQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@security360/shared').AttendanceQuery;
    const result = await attendanceService.getAttendanceByDate(query);
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /attendance/summary — attendance summary by date range ─────────────────
router.get(
  '/attendance/summary',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const { from, to, guardId, siteId } = req.query as Record<string, string | undefined>;
    if (!from || !to) throw new AppError('from and to query params are required', 400);
    const summary = await attendanceService.getAttendanceSummary(
      from,
      to,
      guardId,
      siteId,
    );
    res.status(200).json({ success: true, data: summary });
  }),
);

// ── GET /attendance/guard-summary — per-guard totals for a period ─────────────
router.get(
  '/attendance/guard-summary',
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.ADMINISTRATOR,
  ),
  asyncHandler(async (req, res) => {
    const { from, to, siteId } = req.query as Record<string, string | undefined>;
    if (!from || !to) throw new AppError('from and to query params are required', 400);
    const data = await attendanceService.getGuardAttendanceSummary(from, to, siteId);
    res.status(200).json({ success: true, data });
  }),
);

// ── POST /checkin — supervisor site check-in ──────────────────────────────────
router.post(
  '/checkin',
  requirePermission(PERMISSIONS.CHECKIN_PERFORM),
  guardDocumentUpload.single('photo'),
  asyncHandler(async (req, res) => {
    // Parse body (may come as JSON or multipart)
    let body = req.body as import('@security360/shared').SupervisorCheckinInput;

    // Validate with Zod manually (multer processes body separately)
    const parsed = SupervisorCheckinSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Validation failed: ' + JSON.stringify(parsed.error.flatten()), 400);
    }
    body = parsed.data;

    let photoUrl: string | undefined;
    if (req.file) {
      photoUrl = `/uploads/${req.file.path.replace(/.*public\/uploads\//, '')}`;
    }

    const checkin = await prisma.supervisorCheckin.create({
      data: {
        supervisorId: req.user!.userId,
        siteId: body.siteId,
        dateTime: new Date(),
        photoUrl: photoUrl ?? null,
        gpsLat: body.gpsLat ?? null,
        gpsLon: body.gpsLon ?? null,
        notes: body.notes ?? null,
        incidentFlag: body.incidentFlag,
      },
      include: { supervisor: { select: { name: true } }, site: { select: { siteName: true } } },
    });

    if (body.incidentFlag) {
      await QueueService.sendSms({
        to: process.env.OPS_MANAGER_PHONE ?? '+256700000000',
        message: `INCIDENT FLAGGED: Supervisor ${checkin.supervisor.name} flagged an incident at ${checkin.site.siteName}.`,
      });
    }

    await QueueService.logAudit({
      userId: req.user!.userId,
      action: 'SUPERVISOR_CHECKIN',
      entity: 'supervisorCheckin',
      entityId: checkin.id,
      newValue: { siteId: body.siteId, incidentFlag: body.incidentFlag },
    });

    res.status(201).json({
      success: true,
      data: {
        id: checkin.id,
        supervisorId: checkin.supervisorId,
        siteId: checkin.siteId,
        dateTime: checkin.dateTime.toISOString(),
        photoUrl: checkin.photoUrl,
        gpsLat: checkin.gpsLat,
        gpsLon: checkin.gpsLon,
        notes: checkin.notes,
        incidentFlag: checkin.incidentFlag,
        createdAt: checkin.createdAt.toISOString(),
      },
    });
  }),
);

// ── GET /dashboard — attendance dashboard stats ────────────────────────────────
router.get(
  '/dashboard',
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.ADMINISTRATOR,
  ),
  asyncHandler(async (req, res) => {
    const data = await deploymentService.getAttendanceDashboard();
    res.status(200).json({ success: true, data });
  }),
);

// ── GET /guards/:guardId/upcoming — upcoming deployments for a guard ───────────
router.get(
  '/guards/:guardId/upcoming',
  requireRole(...DEPLOYMENT_ROLES, ROLES.GUARD),
  asyncHandler(async (req, res) => {
    const { guardId } = req.params;

    // Guards can only see their own upcoming deployments. req.user!.userId is
    // the User.id (login account) — Guard.id is a separate id space linked via
    // Guard.userId, so it must be resolved, not compared directly.
    if (req.user!.role === ROLES.GUARD) {
      const guard = await prisma.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } });
      if (guard?.id !== guardId) {
        throw new AppError('Forbidden', 403);
      }
    }

    const days = parseInt(String(req.query.days ?? '7'), 10);
    const deployments = await deploymentService.getUpcomingDeployments(guardId, days);
    res.status(200).json({ success: true, data: deployments });
  }),
);

// ── POST /roster/copy — copy a previous day's roster to a target date ─────────
router.post(
  '/roster/copy',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const parsed = CopyRosterSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);
    const result = await deploymentService.copyRoster(parsed.data, req.user!.userId);
    res.json({ success: true, data: result });
  }),
);

// ── GET /roster/past-dates — past dates that have rosters (for quick-pick) ────
router.get(
  '/roster/past-dates',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const limit  = parseInt(req.query.limit as string) || 14;
    const result = await deploymentService.getPastRosterDates(limit);
    res.json({ success: true, data: result });
  }),
);

// ── GET /replacements — available guards to replace an absent guard ────────────
router.get(
  '/replacements',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const { siteId, date, absentGuardId } = req.query as {
      siteId?: string; date?: string; absentGuardId?: string;
    };
    if (!siteId || !date || !absentGuardId) throw new AppError('siteId, date, and absentGuardId are required', 400);
    const guards = await deploymentService.getAvailableReplacements(siteId, date, absentGuardId);
    res.json({ success: true, data: guards });
  }),
);

// ── POST /replacements — assign a replacement guard ───────────────────────────
router.post(
  '/replacements',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR),
  validate(RequestReplacementSchema),
  asyncHandler(async (req, res) => {
    const result = await deploymentService.assignReplacement(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: result });
  }),
);

export { router as attendanceRouter };
