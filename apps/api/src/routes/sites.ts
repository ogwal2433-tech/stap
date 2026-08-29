import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { asyncHandler } from '../utils/asyncHandler';
import { siteService } from '../services/siteService';
import { PERMISSIONS } from '../constants/permissions';

/**
 * Sites, reachable without the clients module.
 *
 * The same records were only available under /clients/sites, whose guard is a
 * role list built for client management. A Trainer deploying a firearm needs to
 * name the site it goes to and nothing else about the client — the 403 they hit
 * was that mismatch, not a decision that they may not see sites.
 *
 * Gated on sites.view, so who reaches it is a grant an administrator can change
 * rather than a role list compiled in here. The routes under /clients stay for
 * the client pages, which show sites in the context of the client that owns them.
 */
const router = Router();

router.use(authenticate);
router.use(requirePermission(PERMISSIONS.SITES_VIEW));

/** Every site, for the pickers — roster, deployment sheet, gun deployment. */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await siteService.listAll(
      req.query as { page?: number; limit?: number; search?: string; clientId?: string; unzoned?: string },
    );
    res.json({ success: true, ...result });
  }),
);

/**
 * Declared before /:id, or "shift" is captured as an id and the lookup 404s on
 * a site that exists.
 */
router.get(
  '/:siteId/shift',
  asyncHandler(async (req: Request, res: Response) => {
    const shift = await siteService.getShift(req.params.siteId);
    res.json({ success: true, data: shift });
  }),
);

router.get(
  '/:siteId',
  asyncHandler(async (req: Request, res: Response) => {
    const site = await siteService.getById(req.params.siteId);
    res.json({ success: true, data: site });
  }),
);

export default router;
