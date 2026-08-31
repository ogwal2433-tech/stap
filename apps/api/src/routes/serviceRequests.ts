import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { serviceRequestService } from '../services/serviceRequestService';
import { UpdateServiceRequestSchema, SR_STATUS_VALUES } from '@stap/shared';
import { z } from 'zod';

/**
 * Staff view of client service requests.
 *
 * Clients raise these through /portal/service-requests and only ever see their
 * own; this router is the other half of that conversation, and every route here
 * is closed to the CLIENT role.
 */
const router: IRouter = Router();

const ListQuery = z.object({
  status:   z.enum(SR_STATUS_VALUES).optional(),
  clientId: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

// Authentication for the whole file; what each route needs is stated on the
// route. The guard here used to be a hardcoded role list, which meant granting
// service_requests.view in Settings → Roles & Permissions wrote a row nothing
// read: the Accounts Officer holds that permission and was still refused. Access
// is now decided by the grants, so the UI is the one place that governs it.
router.use(authenticate);

// GET /service-requests/summary — declared before /:id so it is not read as an id
router.get(
  '/summary',
  requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW),
  asyncHandler(async (_req, res) => {
    const data = await serviceRequestService.getSummary();
    res.json({ success: true, data });
  }),
);

// GET /service-requests — every client's requests
router.get(
  '/',
  requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW),
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    const result = await serviceRequestService.listAll(req.query as never);
    res.json({ success: true, ...result });
  }),
);

// GET /service-requests/:id
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW),
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.getByIdForStaff(req.params.id);
    res.json({ success: true, data });
  }),
);

// PATCH /service-requests/:id/status — move it along and reply to the client
router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.SERVICE_REQUESTS_RESPOND),
  validate(UpdateServiceRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.updateStatus(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as serviceRequestsRouter };
