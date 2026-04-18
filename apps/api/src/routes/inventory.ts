import { Router, type IRouter } from 'express';
import { inventoryService } from '../services/inventoryService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError } from '../errors/AppError';
import {
  ROLES,
  INTERNAL_ROLES,
  CreateInventoryItemSchema,
  UpdateInventoryItemSchema,
  IssueItemSchema,
  ReturnItemSchema,
  StockAdjustmentSchema,
} from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

const MGMT_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR] as const;
const VIEW_ROLES = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD && r !== ROLES.CLIENT);

// ── Item CRUD ──────────────────────────────────────────────────────────────────

router.get(
  '/items',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const page       = Number(req.query.page)  || 1;
    const limit      = Number(req.query.limit) || 20;
    const itemType   = req.query.itemType  as string | undefined;
    const isLowStock = req.query.isLowStock === 'true';
    const isActive   = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const search     = req.query.search as string | undefined;
    const result = await inventoryService.list({ itemType, isLowStock, isActive, search, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/items',
  requireRole(...MGMT_ROLES),
  validate(CreateInventoryItemSchema),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.createItem(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/items/low-stock',
  requireRole(...MGMT_ROLES),
  asyncHandler(async (_req, res) => {
    const data = await inventoryService.checkLowStock();
    res.json({ success: true, data });
  }),
);

// NOTE: /items/issue, /items/return, /items/adjust-stock must be before /:id
router.post(
  '/items/issue',
  requireRole(...MGMT_ROLES),
  validate(IssueItemSchema),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.issueItem(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/items/return',
  requireRole(...MGMT_ROLES),
  validate(ReturnItemSchema),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.returnItem(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/items/adjust-stock',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(StockAdjustmentSchema),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.adjustStock(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/items/:id',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.getById(req.params.id);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/items/:id',
  requireRole(...MGMT_ROLES),
  validate(UpdateInventoryItemSchema),
  asyncHandler(async (req, res) => {
    const data = await inventoryService.updateItem(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Transactions ───────────────────────────────────────────────────────────────

router.get(
  '/transactions',
  requireRole(...VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const page    = Number(req.query.page)  || 1;
    const limit   = Number(req.query.limit) || 20;
    const itemId  = req.query.itemId  as string | undefined;
    const guardId = req.query.guardId as string | undefined;
    const action  = req.query.action  as string | undefined;
    const result = await inventoryService.getTransactions({ itemId, guardId, action, page, limit });
    res.json({ success: true, ...result });
  }),
);

// ── Guard inventory ────────────────────────────────────────────────────────────

router.get(
  '/guards/:guardId/items',
  requireRole(...MGMT_ROLES, ROLES.GUARD),
  asyncHandler(async (req, res) => {
    if (req.user!.role === ROLES.GUARD) {
      const guard = await import('../db/prisma').then((m) =>
        m.default.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } }),
      );
      if (guard?.id !== req.params.guardId) {
        throw new ForbiddenError('Guards can only view their own issued items');
      }
    }
    const data = await inventoryService.getGuardInventory(req.params.guardId);
    res.json({ success: true, data });
  }),
);

export { router as inventoryRouter };
