import { Router, type IRouter } from 'express';
import { zoneService } from '../services/zoneService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  CreateZoneSchema,
  UpdateZoneSchema,
  AssignSitesToZoneSchema,
  RemoveSitesFromZoneSchema,
} from '@stap/shared';

const router: IRouter = Router();
router.use(authenticate);

// GET /zones — list all zones (summary)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === 'true';
    const zones = await zoneService.list(activeOnly);
    res.json({ success: true, data: zones });
  }),
);

// GET /zones/:id — get zone detail
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const zone = await zoneService.getById(req.params.id);
    res.json({ success: true, data: zone });
  }),
);

// POST /zones — create zone
router.post(
  '/',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  validate(CreateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: zone });
  }),
);

// PATCH /zones/:id — update zone
router.patch(
  '/:id',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  validate(UpdateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// POST /zones/:id/sites — assign sites to zone
router.post(
  '/:id/sites',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  validate(AssignSitesToZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.assignSites(req.params.id, req.body.siteIds, req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// DELETE /zones/:id/sites — remove sites from zone
router.delete(
  '/:id/sites',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  validate(RemoveSitesFromZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.removeSites(req.params.id, req.body.siteIds, req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// PATCH /zones/:id/deactivate
router.patch(
  '/:id/deactivate',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.deactivate(req.params.id, req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// PATCH /zones/:id/activate
router.patch(
  '/:id/activate',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.activate(req.params.id, req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// DELETE /zones/:id
router.delete(
  '/:id',
  requireRole('DIRECTOR', 'ASSISTANT_MANAGER', 'ADMINISTRATOR'),
  asyncHandler(async (req, res) => {
    await zoneService.delete(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Zone deleted.' });
  }),
);

export { router as zonesRouter };
