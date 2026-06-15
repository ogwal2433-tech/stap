import { Router, type IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { ROLES } from '@stap/shared';
import { CreateServiceRequestSchema, UpdateServiceRequestSchema } from '@stap/shared';
import { serviceRequestService } from '../services/serviceRequestService';

const router: IRouter = Router();

router.use(authenticate);

// ── List all (Director / AM / Admin) ──────────────────────────────────────────
router.get(
  '/',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const { status, clientId, page, limit } = req.query as Record<string, string>;
    const data = await serviceRequestService.listAll({
      status, clientId,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, ...data });
  }),
);

// ── Create ─────────────────────────────────────────────────────────────────────
router.post(
  '/',
  validate(CreateServiceRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// ── List by client ─────────────────────────────────────────────────────────────
router.get(
  '/client/:clientId',
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query as Record<string, string>;
    const data = await serviceRequestService.listByClient(
      req.params.clientId,
      page  ? Number(page)  : 1,
      limit ? Number(limit) : 20,
    );
    res.json({ success: true, ...data });
  }),
);

// ── Get by ID ──────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.getById(req.params.id);
    res.json({ success: true, data });
  }),
);

// ── Update ─────────────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR),
  validate(UpdateServiceRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await serviceRequestService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Delete ─────────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    await serviceRequestService.delete(req.params.id);
    res.json({ success: true });
  }),
);

export default router;
