/**
 * @openapi
 * tags:
 *   - name: Requisitions
 *     description: Purchase requisitions workflow — submit, approve, create PO, manage suppliers
 *
 * /api/v1/requisitions:
 *   get:
 *     tags: [Requisitions]
 *     summary: List requisitions (paginated, filterable by status)
 *     responses:
 *       200:
 *         description: Paginated requisitions
 *   post:
 *     tags: [Requisitions]
 *     summary: Submit a new requisition
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemDescription, quantity, estimatedCost, reason]
 *             properties:
 *               itemDescription: { type: string }
 *               quantity: { type: integer }
 *               estimatedCost: { type: integer }
 *               reason: { type: string }
 *               supplierId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Requisition submitted
 *
 * /api/v1/requisitions/{id}/approve:
 *   post:
 *     tags: [Requisitions]
 *     summary: Approve a requisition (Director/Assistant Manager only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Requisition approved
 *
 * /api/v1/requisitions/{id}/purchase-order:
 *   post:
 *     tags: [Requisitions]
 *     summary: Generate purchase order for an approved requisition
 *     responses:
 *       201:
 *         description: PO created, PDF queued
 */
import { Router, type IRouter, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { requisitionService } from '../services/requisitionService';
import { requisitionExportService } from '../services/requisitionExportService';
import { supplierService } from '../services/supplierService';
import {
  ROLES,
  INTERNAL_ROLES,
  CreateRequisitionSchema,
  RequisitionListQuerySchema,
  RequisitionExportQuerySchema,
  type RequisitionListQuery,
  type RequisitionExportQuery,
  UpdateRequisitionSchema,
  ApproveRequisitionSchema,
  HRApproveRequisitionSchema,
  DirectorApproveRequisitionSchema,
  RevokeRequisitionApprovalSchema,
  AssignRequisitionSchema,
  UpdateProgressSchema,
  CreatePurchaseOrderSchema,
  CreateSupplierSchema,
  CreateAccountabilitySchema,
  ReviewAccountabilitySchema,
  CreateFundDispatchSchema,
} from '@security360/shared';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma';
import { accountabilityService } from '../services/accountabilityService';
import { fundDispatchService } from '../services/fundDispatchService';

const router: IRouter = Router();
// GET /requisitions/email-decision ? one-tap Approve / Reject from an email.
// Public: the signed token carries who may decide what, and expires in 7 days.
// Registered before any '/:id' route so 'email-decision' is never read as an id.
router.get(
  '/email-decision',
  asyncHandler(async (req: Request, res: Response) => {
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const page = (title: string, heading: string, body: string, color: string) => {
      res.status(200).type('html').send(
        `<!doctype html><html><body style="margin:0;background:#F2F4F7;font-family:Arial,sans-serif;">` +
        `<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;">` +
        `<div style="background:${color};color:#fff;padding:16px 24px;font-size:17px;font-weight:bold;">${esc(title)}</div>` +
        `<div style="padding:24px;"><h2 style="color:#1B3A6B;margin-top:0;">${esc(heading)}</h2>${body}` +
        `<p style="color:#6c757d;font-size:12px;">${esc(title)} ? Security360</p></div></div></body></html>`);
    };
    const fail = (heading: string, message: string) =>
      page('Security360', heading, `<p>${esc(message)}</p>`, '#343a40');

    const token    = String(req.query.token ?? '');
    const decision = String(req.query.decision ?? '');
    if (!token || (decision !== 'approve' && decision !== 'reject')) {
      fail('This link is not valid.', 'Open the Requisitions page in the portal to decide instead.');
      return;
    }
    let payload: any;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch {
      fail('This link has expired or is invalid.', 'Links work for 7 days. Open the Requisitions page in the portal to decide instead.');
      return;
    }
    if (payload?.purpose !== 'req-decision' || !payload?.sub || !payload?.req) {
      fail('This link is not valid.', 'Open the Requisitions page in the portal to decide instead.');
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) }, select: { id: true, name: true, role: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE' || (user.role !== 'MD' && user.role !== 'DIRECTOR')) {
      fail('You are not authorised to decide this.', 'Only the MD or a Director can approve or reject requisitions.');
      return;
    }
    const rq = await prisma.requisition.findUnique({
      where: { id: String(payload.req) },
      select: { id: true, particulars: true, amount: true, status: true, directorApprovedAt: true },
    });
    if (!rq) {
      fail('This requisition no longer exists.', 'It may have been withdrawn.');
      return;
    }
    if (rq.directorApprovedAt || rq.status === 'REJECTED') {
      const outcome = rq.status === 'REJECTED' ? 'rejected' : 'approved';
      page('Security360', `Already ${outcome}.`,
        `<p><strong>${esc(rq.particulars)}</strong> (UGX ${Number(rq.amount).toLocaleString()}) was already ${outcome} — no further action was taken.</p>`,
        rq.status === 'REJECTED' ? '#C0392B' : '#1E8449');
      return;
    }
    try {
      if (decision === 'approve') {
        await requisitionService.directorApprove(rq.id, user.id);
      } else {
        await requisitionService.approve(rq.id,
          { action: 'REJECT', rejectionReason: `Rejected via email link by ${user.name}` }, user.id);
      }
    } catch (err: any) {
      fail('Could not record your decision.', err?.message ?? 'The requisition may no longer await a decision.');
      return;
    }
    if (decision === 'approve') {
      page('Security360', 'Requisition approved.',
        `<p><strong>${esc(rq.particulars)}</strong> (UGX ${Number(rq.amount).toLocaleString()}) was approved by ${esc(user.name)} and moves to assignment.</p>`,
        '#1E8449');
    } else {
      page('Security360', 'Requisition rejected.',
        `<p><strong>${esc(rq.particulars)}</strong> (UGX ${Number(rq.amount).toLocaleString()}) was rejected by ${esc(user.name)}.</p>`,
        '#C0392B');
    }
  }),
);

