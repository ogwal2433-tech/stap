import { Router, type IRouter } from 'express';
import {
  ROLES,
  CreateStaffSchema,
  UpdateStaffSchema,
  DeactivateStaffSchema,
  StaffListQuerySchema,
  type StaffListQuery,
} from '@security360/shared';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { staffService } from '../services/staffService';
import { softDeleteService } from '../services/softDeleteService';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';

const router: IRouter = Router();

/** Who may see and edit the staff directory. */
const STAFF_MANAGER_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

/**
 * Turning an account off, back on, or resetting its password is a narrower
 * privilege than editing a phone number — Assistant Managers are deliberately
 * left out of it.
 */
const ACCOUNT_CONTROL_ROLES = [ROLES.DIRECTOR, ROLES.ADMINISTRATOR];

/**
 * @openapi
 * tags:
 *   name: Staff
 *   description: Internal staff accounts — directory, roles, and account status
 */

/**
 * @openapi
 * /api/v1/staff:
 *   get:
 *     tags: [Staff]
 *     summary: List internal staff accounts (excludes guards and client portal users)
 *     parameters:
 *       - { in: query, name: role,     schema: { type: string } }
 *       - { in: query, name: isActive, schema: { type: string, enum: ['true','false'] } }
 *       - { in: query, name: search,   schema: { type: string } }
 *       - { in: query, name: page,     schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,    schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Paginated staff list with an active head-count per role
 */
router.get(
  '/',
  authenticate,
  requireRole(...STAFF_MANAGER_ROLES),
  validateQuery(StaffListQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as StaffListQuery;
    const data = await staffService.list({
      role:     q.role,
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      search:   q.search,
      page:     q.page,
      limit:    q.limit,
    });
    res.status(200).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff/{id}:
 *   get:
 *     tags: [Staff]
 *     summary: Get one staff member, with their last 10 audit log entries
 *     responses:
 *       200: { description: Staff profile }
 *       404: { description: Staff member not found }
 */
router.get(
  '/:id',
  authenticate,
  requireRole(...STAFF_MANAGER_ROLES),
  asyncHandler(async (req, res) => {
    const data = await staffService.getById(req.params.id);
    res.status(200).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff:
 *   post:
 *     tags: [Staff]
 *     summary: Create a staff account
 *     description: Omit `password` to have a secure one generated and emailed to the new user.
 *     responses:
 *       201: { description: Account created, welcome email queued }
 *       409: { description: Email already in use }
 */
router.post(
  '/',
  authenticate,
  requireRole(...STAFF_MANAGER_ROLES),
  validate(CreateStaffSchema),
  asyncHandler(async (req, res) => {
    const data = await staffService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff/{id}:
 *   patch:
 *     tags: [Staff]
 *     summary: Update staff details or role
 *     responses:
 *       200: { description: Staff member updated }
 *       400: { description: Attempted to change your own role }
 */
router.patch(
  '/:id',
  authenticate,
  requireRole(...STAFF_MANAGER_ROLES),
  validate(UpdateStaffSchema),
  asyncHandler(async (req, res) => {
    const data = await staffService.update(req.params.id, req.body, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff/{id}/deactivate:
 *   patch:
 *     tags: [Staff]
 *     summary: Deactivate a staff account (Director/Administrator; cannot deactivate self)
 *     responses:
 *       200: { description: Account deactivated and sessions revoked }
 *       400: { description: Self-deactivation, already inactive, or last active Director }
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requireRole(...ACCOUNT_CONTROL_ROLES),
  validate(DeactivateStaffSchema),
  asyncHandler(async (req, res) => {
    const data = await staffService.deactivate(req.params.id, req.body.reason, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

// ── DELETE /:id — delete an account created by mistake ────────────────────────
// Only one that has never signed in and has nothing recorded against it. Anyone
// else is deactivated, which keeps their name on everything they touched.
router.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.STAFF_DELETE),
  asyncHandler(async (req, res) => {
    const data = await softDeleteService.deleteStaff(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

// ── POST /:id/restore ─────────────────────────────────────────────────────────
router.post(
  '/:id/restore',
  authenticate,
  requirePermission(PERMISSIONS.STAFF_DELETE),
  asyncHandler(async (req, res) => {
    const data = await softDeleteService.restoreStaff(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff/{id}/reactivate:
 *   patch:
 *     tags: [Staff]
 *     summary: Restore a deactivated staff account
 *     responses:
 *       200: { description: Account reactivated }
 *       400: { description: Account is already active }
 */
router.patch(
  '/:id/reactivate',
  authenticate,
  requireRole(...ACCOUNT_CONTROL_ROLES),
  asyncHandler(async (req, res) => {
    const data = await staffService.reactivate(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

/**
 * @openapi
 * /api/v1/staff/{id}/reset-password:
 *   post:
 *     tags: [Staff]
 *     summary: Generate a new password, email it to the user, and revoke their sessions
 *     responses:
 *       200: { description: Password reset and emailed }
 */
router.post(
  '/:id/reset-password',
  authenticate,
  requireRole(...ACCOUNT_CONTROL_ROLES),
  asyncHandler(async (req, res) => {
    const data = await staffService.resetPassword(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

export { router as staffRouter };
