import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { hasPermission } from '../middleware/permissions';
import { PERMISSIONS, type PermissionKey } from '../constants/permissions';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError } from '../errors/AppError';
import { softDeleteService, type DeletableType } from '../services/softDeleteService';

/**
 * The Deleted records page. Each kind of record is listed only to someone who
 * may delete — and therefore restore — it; restore itself lives on each
 * entity's own routes beside its delete.
 */
export const DELETE_PERMISSION: Record<DeletableType, PermissionKey> = {
  client:   PERMISSIONS.CLIENTS_DELETE,
  guard:    PERMISSIONS.GUARDS_DELETE,
  staff:    PERMISSIONS.STAFF_DELETE,
  contract: PERMISSIONS.CONTRACTS_DELETE,
  site:     PERMISSIONS.SITES_DELETE,
};

const Query = z.object({ type: z.enum(['client', 'guard', 'staff', 'contract', 'site']) });

const router: IRouter = Router();
router.use(authenticate);

// GET /deleted-records?type=client
router.get(
  '/',
  validateQuery(Query),
  asyncHandler(async (req, res) => {
    const type = req.query.type as DeletableType;
    if (!(await hasPermission(req.user!.role, DELETE_PERMISSION[type]))) {
      throw new ForbiddenError(`Access denied. Missing permission: ${DELETE_PERMISSION[type]}.`);
    }
    res.json({ success: true, data: await softDeleteService.listDeleted(type) });
  }),
);

export { router as deletedRecordsRouter };
