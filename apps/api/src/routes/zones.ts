import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { CreateZoneSchema, UpdateZoneSchema } from '@stap/shared';
import { zoneService } from '../services/zoneService';

const router: IRouter = Router();

router.use(authenticate);

/**
 * Reading follows roster.view — the same grant the sidebar uses to offer the
 * Zones page, so the nav and the API can no longer disagree. This used to be a
 * role list that left Control Room looking at an empty page.
 *
 * Writing follows sites.edit: a zone is a grouping of sites, and assigning one
 * is already carried out as a site update. It is held by exactly the roles that
 * could write zones before, so this takes nothing away from anyone.
 */

// GET /zones — list all zones (admin sees all, supervisors use /my-zones)
router.get(
  '/',
  requirePermission(PERMISSIONS.ROSTER_VIEW),
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
  requirePermission(PERMISSIONS.ROSTER_VIEW),
  asyncHandler(async (req, res) => {
    const zones = await zoneService.listForSupervisor(req.user!.userId);
    res.json({ success: true, data: zones });
  }),
);

// GET /zones/my-zone — the one zone the caller supervises, for the deployment sheet
router.get(
  '/my-zone',
  requirePermission(PERMISSIONS.ROSTER_VIEW),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.getMyZone(req.user!.userId);
    res.json({ success: true, data: zone });
  }),
);

// GET /zones/:id/sites — sites in a zone, with the shift each deploys on
router.get(
  '/:id/sites',
  requirePermission(PERMISSIONS.ROSTER_VIEW),
  asyncHandler(async (req, res) => {
    const sites = await zoneService.listSites(req.params.id);
    res.json({ success: true, data: sites });
  }),
);

// GET /zones/:id — single zone detail
router.get(
  '/:id',
  requirePermission(PERMISSIONS.ROSTER_VIEW),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.getById(req.params.id);
    res.json({ success: true, data: zone });
  }),
);

// GET /zones/:id/roster-data — zone + sites + available guards for a given date
router.get(
  '/:id/roster-data',
  requirePermission(PERMISSIONS.ROSTER_VIEW),
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
  requirePermission(PERMISSIONS.SITES_EDIT),
  validate(CreateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: zone });
  }),
);

// PATCH /zones/:id — update zone
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SITES_EDIT),
  validate(UpdateZoneSchema),
  asyncHandler(async (req, res) => {
    const zone = await zoneService.update(req.params.id, req.body);
    res.json({ success: true, data: zone });
  }),
);

export default router;
