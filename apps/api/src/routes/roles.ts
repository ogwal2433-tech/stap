import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { PERMISSIONS } from '../constants/permissions';
import { roleService } from '../services/roleService';
import { CreateRoleSchema, UpdateRoleSchema } from '@stap/shared';

/**
 * /roles — which roles exist and what they are called.
 * What each role may do lives under /permissions.
 */
const router = Router();

router.use(authenticate);

// Read by the matrix, and by anyone assigning a role to a person: the staff and
// user forms need the list without holding roles.manage. ?assignable=true
// narrows to enabled staff roles.
router.get(
  '/',
  requireAnyPermission(
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.STAFF_VIEW,
    PERMISSIONS.STAFF_CREATE,
    PERMISSIONS.STAFF_EDIT,
    PERMISSIONS.SETTINGS_VIEW,
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await roleService.list({ assignable: req.query.assignable === 'true' });
    res.json({ success: true, data });
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  validate(CreateRoleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await roleService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/:name',
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  validate(UpdateRoleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await roleService.update(req.params.name as string, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/:name',
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await roleService.remove(req.params.name as string, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export default router;
