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
 *                     timeIn: { type: string }
 *                     timeOut: { type: string }
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
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import {
  ROLES,
  DEPLOYMENT_ROLES,
  INTERNAL_ROLES,
  CreateRosterSchema,
  MarkAttendanceSchema,
  SupervisorCheckinSchema,
  DeploymentListQuerySchema,
  AttendanceQuerySchema,
} from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// ── POST /roster — create deployment roster ────────────────────────────────────
router.post(
  '/roster',
  requireRole(ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR),
  validate(CreateRosterSchema),
  asyncHandler(async (req, res) => {
    const result = await deploymentService.createRoster(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: result });
  }),
);

// ── GET /today — today's deployments ──────────────────────────────────────────
router.get(
  '/today',
  requireRole(...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER),
  validateQuery(DeploymentListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@stap/shared').DeploymentListQuery;
    const result = await deploymentService.getTodaysDeployments(query);
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /sheet — daily deployment sheet ───────────────────────────────────────
router.get(
  '/sheet',
  requireRole(...DEPLOYMENT_ROLES, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const result = await deploymentService.getDailySheet(date, siteId);
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
    ROLES.MARKETING,
  ),
  validateQuery(AttendanceQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@stap/shared').AttendanceQuery;
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

// ── POST /checkin — supervisor site check-in ──────────────────────────────────
router.post(
  '/checkin',
  requireRole(ROLES.FIELD_SUPERVISOR, ROLES.OPERATIONS_SUPERVISOR),
  guardDocumentUpload.single('photo'),
  asyncHandler(async (req, res) => {
    // Parse body (may come as JSON or multipart)
    let body = req.body as import('@stap/shared').SupervisorCheckinInput;

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

// ── GET /guards/:guardId/upcoming — upcoming deployments for a guard ───────────
router.get(
  '/guards/:guardId/upcoming',
  requireRole(...DEPLOYMENT_ROLES, ROLES.GUARD),
  asyncHandler(async (req, res) => {
    const { guardId } = req.params;

    // Guards can only see their own upcoming deployments
    if (req.user!.role === ROLES.GUARD && req.user!.userId !== guardId) {
      throw new AppError('Forbidden', 403);
    }

    const days = parseInt(String(req.query.days ?? '7'), 10);
    const deployments = await deploymentService.getUpcomingDeployments(guardId, days);
    res.status(200).json({ success: true, data: deployments });
  }),
);

export { router as attendanceRouter };
