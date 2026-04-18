import { Router, type IRouter } from 'express';
import { hrService } from '../services/hrService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError } from '../errors/AppError';
import {
  ROLES,
  HR_ROLES,
  INTERNAL_ROLES,
  CreateApplicantSchema,
  UpdateApplicantStageSchema,
  CreateTrainingSessionSchema,
  RecordTrainingResultsSchema,
  CreateLeaveRequestSchema,
  ApproveLeaveSchema,
  SaveLetterTemplateSchema,
  CreateGuardSchema,
} from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// ── Recruitment ────────────────────────────────────────────────────────────────

router.get(
  '/applicants',
  requireRole(...HR_ROLES, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const stage = req.query.stage as string | undefined;
    const result = await hrService.listApplicants({ stage, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/applicants',
  requireRole(...HR_ROLES),
  validate(CreateApplicantSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.createApplicant(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/applicants/pipeline',
  requireRole(...HR_ROLES, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (_req, res) => {
    const data = await hrService.getPipelineSummary();
    res.json({ success: true, data });
  }),
);

router.patch(
  '/applicants/:id/stage',
  requireRole(...HR_ROLES),
  validate(UpdateApplicantStageSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.updateStage(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/applicants/:id/convert',
  requireRole(...HR_ROLES),
  validate(CreateGuardSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.convertToGuard(req.params.id, req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// ── Training ───────────────────────────────────────────────────────────────────

const TRAINING_VIEW_ROLES = INTERNAL_ROLES.filter(
  (r) => r !== ROLES.GUARD && r !== ROLES.CLIENT,
);

router.get(
  '/training',
  requireRole(...TRAINING_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const page      = Number(req.query.page)  || 1;
    const limit     = Number(req.query.limit) || 20;
    const status    = req.query.status    as string | undefined;
    const trainerId = req.query.trainerId as string | undefined;
    const result = await hrService.listSessions({ status, trainerId, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/training',
  requireRole(...HR_ROLES, ROLES.TRAINER),
  validate(CreateTrainingSessionSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.createTrainingSession(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/training/:id/results',
  requireRole(...HR_ROLES, ROLES.TRAINER),
  validate(RecordTrainingResultsSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.recordResults(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Leave ──────────────────────────────────────────────────────────────────────

const LEAVE_ROLES = INTERNAL_ROLES.filter((r) => r !== ROLES.CLIENT);

router.get(
  '/leave',
  requireRole(...LEAVE_ROLES),
  asyncHandler(async (req, res) => {
    const page    = Number(req.query.page)  || 1;
    const limit   = Number(req.query.limit) || 20;
    const status  = req.query.status  as string | undefined;
    const type    = req.query.type    as string | undefined;
    let guardId   = req.query.guardId as string | undefined;

    // Guards can only see their own leave requests
    if (req.user!.role === ROLES.GUARD) {
      const guard = await import('../db/prisma').then((m) =>
        m.default.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } }),
      );
      guardId = guard?.id;
    }

    const result = await hrService.listLeaveRequests({ guardId, status, type, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/leave',
  requireRole(...LEAVE_ROLES),
  validate(CreateLeaveRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.requestLeave(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/leave/:guardId/balance',
  requireRole(...HR_ROLES, ROLES.GUARD),
  asyncHandler(async (req, res) => {
    // Guards can only check own balance
    if (req.user!.role === ROLES.GUARD) {
      const guard = await import('../db/prisma').then((m) =>
        m.default.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } }),
      );
      if (guard?.id !== req.params.guardId) {
        throw new ForbiddenError('Guards can only view their own leave balance');
      }
    }
    const data = await hrService.getLeaveBalance(req.params.guardId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/leave/:id/approve',
  requireRole(...HR_ROLES),
  validate(ApproveLeaveSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.approveLeave(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Letter Templates ───────────────────────────────────────────────────────────

router.get(
  '/templates',
  requireRole(...HR_ROLES),
  asyncHandler(async (_req, res) => {
    const data = await hrService.listTemplates();
    res.json({ success: true, data });
  }),
);

router.get(
  '/templates/:letterType',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const data = await hrService.getTemplate(req.params.letterType);
    res.json({ success: true, data });
  }),
);

router.put(
  '/templates/:letterType',
  requireRole(...HR_ROLES),
  validate(SaveLetterTemplateSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.saveTemplate(req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/templates/:letterType/preview',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const { sampleData } = req.body as { sampleData: Record<string, string> };
    const html = await hrService.previewTemplate(req.params.letterType, sampleData ?? {});
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }),
);

export { router as hrRouter };
