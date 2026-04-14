import { Router, type IRouter } from 'express';
import { contractService } from '../services/contractService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
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
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.ADMINISTRATOR,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.TRAINER,
    ROLES.ACCOUNTS_OFFICER,
    ROLES.MARKETING,
  ),
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
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 30;
    const contracts = await contractService.getExpiringContracts(days);
    res.status(200).json({ success: true, data: contracts });
  }),
);

// ── POST / — create contract ───────────────────────────────────────────────────
router.post(
  '/',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(CreateContractSchema),
  asyncHandler(async (req, res) => {
    const contract = await contractService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: contract });
  }),
);

// ── GET /:id — get contract by ID ─────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(
    ROLES.DIRECTOR,
    ROLES.ASSISTANT_MANAGER,
    ROLES.ADMINISTRATOR,
    ROLES.OPERATIONS_SUPERVISOR,
    ROLES.FIELD_SUPERVISOR,
    ROLES.TRAINER,
    ROLES.ACCOUNTS_OFFICER,
    ROLES.MARKETING,
  ),
  asyncHandler(async (req, res) => {
    const contract = await contractService.getById(req.params.id);
    res.status(200).json({ success: true, data: contract });
  }),
);

// ── PATCH /:id — update contract ──────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
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
