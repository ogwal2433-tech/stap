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
import { staffPositionService } from '../services/staffPositionService';
import {
  guardFieldRules, CONFIGURABLE_GUARD_FIELDS, ALWAYS_REQUIRED_GUARD_FIELDS,
} from '../lib/guardFieldRules';
import { shiftTypeService } from '../services/shiftTypeService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, ForbiddenError } from '../errors/AppError';
import {
  ROLES,
  CreateGuardRankSchema,
  UpdateGuardRankSchema,
  ReorderGuardRanksSchema,
  CreateStaffPositionSchema,
  UpdateStaffPositionSchema,
  ReorderStaffPositionsSchema,
  CreateDeductionTypeSchema,
  UpdateDeductionTypeSchema,
  ReorderDeductionTypesSchema,
  CreateShiftTypeSchema,
  UpdateShiftTypeSchema,
  ReorderShiftTypesSchema,
  CreateUserSchema,
  UpdateUserSchema,
  ResetPasswordSchema,
} from '@stap/shared';
import { SETTINGS_GROUPS, type SettingsGroup } from '../constants/settingsConfig';
import { groupView, saveGroup, xcelConfig } from '../services/integrationSettings';
import { verifyMailer } from '../lib/mailer';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { REPORT_KEYS, ReportTitleConfigPatchSchema, type ReportKey } from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

const reportKeyParam = (raw: string): ReportKey => {
  if (!REPORT_KEYS.includes(raw as ReportKey)) throw new AppError(`Unknown report key "${raw}". Valid keys: ${REPORT_KEYS.join(', ')}`, 400);
  return raw as ReportKey;
};
router.get('/report-titles', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await settingsService.getReportTitles() });
}));
router.get('/report-titles/email-prefix', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await settingsService.getScheduledReportEmailPrefix() });
}));
router.patch('/report-titles/email-prefix', requirePermission(PERMISSIONS.SETTINGS_EDIT), asyncHandler(async (req, res) => {
  const prefix = z.string().trim().min(1).parse(req.body.prefix);
  res.json({ success: true, data: await settingsService.updateScheduledReportEmailPrefix(prefix, req.user!.userId) });
}));
router.get('/report-titles/:key', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await settingsService.getReportTitle(reportKeyParam(req.params.key)) });
}));
router.patch('/report-titles/:key', requirePermission(PERMISSIONS.SETTINGS_EDIT), asyncHandler(async (req, res) => {
  const key = reportKeyParam(req.params.key);
  const config = ReportTitleConfigPatchSchema.parse(req.body);
  res.json({ success: true, data: await settingsService.updateReportTitles({ [key]: config }, req.user!.userId) });
}));
router.put('/report-titles', requirePermission(PERMISSIONS.SETTINGS_EDIT), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await settingsService.updateReportTitles(req.body, req.user!.userId) });
}));
router.post('/report-titles/reset', requirePermission(PERMISSIONS.SETTINGS_EDIT), asyncHandler(async (req, res) => {
  const data = req.body?.key ? await settingsService.resetReportTitle(reportKeyParam(req.body.key), req.user!.userId)
    : await settingsService.resetAllReportTitles(req.user!.userId);
  res.json({ success: true, data });
}));

// ── System Settings ────────────────────────────────────────────────────────────

// Read access: Director, Assistant Manager, and Administrator all use the
// Settings page — restricting to Director only caused silent 403s for the
// other roles, leaving every dynamic tab (including Security) blank.
router.get(
  '/',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    res.json({ success: true, data });
  }),
);

