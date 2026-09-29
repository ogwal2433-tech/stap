import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { auditLogService } from '../services/auditLogService';
import { AuditLogQuerySchema, SecurityLogQuerySchema } from '@security360/shared';

/**
 * Read-only view of the audit trail.
 *
 * There is deliberately no write or delete route: entries are appended by the
 * services that make the change, and an audit trail that can be edited from the
 * outside is not an audit trail.
 */
const router: IRouter = Router();

// audit.log, the permission the page already asks for. This used a role list
// of Director, Assistant Manager and Administrator — the same three roles that
// hold audit.log today, so nobody's access changes; granting it now works.
router.use(authenticate, requirePermission(PERMISSIONS.AUDIT_LOG));

// GET /audit-logs — filtered, paginated trail
router.get(
  '/',
  validateQuery(AuditLogQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await auditLogService.list(req.query as never);
    res.json({ success: true, data });
  }),
);

// GET /audit-logs/security — refused requests and sign-in failures.
// Before /:id, or "security" is read as an entry id.
router.get(
  '/security',
  validateQuery(SecurityLogQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await auditLogService.securityLog(req.query as never) });
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
