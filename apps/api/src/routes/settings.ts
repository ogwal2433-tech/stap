/**
 * @openapi
 * tags:
 *   - name: Settings
 *     description: System settings and user management (DIRECTOR only)
 *
 * /api/v1/settings:
 *   get:
 *     tags: [Settings]
 *     summary: List all system settings
 *     responses:
 *       200:
 *         description: All settings grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SystemSetting'
 *
 * /api/v1/settings/{key}:
 *   put:
 *     tags: [Settings]
 *     summary: Update a single setting by key (DIRECTOR only)
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: { type: string }
 *     responses:
 *       200:
 *         description: Setting updated
 *       400:
 *         description: Value fails dataType validation
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *
 * /api/v1/settings/bulk:
 *   put:
 *     tags: [Settings]
 *     summary: Update multiple settings at once (DIRECTOR only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 *     responses:
 *       200:
 *         description: All settings updated
 *
 * /api/v1/settings/users:
 *   get:
 *     tags: [Settings]
 *     summary: List all system users (DIRECTOR only)
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       200:
 *         description: Paginated user list
 *   post:
 *     tags: [Settings]
 *     summary: Create a new system user (DIRECTOR only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string }
 *     responses:
 *       201:
 *         description: User created, welcome email queued
 *       409:
 *         description: Email already in use
 *
 * /api/v1/settings/users/{id}:
 *   patch:
 *     tags: [Settings]
 *     summary: Update user name, role or status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User updated
 *
 * /api/v1/settings/users/{id}/reset-password:
 *   post:
 *     tags: [Settings]
 *     summary: Admin reset of user password (DIRECTOR only)
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
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset, refresh tokens invalidated
 *
 * /api/v1/settings/users/{id}/deactivate:
 *   post:
 *     tags: [Settings]
 *     summary: Deactivate a user (DIRECTOR only — cannot deactivate self)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User deactivated, session invalidated
 *       403:
 *         description: Cannot deactivate your own account
 */
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
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    res.json({ success: true, data });
  }),
);

router.get(
  '/group/:group',
  requireRole(ROLES.DIRECTOR),
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
