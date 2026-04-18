import { Router, type IRouter } from 'express';
import { settingsService } from '../services/settingsService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError } from '../errors/AppError';
import { ROLES } from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// ── System Settings ────────────────────────────────────────────────────────────

router.get(
  '/',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    res.json({ success: true, data });
  }),
);

router.get(
  '/group/:group',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req, res) => {
    const data = await settingsService.getGroup(req.params.group);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const { settings } = req.body as { settings: { key: string; value: string }[] };
    const data = await settingsService.updateMany(settings, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── User Management ────────────────────────────────────────────────────────────

router.get(
  '/users',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req, res) => {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const role   = req.query.role   as string | undefined;
    const status = req.query.status as string | undefined;
    const result = await settingsService.listUsers({ role, status, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/users',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await settingsService.createUser(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/users/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.userId && req.body.role !== undefined) {
      throw new ForbiddenError('Cannot change your own role');
    }
    const data = await settingsService.updateUser(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/users/:id/reset-password',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const { newPassword } = req.body as { newPassword: string };
    await settingsService.resetPassword(req.params.id, newPassword, req.user!.userId);
    res.json({ success: true, message: 'Password reset successfully' });
  }),
);

router.post(
  '/users/:id/deactivate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    await settingsService.deactivateUser(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'User deactivated' });
  }),
);

export { router as settingsRouter };
