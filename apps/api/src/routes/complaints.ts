import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { complaintService } from '../services/complaintService';
import {
  ROLES,
  INTERNAL_ROLES,
  COMPLAINT_ASSIGN_ROLES,
  CreateComplaintSchema,
  AssignComplaintSchema,
  UpdateComplaintStatusSchema,
  CreateOutboundComplaintSchema,
  COMPLAINT_DIRECTIONS,
} from '@stap/shared';
import { z } from 'zod';

const router = Router();

/** Who may send a formal notice to a client on STAP's behalf. */
const NOTICE_SEND_ROLES = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.CONTROL_ROOM,
] as const;

const COMPLAINT_VIEW_ROLES = INTERNAL_ROLES.filter(
  (r) => r !== ROLES.GUARD && r !== ROLES.CLIENT,
);
const COMPLAINT_SUBMIT_ROLES = INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD);
// Control Room owns complaint intake and routing; the others retain oversight.

const ListQuery = z.object({
  status:   z.string().optional(),
  clientId: z.string().optional(),
  category: z.string().optional(),
  /** Omit or pass ALL for both directions. */
  direction: z.enum([...COMPLAINT_DIRECTIONS, 'ALL']).optional(),
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
  requireRole(...COMPLAINT_ASSIGN_ROLES),
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

// POST /complaints/outbound — STAP sends a formal notice to a client.
// Declared before /:id so "outbound" is never read as an id.
router.post(
  '/outbound',
  requireRole(...NOTICE_SEND_ROLES),
  validate(CreateOutboundComplaintSchema),
  asyncHandler(async (req, res) => {
    const data = await complaintService.createOutbound(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

// PATCH /complaints/:id/resolve-notice — staff closes an outbound notice.
router.patch(
  '/:id/resolve-notice',
  requireRole(...NOTICE_SEND_ROLES),
  asyncHandler(async (req, res) => {
    const data = await complaintService.resolveOutbound(req.params.id, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// GET /complaints/:id  — must come after /dashboard
router.get(
  '/:id',
  requireRole(...COMPLAINT_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const data = await complaintService.getById(req.params.id);
    res.json({ success: true, data });
  }),
);

// PATCH /complaints/:id/assign
router.patch(
  '/:id/assign',
  requireRole(...COMPLAINT_ASSIGN_ROLES),
  validate(AssignComplaintSchema),
  asyncHandler(async (req, res) => {
    const data = await complaintService.assignComplaint(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// PATCH /complaints/:id/status
// No role restriction — service layer enforces "must be assigned person or HR"
router.patch(
  '/:id/status',
  requireRole(...COMPLAINT_VIEW_ROLES),
  validate(UpdateComplaintStatusSchema),
  asyncHandler(async (req, res) => {
    const data = await complaintService.updateStatus(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as complaintsRouter };
