import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ROLES, CreateZoneSchema, UpdateZoneSchema } from '@stap/shared';
import { zoneService } from '../services/zoneService';

const router: IRouter = Router();

router.use(authenticate);

const VIEW_ROLES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
] as const;

const WRITE_ROLES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
] as const;

// GET /zones — list all zones (admin sees all, supervisors use /my-zones)
router.get(
  '/',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const result = await zoneService.list({
      page:     req.query.page     ? Number(req.query.page)  : undefined,
      limit:    req.query.limit    ? Number(req.query.limit) : undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      search:   req.query.search as string | undefined,
    });
    res.json({ success: true, ...result });
  }),
);

// GET /zones/my-zones — zones where the caller is supervisor or alternate
router.get(
  '/my-zones',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const zones = await zoneService.listForSupervisor(req.user!.userId);
    res.json({ success: true, data: zones });
  }),
);

// GET /zones/:id — single zone detail
router.get(
  '/:id',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.getById(req.params.id);
    res.json({ success: true, data: zone });
  }),
);

// GET /zones/:id/roster-data — zone + sites + available guards for a given date
router.get(
  '/:id/roster-data',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const data = await zoneService.getRosterData(
      req.params.id,
      req.query.date as string | undefined,
    );
    res.json({ success: true, data });
  }),
);

// POST /zones — create zone
router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate(CreateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: zone });
  }),
);

// PATCH /zones/:id — update zone
router.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  validate(UpdateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.update(req.params.id, req.body);
    res.json({ success: true, data: zone });
  }),
);

export default router;
