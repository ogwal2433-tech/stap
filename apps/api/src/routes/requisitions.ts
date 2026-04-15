import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { requisitionService } from '../services/requisitionService';
import { supplierService } from '../services/supplierService';
import {
  ROLES,
  INTERNAL_ROLES,
  CreateRequisitionSchema,
  ApproveRequisitionSchema,
  CreatePurchaseOrderSchema,
  CreateSupplierSchema,
} from '@stap/shared';

const router: IRouter = Router();
router.use(authenticate);

// Roles that may submit requisitions (INTERNAL minus CLIENT and GUARD)
const REQUISITION_SUBMITTER_ROLES = INTERNAL_ROLES.filter(
  (r) => r !== ROLES.CLIENT && r !== ROLES.GUARD,
);

// ── Requisitions ──────────────────────────────────────────────────────────────

router.get(
  '/dashboard',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await requisitionService.getDashboard();
    res.json({ success: true, data: stats });
  }),
);

router.get(
  '/',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await requisitionService.list(
      {
        status:   req.query.status   as string | undefined,
        category: req.query.category as string | undefined,
        raisedBy: req.query.raisedBy as string | undefined,
        page:     Number(req.query.page  ?? 1),
        limit:    Number(req.query.limit ?? 20),
      },
      req.user!.role,
      req.user!.userId,
    );
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  validate(CreateRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/approve',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(ApproveRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.approve(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

router.post(
  '/:id/purchase-order',
  requireRole(ROLES.ADMINISTRATOR, ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(CreatePurchaseOrderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const po = await requisitionService.createPurchaseOrder(
      { ...req.body, requisitionId: req.params.id },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: po });
  }),
);

// ── Suppliers ─────────────────────────────────────────────────────────────────

router.get(
  '/suppliers',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  asyncHandler(async (_req: Request, res: Response) => {
    const suppliers = await supplierService.list();
    res.json({ success: true, data: suppliers });
  }),
);

router.post(
  '/suppliers',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  validate(CreateSupplierSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.create(req.body);
    res.status(201).json({ success: true, data: supplier });
  }),
);

router.patch(
  '/suppliers/:id',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.update(req.params.id, req.body);
    res.json({ success: true, data: supplier });
  }),
);

export { router as requisitionsRouter };
