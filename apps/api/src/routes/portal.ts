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
import { AppError } from '../errors/AppError';
import { ROLES, CreateComplaintSchema } from '@stap/shared';
import prisma from '../db/prisma';

const router = Router();

// ── clientPortalGuard middleware ───────────────────────────────────────────────

async function clientPortalGuard(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== ROLES.CLIENT) {
    return res.status(403).json({ success: false, message: 'Client access only' });
  }
  const client = await prisma.client.findFirst({ where: { clientUserId: req.user.userId } });
  if (!client) {
    return res.status(403).json({ success: false, message: 'No client account linked to this user. Contact administrator.' });
  }
  (req as any).clientId = client.id;
  next();
}

router.use(authenticate, asyncHandler(clientPortalGuard));

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

// GET /portal/complaints
router.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).clientId as string;
    const result   = await complaintService.list({ clientId, page: 1, limit: 50 });
    res.json({ success: true, ...result });
  }),
);

export { router as portalRouter };