router.get(
  '/group/:group',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
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
  validate(CreateUserSchema),
  asyncHandler(async (req, res) => {
    const data = await settingsService.createUser(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/users/:id',
  requireRole(ROLES.DIRECTOR),
  validate(UpdateUserSchema),
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
  validate(ResetPasswordSchema),
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

router.post(
  '/ranks/:id/bulk-update-salary',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req, res) => {
    const { newSalary, previousSalary } = req.body as { newSalary: number; previousSalary?: number };
    if (!newSalary || typeof newSalary !== 'number' || newSalary <= 0) {
      throw new AppError('newSalary must be a positive number', 400);
    }
    const data = await rankService.bulkUpdateGuardSalaryByRank(
      req.params.id,
      newSalary,
      req.user!.userId,
      typeof previousSalary === 'number' ? previousSalary : undefined,
    );
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

// GET /guard-fields — which guard fields this deployment requires.
// Any signed-in user: the guard form needs it to mark its labels.
router.get(
  '/guard-fields',
  asyncHandler(async (_req, res) => {
    const [required, labels] = [await guardFieldRules(), CONFIGURABLE_GUARD_FIELDS];
    res.json({
      success: true,
      data: {
        required,
        labels,
        // Named so the form can mark them without pretending they are a choice.
        alwaysRequired: ALWAYS_REQUIRED_GUARD_FIELDS,
      },
    });
  }),
);

// ── Staff Position Management ──────────────────────────────────────────────────

// GET /staff-positions — any signed-in user: the staff form needs the dropdown.
router.get(
  '/staff-positions',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const data = await staffPositionService.listPositions(activeOnly);
    res.json({ success: true, data });
  }),
);

// PUT /staff-positions/reorder — before /:id, or "reorder" is read as an id.
router.put(
  '/staff-positions/reorder',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const parsed = ReorderStaffPositionsSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await staffPositionService.reorderPositions(parsed.data.orderedIds);
    res.json({ success: true, data });
  }),
);

router.post(
  '/staff-positions',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const parsed = CreateStaffPositionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await staffPositionService.createPosition(parsed.data, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/staff-positions/:id',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const parsed = UpdateStaffPositionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400);
    const data = await staffPositionService.updatePosition(req.params.id, parsed.data, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/staff-positions/:id/deactivate',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const result = await staffPositionService.deactivatePosition(req.params.id, req.user!.userId);
    res.json({ success: true, data: result.position, staffWithPosition: result.staffWithPosition });
  }),
);

router.patch(
  '/staff-positions/:id/activate',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const data = await staffPositionService.activatePosition(req.params.id);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/staff-positions/:id',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    await staffPositionService.deletePosition(req.params.id, req.user!.userId);
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


// ── Integrations ──────────────────────────────────────────────────────────────
// SMTP and payment-gateway credentials, editable without a redeploy. Reads need
// settings.view; writes and connection tests need settings.edit, because a test
// exercises the credentials themselves.

router.get(
  '/integrations',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => {
    const groups = await Promise.all(
      (Object.keys(SETTINGS_GROUPS) as SettingsGroup[]).map(async (group) => ({
        group,
        ...SETTINGS_GROUPS[group],
        settings: await groupView(group),
      })),
    );
    res.json({ success: true, data: groups });
  }),
);

router.get(
  '/integrations/:group',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    const group = req.params.group as SettingsGroup;
    if (!(group in SETTINGS_GROUPS)) throw new AppError(`Unknown settings group "${group}".`, 400);
    res.json({ success: true, data: await groupView(group) });
  }),
);

router.post(
  '/integrations/:group',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const group = req.params.group as SettingsGroup;
    if (!(group in SETTINGS_GROUPS)) throw new AppError(`Unknown settings group "${group}".`, 400);

    const { settings } = req.body as { settings?: Array<{ key: string; value: string }> };
    if (!Array.isArray(settings)) {
      throw new AppError('Body must be { settings: [{ key, value }] }.', 400);
    }

    const result = await saveGroup(group, settings, req.user!.userId);
    res.json({
      success: true,
      data:    result,
      message: `${result.saved.length} setting(s) saved.`,
    });
  }),
);

/** Opens a connection with the saved credentials without sending anything. */
router.post(
  '/integrations/smtp/test',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (_req, res) => {
    const { ok, error } = await verifyMailer();
    res.json({
      success: true,
      data: {
        success: ok,
        message: ok ? 'Connected and the credentials were accepted.' : error,
      },
    });
  }),
);

/**
 * Reaches the gateway with the saved credentials. A 401 or 403 back is a
 * definite answer — the endpoint is right and the key is wrong — so it is
 * reported as a failure with that distinction rather than as a network error.
 */
router.post(
  '/integrations/xcel/test',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (_req, res) => {
    const cfg = await xcelConfig();
    if (!cfg.apiKey || !cfg.merchantId) {
      res.json({
        success: true,
        data: { success: false, message: 'API key and merchant ID are not set.' },
      });
      return;
    }
    try {
      const r = await fetch(`${cfg.baseUrl}/api/v1/health`, {
        headers: { 'x-api-key': cfg.apiKey, 'x-merchant-id': cfg.merchantId },
        signal:  AbortSignal.timeout(10_000),
      });
      // Any answer proves the endpoint resolves and is listening. Only a 401 or
      // 403 says anything about the credentials; a 404 means this build guessed
      // at a health path the gateway does not publish, which is not a failure of
      // the configuration and should not be reported as one.
      const rejected = r.status === 401 || r.status === 403;
      res.json({
        success: true,
        data: {
          success: !rejected,
          message: rejected
            ? `Reached ${cfg.baseUrl}, but it rejected the credentials (${r.status}). Check the API key and merchant ID.`
            : r.ok
              ? `Reached ${cfg.baseUrl} and the credentials were accepted.`
              : `Reached ${cfg.baseUrl} — it answered ${r.status} to the health probe, which it may not publish. ` +
                `The endpoint resolves; the credentials are only confirmed by a real payment.`,
        },
      });
    } catch (err) {
      res.json({
        success: true,
        data: { success: false, message: `Could not reach ${cfg.baseUrl}: ${(err as Error).message}` },
      });
    }
  }),
);

export { router as settingsRouter };
