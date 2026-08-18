import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { auditLogService } from '../services/auditLogService';
import { ROLES, AuditLogQuerySchema } from '@stap/shared';

/**
 * Read-only view of the audit trail.
 *
 * There is deliberately no write or delete route: entries are appended by the
 * services that make the change, and an audit trail that can be edited from the
 * outside is not an audit trail.
 */
const router: IRouter = Router();

const AUDIT_ADMIN_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

router.use(authenticate, requireRole(...AUDIT_ADMIN_ROLES));

// GET /audit-logs — filtered, paginated trail
router.get(
  '/',
  validateQuery(AuditLogQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await auditLogService.list(req.query as never);
    res.json({ success: true, data });
  }),
);

// GET /audit-logs/:id — one entry in full
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await auditLogService.getById(req.params.id);
    res.json({ success: true, data });
  }),
);

export { router as auditLogsRouter };
