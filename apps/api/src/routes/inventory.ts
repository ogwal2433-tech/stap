/**
 * @openapi
 * tags:
 *   - name: Inventory
 *     description: Inventory catalogue, issue/return tracking, stock adjustments
 *
 * /api/v1/inventory/items:
 *   get:
 *     tags: [Inventory]
 *     summary: List inventory items (paginated, filterable)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: itemType
 *         schema: { type: string, enum: [UNIFORM, EQUIPMENT, STATIONERY, OTHER] }
 *       - in: query
 *         name: isLowStock
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated inventory items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *   post:
 *     tags: [Inventory]
 *     summary: Create a new inventory item (DIRECTOR only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemName, itemType, unitCost]
 *             properties:
 *               itemName: { type: string }
 *               itemType: { type: string, enum: [UNIFORM, EQUIPMENT, STATIONERY, OTHER] }
 *               unitCost: { type: integer }
 *               stockQuantity: { type: integer, default: 0 }
 *               reorderThreshold: { type: integer, default: 5 }
 *     responses:
 *       201:
 *         description: Item created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         $ref: '#/components/schemas/Error400'
 *
 * /api/v1/inventory/items/issue:
 *   post:
 *     tags: [Inventory]
 *     summary: Issue an item to a guard
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, guardId, quantity]
 *             properties:
 *               itemId: { type: string, format: uuid }
 *               guardId: { type: string, format: uuid }
 *               quantity: { type: integer, minimum: 1 }
 *               conditionNote: { type: string }
 *     responses:
 *       200:
 *         description: Item issued, stock decremented
 *       400:
 *         description: Insufficient stock
 *
 * /api/v1/inventory/items/return:
 *   post:
 *     tags: [Inventory]
 *     summary: Record item return — RETURNED restores stock; LOST/DAMAGED creates deduction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, guardId, quantity, action]
 *             properties:
 *               itemId: { type: string, format: uuid }
 *               guardId: { type: string, format: uuid }
 *               quantity: { type: integer, minimum: 1 }
 *               action: { type: string, enum: [RETURNED, LOST, DAMAGED] }
 *     responses:
 *       200:
 *         description: Return recorded
 *
 * /api/v1/inventory/items/adjust-stock:
 *   post:
 *     tags: [Inventory]
 *     summary: Manual stock adjustment (positive = stock-in, negative = write-off)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, quantity]
 *             properties:
 *               itemId: { type: string, format: uuid }
 *               quantity: { type: integer }
 *               reference: { type: string }
 *     responses:
 *       200:
 *         description: Stock adjusted
 *
 * /api/v1/inventory/items/low-stock:
 *   get:
 *     tags: [Inventory]
 *     summary: List items at or below reorder threshold
 *     responses:
 *       200:
 *         description: Low stock items
 *
 * /api/v1/inventory/transactions:
 *   get:
 *     tags: [Inventory]
 *     summary: List all inventory transactions (paginated)
 *     responses:
 *       200:
 *         description: Paginated transaction ledger
 *
 * /api/v1/inventory/guard/{guardId}:
 *   get:
 *     tags: [Inventory]
 *     summary: Outstanding items held by a specific guard
 *     parameters:
 *       - in: path
 *         name: guardId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of outstanding items
 */
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
