/**
 * @openapi
 * tags:
 *   - name: Guns
 *     description: >
 *       Firearm registry and chain of custody — register a gun into the
 *       armoury, deploy it to a site, withdraw it back, or transfer it between
 *       sites. Every movement is recorded in one ledger.
 *
 * /api/v1/guns:
 *   get:
 *     tags: [Guns]
 *     summary: List guns, filterable by status, site and type
 *     responses:
 *       200: { description: Guns }
 *   post:
 *     tags: [Guns]
 *     summary: Register a new gun into the armoury
 *     responses:
 *       201: { description: Gun registered }
 *       409: { description: Serial number already registered }
 *
 * /api/v1/guns/inventory:
 *   get:
 *     tags: [Guns]
 *     summary: Gun counts, serial numbers and bullet totals by location
 *     responses:
 *       200: { description: Inventory rows }
 *
 * /api/v1/guns/deploy:
 *   post:
 *     tags: [Guns]
 *     summary: Send a gun from the armoury to a site
 *     responses:
 *       201: { description: Movement recorded }
 *
 * /api/v1/guns/withdraw:
 *   post:
 *     tags: [Guns]
 *     summary: Return a gun from a site to the armoury
 *     responses:
 *       201: { description: Movement recorded }
 *
 * /api/v1/guns/transfer:
 *   post:
 *     tags: [Guns]
 *     summary: Move a gun straight from one site to another
 *     responses:
 *       201: { description: Movement recorded }
 */
import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { gunService } from '../services/gunService';
import {
  ROLES,
  RegisterGunSchema,
  RegisterGunBatchSchema,
  AdjustBulletsSchema,
  UpdateGunSchema,
  DeployGunSchema,
  WithdrawGunSchema,
  TransferGunSchema,
} from '@security360/shared';

const router: IRouter = Router();
router.use(authenticate);

/** Who may see the armoury. Operations needs visibility of what is on its sites. */
const GUN_VIEW_ROLES = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR,
] as const;

/** Who may move a gun. The Trainer issues firearms; Operations does not. */
const GUN_WRITE_ROLES = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.TRAINER,
] as const;

// ── Reads ─────────────────────────────────────────────────────────────────────

router.get(
  '/inventory',
  requireRole(...GUN_VIEW_ROLES),
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await gunService.getInventory();
    res.json({ success: true, data });
  }),
);

router.get(
  '/movements',
  requireRole(...GUN_VIEW_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.listMovements({
      gunId:        req.query.gunId as string | undefined,
      movementType: req.query.movementType as string | undefined,
      limit:        req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  '/',
  requireRole(...GUN_VIEW_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.listGuns({
      status:  req.query.status  as string | undefined,
      siteId:  req.query.siteId  as string | undefined,
      gunType: req.query.gunType as string | undefined,
      client:  req.query.client  as string | undefined,
    });
    res.json({ success: true, data });
  }),
);

// ── Movements ─────────────────────────────────────────────────────────────────
// Declared before /:id so the literal paths are not swallowed by the param route.

router.post(
  '/deploy',
  requireRole(...GUN_WRITE_ROLES),
  validate(DeployGunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.deployGun(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/withdraw',
  requireRole(...GUN_WRITE_ROLES),
  validate(WithdrawGunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.withdrawGun(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/transfer',
  requireRole(...GUN_WRITE_ROLES),
  validate(TransferGunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.transferGun(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/batch',
  requirePermission(PERMISSIONS.GUNS_REGISTER),
  validate(RegisterGunBatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.registerGunBatch(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.GUNS_REGISTER),
  validate(RegisterGunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.registerGun(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// PATCH /guns/:id — edit registration details
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.GUNS_REGISTER),
  validate(UpdateGunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.updateGun(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// DELETE /guns/:id — removes it, or retires it when it has a movement history
// POST /guns/:id/adjust-bullets - manual bullet correction (spend, find, top-up)
router.post(
  '/:id/adjust-bullets',
  requireRole(...GUN_WRITE_ROLES),
  validate(AdjustBulletsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.adjustBullets(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: data });
  }),
);

// GET /guns/reconcile - balance check: counters vs live guns, ledger heads vs
// cached balances. Read-only by design; reports drift for a human to fix.
router.get(
  '/reconcile',
  requireRole(...GUN_VIEW_ROLES),
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await gunService.reconcile();
    res.json({ success: true, data: data });
  }),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.GUNS_REGISTER),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.deleteGun(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.get(
  '/:id',
  requireRole(...GUN_VIEW_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await gunService.getGun(req.params.id);
    res.json({ success: true, data });
  }),
);

export { router as gunsRouter };
