import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { complaintService } from '../services/complaintService';
import {
  ROLES,
  INTERNAL_ROLES,
  CreateComplaintSchema,
  UpdateComplaintSchema,
} from '@stap/shared';
import { z } from 'zod';

const router = Router();

const COMPLAINT_VIEW_ROLES = INTERNAL_ROLES.filter(
  r => r !== ROLES.GUARD && r !== ROLES.CLIENT,
);
const COMPLAINT_SUBMIT_ROLES = INTERNAL_ROLES.filter(r => r !== ROLES.GUARD);
const COMPLAINT_MANAGE_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR] as const;

const ListQuery = z.object({
  status:   z.string().optional(),
  clientId: z.string().optional(),
  category: z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticate);

// GET /complaints
router.get(
  '/',
  requireRole(...COMPLAINT_VIEW_ROLES),
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    const result = await complaintService.list(req.query as any);
    res.json({ success: true, ...result });
  }),
);

// GET /complaints/dashboard
router.get(
  '/dashboard',
  requireRole(...COMPLAINT_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const data = await complaintService.getDashboard();
    res.json({ success: true, data });
  }),
);

// POST /complaints
router.post(
  '/',
  requireRole(...COMPLAINT_SUBMIT_ROLES),
  validate(CreateComplaintSchema),
  asyncHandler(async (req, res) => {
    const data = await complaintService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// GET /complaints/:id
router.get(
  '/:id',
  requireRole(...COMPLAINT_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const data = await complaintService.getById(req.params.id);
    res.json({ success: true, data });
  }),
);

// PATCH /complaints/:id
router.patch(
  '/:id',
  requireRole(...COMPLAINT_MANAGE_ROLES),
  validate(UpdateComplaintSchema),
  asyncHandler(async (req, res) => {
    const data = await complaintService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as complaintsRouter };
