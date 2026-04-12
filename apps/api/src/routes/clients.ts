import { Router, type IRouter } from 'express';
import { clientService } from '../services/clientService';
import { siteService } from '../services/siteService';
import { incidentService } from '../services/incidentService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  ROLES,
  INTERNAL_ROLES,
  DEPLOYMENT_ROLES,
  ClientListQuerySchema,
  CreateClientSchema,
  UpdateClientSchema,
  CreateSiteSchema,
  UpdateSiteSchema,
  CreateIncidentSchema,
} from '@stap/shared';
import type { UserRole } from '@stap/shared';

const router: IRouter = Router();

// All client routes require authentication
router.use(authenticate);

// Internal staff roles (excludes GUARD and CLIENT — already the case for INTERNAL_ROLES)
const STAFF_ROLES = INTERNAL_ROLES as UserRole[];

// Roles that can create/edit clients
const CLIENT_WRITE_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.MARKETING,
];

// Roles that can manage client archiving
const CLIENT_ARCHIVE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

// Roles that can view sites + all-sites list
const SITE_VIEW_ROLES: UserRole[] = [
  ...DEPLOYMENT_ROLES,
  ROLES.ASSISTANT_MANAGER,
  ROLES.ACCOUNTS_OFFICER,
] as UserRole[];

// Roles that can create/edit sites
const SITE_WRITE_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.OPERATIONS_SUPERVISOR,
];

// ── GET /summary — quick stats for dashboard ───────────────────────────────────
// Must be registered BEFORE /:id to avoid "summary" being captured as id param
router.get(
  '/summary',
  requireRole(...CLIENT_ARCHIVE_ROLES),
  asyncHandler(async (_req, res) => {
    const summary = await clientService.getSummary();
    res.status(200).json({ success: true, data: summary });
  }),
);

// ── GET /sites/all — all sites across all clients ──────────────────────────────
router.get(
  '/sites/all',
  requireRole(...SITE_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const result = await siteService.listAll(
      req.query as { page?: number; limit?: number; search?: string; clientId?: string },
    );
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /incidents/all — all incidents ────────────────────────────────────────
router.get(
  '/incidents/all',
  requireRole(ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.ASSISTANT_MANAGER),
  asyncHandler(async (req, res) => {
    const result = await incidentService.listAll(
      req.query as { page?: number; limit?: number; severity?: string; siteId?: string; from?: string; to?: string },
    );
    res.status(200).json({ success: true, ...result });
  }),
);

// ── GET /sites/:siteId — single site ──────────────────────────────────────────
router.get(
  '/sites/:siteId',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const site = await siteService.getById(req.params.siteId);
    res.status(200).json({ success: true, data: site });
  }),
);

// ── PATCH /sites/:siteId — update site ────────────────────────────────────────
router.patch(
  '/sites/:siteId',
  requireRole(...SITE_WRITE_ROLES),
  validate(UpdateSiteSchema),
  asyncHandler(async (req, res) => {
    const site = await siteService.update(req.params.siteId, req.body, req.user!.userId);
    res.status(200).json({ success: true, data: site });
  }),
);

// ── DELETE /sites/:siteId — delete site ───────────────────────────────────────
router.delete(
  '/sites/:siteId',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (req, res) => {
    await siteService.delete(req.params.siteId, req.user!.userId);
    res.status(200).json({ success: true, message: 'Site removed' });
  }),
);

// ── GET /sites/:siteId/incidents — incidents for a site ───────────────────────
router.get(
  '/sites/:siteId/incidents',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const result = await incidentService.listBySite(req.params.siteId, { page, limit });
    res.status(200).json({ success: true, ...result });
  }),
);

// ── POST /sites/:siteId/incidents — log an incident ───────────────────────────
router.post(
  '/sites/:siteId/incidents',
  requireRole(...DEPLOYMENT_ROLES),
  validate(CreateIncidentSchema.omit({ siteId: true })),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.create(
      { ...req.body, siteId: req.params.siteId },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: incident });
  }),
);

// ── GET / — list clients ───────────────────────────────────────────────────────
router.get(
  '/',
  requireRole(...STAFF_ROLES),
  validateQuery(ClientListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@stap/shared').ClientListQuery;
    const result = await clientService.list(query);
    res.status(200).json({ success: true, ...result });
  }),
);

// ── POST / — create client ────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(...CLIENT_WRITE_ROLES),
  validate(CreateClientSchema),
  asyncHandler(async (req, res) => {
    const client = await clientService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: client });
  }),
);

// ── GET /:id — get client ──────────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const client = await clientService.getById(req.params.id);
    res.status(200).json({ success: true, data: client });
  }),
);

// ── PATCH /:id — update client ────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole(...CLIENT_WRITE_ROLES),
  validate(UpdateClientSchema),
  asyncHandler(async (req, res) => {
    const client = await clientService.update(req.params.id, req.body, req.user!.userId);
    res.status(200).json({ success: true, data: client });
  }),
);

// ── PATCH /:id/archive — archive client ───────────────────────────────────────
router.patch(
  '/:id/archive',
  requireRole(...CLIENT_ARCHIVE_ROLES),
  asyncHandler(async (req, res) => {
    const client = await clientService.archive(req.params.id, req.user!.userId);
    res.status(200).json({ success: true, data: client });
  }),
);

// ── GET /:clientId/sites — list sites for a client ────────────────────────────
router.get(
  '/:clientId/sites',
  requireRole(...SITE_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const sites = await siteService.listByClient(req.params.clientId);
    res.status(200).json({ success: true, data: sites });
  }),
);

// ── POST /:clientId/sites — add site to client ────────────────────────────────
router.post(
  '/:clientId/sites',
  requireRole(...SITE_WRITE_ROLES),
  validate(CreateSiteSchema.omit({ clientId: true })),
  asyncHandler(async (req, res) => {
    const site = await siteService.create(
      { ...req.body, clientId: req.params.clientId },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: site });
  }),
);

export { router as clientsRouter };
