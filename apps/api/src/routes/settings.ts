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
import { z } from 'zod';
import { settingsService } from '../services/settingsService';
import { rankService } from '../services/rankService';
import { shiftTypeService } from '../services/shiftTypeService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, ForbiddenError } from '../errors/AppError';
import {
  ROLES,
  CreateGuardRankSchema,
  UpdateGuardRankSchema,
  ReorderGuardRanksSchema,
  CreateDeductionTypeSchema,
  UpdateDeductionTypeSchema,
  ReorderDeductionTypesSchema,
  CreateShiftTypeSchema,
  UpdateShiftTypeSchema,
  ReorderShiftTypesSchema,
} from '@stap/shared';

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

// ── Guard Rank Management ──────────────────────────────────────────────────────

// GET /ranks — all authenticated users (needed for guard form dropdown)
router.get(
  '/ranks',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const data = await rankService.listRanks(activeOnly);
    res.json({ success: true, data });
  }),
);

// PUT /ranks/reorder — must come before /ranks/:id to avoid param conflict
router.put(
  '/ranks/reorder',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = ReorderGuardRanksSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await rankService.reorderRanks(parsed.data.orderedIds);
    res.json({ success: true, data });
  }),
);

router.post(
  '/ranks',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = CreateGuardRankSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await rankService.createRank(parsed.data, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/ranks/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = UpdateGuardRankSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await rankService.updateRank(req.params.id, parsed.data, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/ranks/:id/deactivate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const result = await rankService.deactivateRank(req.params.id, req.user!.userId);
    res.json({ success: true, data: result.rank, guardsWithRank: result.guardsWithRank });
  }),
);

router.patch(
  '/ranks/:id/activate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await rankService.activateRank(req.params.id);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/ranks/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    await rankService.deleteRank(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

// ── Deduction Type Management ──────────────────────────────────────────────────

// GET /deduction-types — all authenticated users (needed for deduction form dropdown)
router.get(
  '/deduction-types',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const data = await settingsService.listDeductionTypes(activeOnly);
    res.json({ success: true, data });
  }),
);

// PUT /deduction-types/reorder — must come before /:id to avoid param conflict
router.put(
  '/deduction-types/reorder',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = ReorderDeductionTypesSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await settingsService.reorderDeductionTypes(parsed.data.orderedIds);
    res.json({ success: true, data });
  }),
);

router.post(
  '/deduction-types',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = CreateDeductionTypeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await settingsService.createDeductionType(parsed.data, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/deduction-types/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    if (req.body?.code !== undefined) {
      throw new AppError('Deduction type code cannot be changed after creation.', 400);
    }
    const parsed = UpdateDeductionTypeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await settingsService.updateDeductionType(req.params.id, parsed.data, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/deduction-types/:id/deactivate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await settingsService.deactivateDeductionType(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/deduction-types/:id/activate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await settingsService.activateDeductionType(req.params.id);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/deduction-types/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    await settingsService.deleteDeductionType(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

// ── Shift Types ────────────────────────────────────────────────────────────────

// GET /shift-types — all authenticated roles (needed for roster builder)
router.get(
  '/shift-types',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const data = await shiftTypeService.listShiftTypes(activeOnly);
    res.json({ success: true, data });
  }),
);

// PUT /shift-types/reorder — must come before /:id to avoid param conflict
router.put(
  '/shift-types/reorder',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = ReorderShiftTypesSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid request body', 400);
    const data = await shiftTypeService.reorderShiftTypes(parsed.data.orderedIds);
    res.json({ success: true, data });
  }),
);

router.post(
  '/shift-types',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = CreateShiftTypeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);
    const data = await shiftTypeService.createShiftType(parsed.data, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/shift-types/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const parsed = UpdateShiftTypeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);
    const data = await shiftTypeService.updateShiftType(req.params.id, parsed.data, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/shift-types/:id/deactivate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await shiftTypeService.deactivateShiftType(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/shift-types/:id/activate',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    const data = await shiftTypeService.activateShiftType(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/shift-types/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    await shiftTypeService.deleteShiftType(req.params.id, req.user!.userId);
    res.json({ success: true });
  }),
);

export { router as settingsRouter };
