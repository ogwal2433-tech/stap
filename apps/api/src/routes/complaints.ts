/**
 * @openapi
 * tags:
 *   - name: Complaints
 *     description: Complaint management — submit, assign, resolve, dashboard
 *
 * /api/v1/complaints:
 *   get:
 *     tags: [Complaints]
 *     summary: List complaints (paginated, filterable)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *     responses:
 *       200:
 *         description: Paginated complaint list
 *   post:
 *     tags: [Complaints]
 *     summary: Submit a new complaint (CLIENT or internal user)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, severity, description]
 *             properties:
 *               category: { type: string, enum: [GUARD_CONDUCT, SERVICE_DELIVERY, BILLING, SAFETY, OTHER] }
 *               severity: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               description: { type: string, minLength: 20 }
 *               siteId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Complaint submitted
 *
 * /api/v1/complaints/{id}/assign:
 *   patch:
 *     tags: [Complaints]
 *     summary: Assign complaint to a staff member
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Complaint assigned, status → IN_PROGRESS
 *
 * /api/v1/complaints/{id}/resolve:
 *   patch:
 *     tags: [Complaints]
 *     summary: Resolve a complaint
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolution]
 *             properties:
 *               resolution: { type: string }
 *     responses:
 *       200:
 *         description: Complaint resolved, client notified
 */
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
