import { Router, type IRouter } from 'express';
import { ROLES } from '@security360/shared';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../db/prisma';

const router: IRouter = Router();

// Roles that may see the user list (anyone who can build a roster)
const USER_LIST_ROLES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
];

/**
 * GET /api/v1/users
 * Query params:
 *   roles  — comma-separated Role values to filter by (e.g. OPERATIONS_SUPERVISOR,FIELD_SUPERVISOR)
 *   status — ACTIVE | INACTIVE (defaults to ACTIVE)
 */
router.get(
  '/',
  authenticate,
  requireRole(...USER_LIST_ROLES),
  asyncHandler(async (req, res) => {
    const rolesParam = req.query.roles as string | undefined;
    const statusParam = (req.query.status as string | undefined) ?? 'ACTIVE';

    const roleFilter = rolesParam
      ? rolesParam.split(',').map((r) => r.trim()).filter(Boolean)
      : undefined;

    const users = await prisma.user.findMany({
      where: {
        status: statusParam as 'ACTIVE' | 'INACTIVE',
        ...(roleFilter && roleFilter.length > 0
          ? { role: { in: roleFilter } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        role: true,
        systemId: true,
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ success: true, data: users });
  }),
);

export { router as usersRouter };
