import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { serviceRequestService } from '../services/serviceRequestService';
import { ROLES, UpdateServiceRequestSchema, SR_STATUS_VALUES } from '@stap/shared';
import { z } from 'zod';

/**
 * Staff view of client service requests.
 *
 * Clients raise these through /portal/service-requests and only ever see their
 * own; this router is the other half of that conversation, and every route here
 * is closed to the CLIENT role.
 */
const router: IRouter = Router();

const SR_STAFF_ROLES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.CONTROL_ROOM,
  ROLES.ADMINISTRATOR,
] as const;

const ListQuery = z.object({
  status:   z.enum(SR_STATUS_VALUES).optional(),
  clientId: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticate, requireRole(...SR_STAFF_ROLES));

// GET /service-requests/summary — declared before /:id so it is not read as an id
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const data = await serviceRequestService.getSummary();
    res.json({ success: true, data });
  }),
);

// GET /service-requests — every client's requests
router.get(
  '/',
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    const result = await serviceRequestService.listAll(req.query as never);
    res.json({ success: true, ...result });
  }),
);

// GET /service-requests/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.getByIdForStaff(req.params.id);
    res.json({ success: true, data });
  }),
);

// PATCH /service-requests/:id/status — move it along and reply to the client
router.patch(
  '/:id/status',
  validate(UpdateServiceRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.updateStatus(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as serviceRequestsRouter };
