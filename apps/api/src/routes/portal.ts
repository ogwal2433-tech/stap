/**
 * @openapi
 * tags:
 *   - name: Portal
 *     description: Client self-service portal — overview, invoices, complaints, incidents (CLIENT role only)
 *
 * /api/v1/portal/overview:
 *   get:
 *     tags: [Portal]
 *     summary: Client portal overview — guards deployed, outstanding invoices, open complaints
 *     responses:
 *       200:
 *         description: Portal overview data
 *       403:
 *         description: Non-CLIENT roles cannot access the portal
 *
 * /api/v1/portal/invoices:
 *   get:
 *     tags: [Portal]
 *     summary: List invoices belonging to the authenticated client
 *     responses:
 *       200:
 *         description: Client invoices
 *
 * /api/v1/portal/complaints:
 *   get:
 *     tags: [Portal]
 *     summary: List complaints submitted by this client
 *   post:
 *     tags: [Portal]
 *     summary: Submit a new complaint via the portal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, severity, description]
 *             properties:
 *               category: { type: string }
 *               severity: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Complaint submitted
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { invoiceService } from '../services/invoiceService';
import { complaintService } from '../services/complaintService';
import { serviceRequestService } from '../services/serviceRequestService';
import { notificationService } from '../services/notificationService';
import { AppError } from '../errors/AppError';
import { ROLES, CreateComplaintSchema, CreateServiceRequestSchema, AcknowledgeNoticeSchema } from '@stap/shared';
import prisma from '../db/prisma';

const router = Router();

// ── clientPortalGuard middleware ───────────────────────────────────────────────
// clientId comes straight from the JWT (set at login from User.clientId) — no
// per-request DB lookup needed, and it can never be a different company's ID
// since it isn't accepted from anywhere in the request itself.

function clientPortalGuard(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== ROLES.CLIENT) {
    return res.status(403).json({ success: false, message: 'Client access only' });
  }
  if (!req.user.clientId) {
    return res.status(403).json({ success: false, message: 'No client account linked to this user. Contact administrator.' });
  }
  (req as any).clientId = req.user.clientId;
  next();
}

router.use(authenticate, clientPortalGuard);

// GET /portal/overview
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const [client, outstandingInvoices, openComplaints, deployedToday] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId }, select: { id: true, clientName: true, email: true, contactPhone: true } }),
      prisma.invoice.count({ where: { clientId, status: { in: ['PENDING', 'OVERDUE'] } } }),
      prisma.clientComplaint.count({ where: { clientId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.deployment.count({ where: { date: new Date(new Date().setHours(0, 0, 0, 0)), site: { clientId } } }),
    ]);
    res.json({ success: true, data: { client, outstandingInvoices, openComplaints, deployedToday } });
  }),
);

// GET /portal/invoices
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const result   = await invoiceService.list({ clientId, page: 1, limit: 50 });
    res.json({ success: true, ...result });
  }),
);

// GET /portal/invoices/:id
router.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const invoice  = await prisma.invoice.findUnique({
      where:   { id: req.params.id },
      include: { client: true, payments: true },
    });
    if (!invoice || invoice.clientId !== clientId) {
      throw new AppError('Invoice not found', 404);
    }
    res.json({ success: true, data: invoice });
  }),
);

// GET /portal/invoices/:id/pay
router.get(
  '/invoices/:id/pay',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const invoice  = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice || invoice.clientId !== clientId) {
      throw new AppError('Invoice not found', 404);
    }
    const data = await invoiceService.initiateYoPayment(req.params.id);
    res.json({ success: true, data });
  }),
);

// GET /portal/guards
router.get(
  '/guards',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const today    = new Date(new Date().setHours(0, 0, 0, 0));
    const deploys  = await prisma.deployment.findMany({
      where: { date: today, site: { clientId } },
      include: {
        guard:      { select: { id: true, firstName: true, lastName: true } },
        site:       { select: { id: true, siteName: true } },
        supervisor: { select: { id: true, name: true } },
      },
    });
    const data = deploys.map(d => ({
      guardName:  `${d.guard.firstName} ${d.guard.lastName}`,
      site:       d.site.siteName,
      shiftType:  d.shiftType,
      supervisor: d.supervisor.name,
      date:       d.date,
    }));
    res.json({ success: true, data });
  }),
);

// GET /portal/sites
router.get(
  '/sites',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const sites = await prisma.site.findMany({
      where:   { clientId },
      select:  { id: true, siteName: true },
      orderBy: { siteName: 'asc' },
    });
    res.json({ success: true, data: sites });
  }),
);

// POST /portal/complaints
router.post(
  '/complaints',
  validate(CreateComplaintSchema.omit({ clientId: true })),
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const data = await complaintService.create(
      { ...req.body, clientId },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data });
  }),
);

// GET /portal/complaints — what this client raised with STAP.
// Scoped to INBOUND so notices STAP sent them stay under /portal/notices and
// do not appear in the client's own "My Complaints" list.
router.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const result   = await complaintService.list({ clientId, direction: 'INBOUND', page: 1, limit: 50 });
    res.json({ success: true, ...result });
  }),
);

// ── Notices from STAP (outbound complaints) ───────────────────────────────────
// clientPortalGuard has already pinned clientId to the JWT, so a client can only
// ever read or acknowledge their own company's notices.

// GET /portal/notices
router.get(
  '/notices',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const result   = await complaintService.list({ clientId, direction: 'OUTBOUND', page: 1, limit: 50 });
    res.json({ success: true, ...result });
  }),
);

// GET /portal/notices/unread-count — drives the badge on the portal tab
router.get(
  '/notices/unread-count',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const count    = await complaintService.countUnreadNotices(clientId);
    res.json({ success: true, data: { count } });
  }),
);

// PATCH /portal/notices/:id/acknowledge
router.patch(
  '/notices/:id/acknowledge',
  validate(AcknowledgeNoticeSchema),
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;

    // Confirm the notice is this client's before the service touches it —
    // otherwise the id alone would be enough to acknowledge another company's.
    const notice = await prisma.clientComplaint.findUnique({
      where:  { id: req.params.id },
      select: { id: true, clientId: true },
    });
    if (!notice || notice.clientId !== clientId) {
      // Same response either way: existence of another company's notice is not
      // something this client should be able to probe for.
      return res.status(404).json({ success: false, error: 'Notice not found' });
    }

    const data = await complaintService.acknowledgeNotice(
      req.params.id,
      req.body.clientResponse ?? undefined,
      req.user!.userId,
    );
    res.json({ success: true, data });
  }),
);

// ── Service requests — the client's half of the channel.
//
// These two routes are scoped to the caller's own company by clientPortalGuard.
// Staff read and answer the same requests through /service-requests, which is
// closed to the CLIENT role. Requests are addressed to STAP by the client, so
// staff seeing them is the point; what staff must not expose back is
// `staffNotes`, and the portal's formatter omits it.

// GET /portal/service-requests
router.get(
  '/service-requests',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const result   = await serviceRequestService.listByClient(clientId);
    res.json({ success: true, ...result });
  }),
);

// POST /portal/service-requests
router.post(
  '/service-requests',
  validate(CreateServiceRequestSchema.omit({ clientId: true })),
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const data = await serviceRequestService.create(
      { ...req.body, clientId },
      req.user!.userId,
    );

    // Name the client and the request, otherwise staff get an alert they cannot
    // act on and have to go hunting for what it refers to.
    await notificationService.sendToRoles(
      ['DIRECTOR', 'ASSISTANT_MANAGER', 'OPERATIONS_SUPERVISOR', 'CONTROL_ROOM'],
      {
        type:       'SYSTEM',
        title:      'New Client Service Request',
        message:
          `${data.clientName} raised a ${data.type.replace(/_/g, ' ').toLowerCase()} request: ` +
          `"${data.subject}"${data.priority === 'URGENT' ? ' — marked URGENT' : ''}.`,
        entityType: 'serviceRequest',
        entityId:   data.id,
      },
    );

    res.status(201).json({ success: true, data });
  }),
);

export { router as portalRouter };
