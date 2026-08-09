import { Router, type IRouter } from 'express';
import { dashboardService } from '../services/dashboardService';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';

const router: IRouter = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/dashboard/stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Role-scoped dashboard figures for the signed-in user
 *     description: >
 *       Returns { role, stats, feeds }. The keys inside stats and feeds differ
 *       per role — each account only receives the figures it can act on, so a
 *       Field Supervisor gets no revenue and a Client gets no internal HR data.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Dashboard data }
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const data = await dashboardService.getStats(
      req.user!.userId,
      req.user!.role,
      req.user!.clientId ?? null,
    );
    res.json({ success: true, data });
  }),
);

export { router as dashboardRouter };