router.use(authenticate);

// Roles that may submit requisitions (INTERNAL minus CLIENT and GUARD)
const REQUISITION_SUBMITTER_ROLES = [
  ...INTERNAL_ROLES.filter((r) => r !== ROLES.CLIENT && r !== ROLES.GUARD),
  ROLES.HR,
];

// ── Requisitions ──────────────────────────────────────────────────────────────

router.get(
  '/dashboard',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR, ROLES.MD),
  asyncHandler(async (req: Request, res: Response) => {
    // Optional raised-date window: the page's filter panel narrows the KPIs
    // to whatever period the approver is looking at.
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to   = typeof req.query.to   === 'string' && req.query.to   ? req.query.to   : undefined;
    const stats = await requisitionService.getDashboard(from, to);
    res.json({ success: true, data: stats });
  }),
);

router.get(
  '/',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  validateQuery(RequisitionListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as RequisitionListQuery;
    const result = await requisitionService.list(
      {
        status:        query.status,
        requestedById: query.requestedById,
        from:          query.from,
        to:            query.to,
        overdue:       query.overdue,
        page:          query.page,
        limit:         query.limit,
      },
      req.user!.role,
      req.user!.userId,
    );
    res.json({ success: true, ...result });
  }),
);

// ── GET /export/pdf — the filtered list, printed ──────────────────────────────
// Registered before /:id/pdf so the literal 'export' is never read as an id.
router.get(
  '/export/pdf',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  validateQuery(RequisitionExportQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as RequisitionExportQuery;
    const { pdf, filename } = await requisitionExportService.buildListPdf(query, {
      generatedBy: req.user!.name,
      viewerRole:  req.user!.role,
      viewerId:    req.user!.userId,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
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

// Amending a requisition before HR signs off. Open to every submitter role —
// the service decides whether this particular user may touch this record.
router.patch(
  '/:id',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  validate(UpdateRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.update(
      req.params.id, req.body, req.user!.userId, req.user!.role,
    );
    res.json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/approve',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.MD),
  validate(ApproveRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.approve(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/hr-approve',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  validate(HRApproveRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.hrApprove(req.params.id, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/director-approve',
  requireRole(ROLES.DIRECTOR, ROLES.MD),
  validate(DirectorApproveRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.directorApprove(req.params.id, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

// Undo the approval on a requisition that is APPROVED but has had nothing paid
// out. The service enforces that narrow window; the gate matches the roles that
// can grant the approval in the first place (see /:id/approve).
router.patch(
  '/:id/revoke-approval',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(RevokeRequisitionApprovalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.revokeApproval(
      req.params.id, req.body, req.user!.userId,
    );
    res.json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/assign',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  validate(AssignRequisitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.assign(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

router.patch(
  '/:id/progress',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  validate(UpdateProgressSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.updateProgress(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: requisition });
  }),
);

// Close out a finished requisition (ASSIGNED / IN_PROGRESS → COMPLETED).
// Same approver gate as /assign — the people who hand the funds out also
// record that the job is done.
router.patch(
  '/:id/complete',
  requireRole(ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR),
  asyncHandler(async (req: Request, res: Response) => {
    const requisition = await requisitionService.complete(req.params.id, req.user!.userId);
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

// ── GET /:id/pdf — one requisition, printed ───────────────────────────────────
// Inline disposition so it opens in a tab for previewing and printing. The
// service holds the same ownership rule as the list: an admin prints any one,
// everyone else only their own.
router.get(
  '/:id/pdf',
  requireRole(...REQUISITION_SUBMITTER_ROLES),
  asyncHandler(async (req: Request, res: Response) => {
    const { pdf, filename } = await requisitionExportService.buildDetailPdf(req.params.id, {
      generatedBy: req.user!.name,
      viewerRole:  req.user!.role,
      viewerId:    req.user!.userId,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
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

// ── Fund dispatch ─────────────────────────────────────────────────────────────
// How approved money actually left the business — E-Transact, cash, bank
// transfer, mobile money or cheque, one row per payment.

router.get(
  '/:id/dispatches',
  requireRole(
    ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER, ROLES.ADMINISTRATOR,
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const dispatches = await fundDispatchService.getDispatches(req.params.id);
    res.json({ success: true, data: dispatches });
  }),
);

router.post(
  '/:id/dispatch',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER),
  validate(CreateFundDispatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const dispatch = await fundDispatchService.recordDispatch(
      req.params.id, req.body, req.user!.userId,
    );
    res.status(201).json({ success: true, data: dispatch });
  }),
);

// ── Accountability ────────────────────────────────────────────────────────────
// What was actually spent against an approved requisition. Admin, HR and the
// Director each record their own figure per line; the Director's is final.

router.get(
  '/:id/accountability',
  requireRole(...INTERNAL_ROLES, ROLES.HR),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountabilityService.getByRequisition(req.params.id);
    res.json({ success: true, data });
  }),
);

// Submitted by whoever spent the money, so this is open to internal staff.
router.post(
  '/:id/accountability',
  requireRole(...INTERNAL_ROLES, ROLES.HR),
  validate(CreateAccountabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountabilityService.submit(req.params.id, req.body.items, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/:id/accountability/admin',
  requireRole(ROLES.ADMINISTRATOR, ROLES.ASSISTANT_MANAGER, ROLES.DIRECTOR),
  validate(ReviewAccountabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountabilityService.adminReview(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/:id/accountability/hr',
  requireRole(ROLES.ASSISTANT_MANAGER, ROLES.DIRECTOR),
  validate(ReviewAccountabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountabilityService.hrReview(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/:id/accountability/director',
  requireRole(ROLES.DIRECTOR),
  validate(ReviewAccountabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountabilityService.directorApprove(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

export { router as requisitionsRouter };
