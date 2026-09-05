/**
 * @openapi
 * tags:
 *   - name: Contracts
 *     description: Service contracts linking clients to deployed guards and billing rates
 *
 * /api/v1/contracts:
 *   get:
 *     tags: [Contracts]
 *     summary: List all contracts (paginated)
 *     responses:
 *       200:
 *         description: Paginated contracts
 *   post:
 *     tags: [Contracts]
 *     summary: Create a new contract
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, contractStart, contractEnd, guardRates]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               contractStart: { type: string, format: date-time }
 *               contractEnd: { type: string, format: date-time }
 *               guardRates:
 *                 type: array
 *                 description: The only billing mechanism — at least one line required
 *                 items:
 *                   type: object
 *                   required: [guardType, guardsCount, ratePerGuard]
 *                   properties:
 *                     guardType: { type: string }
 *                     guardsCount: { type: integer }
 *                     ratePerGuard: { type: integer, description: Monthly rate per guard in UGX }
 *     responses:
 *       201:
 *         description: Contract created
 *
 * /api/v1/contracts/{id}:
 *   get:
 *     tags: [Contracts]
 *     summary: Get contract details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Contract detail
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *   patch:
 *     tags: [Contracts]
 *     summary: Update contract
 *     responses:
 *       200:
 *         description: Updated contract
 */
import { Router, type IRouter } from 'express';
import { contractService } from '../services/contractService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../errors/AppError';
import {
  ROLES,
  CreateContractSchema,
  UpdateContractSchema,
} from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// ── GET / — list contracts ─────────────────────────────────────────────────────
router.get(
  '/',
  requirePermission(PERMISSIONS.CONTRACTS_VIEW),
  asyncHandler(async (req, res) => {
    const { clientId, status, page, limit } = req.query as Record<string, string | undefined>;
    const result = await contractService.listAll({
      clientId,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /expiring — expiring contracts ────────────────────────────────────────
// Must be before /:id to avoid route collision
router.get(
  '/expiring',
  requirePermission(PERMISSIONS.CONTRACTS_VIEW),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 30;
    const contracts = await contractService.getExpiringContracts(days);
    res.status(200).json({ success: true, data: contracts });
  }),
);

// ── POST / — create contract ───────────────────────────────────────────────────
router.post(
  '/',
  requirePermission(PERMISSIONS.CONTRACTS_CREATE),
  validate(CreateContractSchema),
  asyncHandler(async (req, res) => {
    const contract = await contractService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: contract });
  }),
);

// ── GET /:id — get contract by ID ─────────────────────────────────────────────
router.get(
  '/:id',
  requirePermission(PERMISSIONS.CONTRACTS_VIEW),
  asyncHandler(async (req, res) => {
    const contract = await contractService.getById(req.params.id);
    res.status(200).json({ success: true, data: contract });
  }),
);

// ── PATCH /:id — update contract ──────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CONTRACTS_EDIT),
  validate(UpdateContractSchema),
  asyncHandler(async (req, res) => {
    const contract = await contractService.update(req.params.id, req.body, req.user!.userId);
    res.status(200).json({ success: true, data: contract });
  }),
);

// ── DELETE /:id — delete contract ─────────────────────────────────────────────
router.delete(
  '/:id',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    // Check no invoices linked (Sprint 3 Finance will add invoice model)
    // For now, just proceed with deletion
    await contractService.delete(req.params.id);
    res.status(200).json({ success: true });
  }),
);

export { router as contractsRouter };
