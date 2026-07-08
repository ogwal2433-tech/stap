import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { systemErrorService } from '../services/systemErrorService';
import {
  ROLES,
  UpdateErrorStatusSchema,
  BulkUpdateErrorStatusSchema,
  SystemErrorQuerySchema,
} from '@stap/shared';

const router: IRouter = Router();

const ERROR_ADMIN_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

router.use(authenticate, requireRole(...ERROR_ADMIN_ROLES));

// GET /system-errors — list with filtering
router.get(
  '/',
  validateQuery(SystemErrorQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await systemErrorService.list(req.query as any);
    res.json({ success: true, ...result });
  }),
);

// GET /system-errors/stats — dashboard stats
// Registered before /:id so "stats" isn't swallowed by the :id param route.
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await systemErrorService.getStats();
    res.json({ success: true, data: stats });
  }),
);

// PATCH /system-errors/bulk — bulk resolve/ignore
router.patch(
  '/bulk',
  requireRole(ROLES.DIRECTOR),
  validate(BulkUpdateErrorStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const count = await systemErrorService.bulkUpdateStatus(req.body.ids, req.body.status);
    res.json({ success: true, data: { updated: count } });
  }),
);

// GET /system-errors/:id — full detail
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const error = await systemErrorService.getById(req.params.id);
    res.json({ success: true, data: error });
  }),
);

// PATCH /system-errors/:id/status — investigate / resolve / ignore
router.patch(
  '/:id/status',
  validate(UpdateErrorStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const error = await systemErrorService.updateStatus(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: error });
  }),
);

export { router as systemErrorsRouter };
