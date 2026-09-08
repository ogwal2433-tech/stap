/**
 * @openapi
 * tags:
 *   - name: Clients
 *     description: Client management, sites, incidents, and contracts
 *
 * /api/v1/clients:
 *   get:
 *     tags: [Clients]
 *     summary: List clients (paginated)
 *     responses:
 *       200:
 *         description: Paginated client list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *   post:
 *     tags: [Clients]
 *     summary: Create a new client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientName, contactPerson, contactPhone, physicalAddress]
 *             properties:
 *               clientName: { type: string }
 *               contactPerson: { type: string }
 *               contactPhone: { type: string }
 *               physicalAddress: { type: string }
 *               billingTerms: { type: integer, default: 30 }
 *     responses:
 *       201:
 *         description: Client created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *
 * /api/v1/clients/{id}:
 *   get:
 *     tags: [Clients]
 *     summary: Get client details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Client detail with contracts and sites
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *   patch:
 *     tags: [Clients]
 *     summary: Update client details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Updated client
 *
 * /api/v1/clients/{id}/sites:
 *   get:
 *     tags: [Clients]
 *     summary: List sites for a client
 *   post:
 *     tags: [Clients]
 *     summary: Add a site to a client
 *     responses:
 *       201:
 *         description: Site created
 *
 * /api/v1/clients/{id}/incidents:
 *   get:
 *     tags: [Clients]
 *     summary: List incidents at a client site
 *   post:
 *     tags: [Clients]
 *     summary: Report an incident
 *     responses:
 *       201:
 *         description: Incident recorded
 */
import { Router, type IRouter } from 'express';
import { clientService } from '../services/clientService';
import { accessService } from '../services/accessService';
import { siteService } from '../services/siteService';
import { incidentService } from '../services/incidentService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  ROLES,
  INTERNAL_ROLES,
  DEPLOYMENT_ROLES,
  ClientListQuerySchema,
  ClientContactSchema,
  CreateClientSchema,
  UpdateClientSchema,
  CreateSiteSchema,
  CreateSiteInputSchema,
  UpdateSiteSchema,
  CreateIncidentSchema,
  GrantClientPortalSchema,
  ResetPortalPasswordSchema,
} from '@stap/shared';
import type { UserRole } from '@stap/shared';

const router: IRouter = Router();

// All client routes require authentication
router.use(authenticate);

// Internal staff roles (excludes GUARD and CLIENT — already the case for INTERNAL_ROLES).
// Still used by the site sub-routes below, which are about a site rather than
// the client that owns it. The client list and detail moved onto CLIENTS_VIEW:
// they are the Clients module, so revoking that permission has to close them —
// a role list here meant revoking it only hid the nav item.
const STAFF_ROLES = INTERNAL_ROLES as UserRole[];

// Roles that can create/edit clients
const CLIENT_WRITE_ROLES: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ASSISTANT_MANAGER,
  ROLES.MARKETING_HEAD,
  ROLES.SALES,
];

// Roles that can manage client archiving
const CLIENT_ARCHIVE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

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
  requirePermission(PERMISSIONS.SITES_VIEW),
  asyncHandler(async (req, res) => {
    const result = await siteService.listAll(
      req.query as { page?: number; limit?: number; search?: string; clientId?: string; unzoned?: string },
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

// ── GET /sites/:siteId/shift — the shift this site deploys on ─────────────────
// Feeds the deployment sheet's read-only Shift column.
router.get(
  '/sites/:siteId/shift',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const shift = await siteService.getShift(req.params.siteId);
    res.status(200).json({ success: true, data: shift });
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
  requirePermission(PERMISSIONS.CLIENTS_VIEW),
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
  requirePermission(PERMISSIONS.CLIENTS_VIEW),
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

// ── Contact persons ───────────────────────────────────────────────────────────
//
// Gated exactly as the client itself is: contacts are client fields that grew
// into rows, so whoever may edit a client may edit its contacts. PERMISSIONS
// .CLIENTS_EDIT exists but currently gates nothing, and is held by a narrower
// set than CLIENT_WRITE_ROLES — using it here would let Marketing Head create a
// client with contacts and then be unable to add one to it.

// ── GET /:id/contacts — list a client's contacts ──────────────────────────────
router.get(
  '/:id/contacts',
  requirePermission(PERMISSIONS.CLIENTS_VIEW),
  asyncHandler(async (req, res) => {
    const contacts = await clientService.listContacts(req.params.id);
    res.status(200).json({ success: true, data: contacts });
  }),
);

// ── POST /:id/contacts — add a contact ────────────────────────────────────────
router.post(
  '/:id/contacts',
  requireRole(...CLIENT_WRITE_ROLES),
  validate(ClientContactSchema),
  asyncHandler(async (req, res) => {
    const contact = await clientService.addContact(req.params.id, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: contact });
  }),
);

// ── PATCH /:id/contacts/:contactId — edit a contact ───────────────────────────
router.patch(
  '/:id/contacts/:contactId',
  requireRole(...CLIENT_WRITE_ROLES),
  validate(ClientContactSchema.partial()),
  asyncHandler(async (req, res) => {
    const contact = await clientService.updateContact(
      req.params.id, req.params.contactId, req.body, req.user!.userId,
    );
    res.status(200).json({ success: true, data: contact });
  }),
);

// ── DELETE /:id/contacts/:contactId — remove a contact ────────────────────────
router.delete(
  '/:id/contacts/:contactId',
  requireRole(...CLIENT_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await clientService.deleteContact(req.params.id, req.params.contactId, req.user!.userId);
    res.status(200).json({ success: true, message: 'Contact removed' });
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
  requirePermission(PERMISSIONS.SITES_VIEW),
  asyncHandler(async (req, res) => {
    const sites = await siteService.listByClient(req.params.clientId);
    res.status(200).json({ success: true, data: sites });
  }),
);

// ── POST /:clientId/sites — add site to client ────────────────────────────────
router.post(
  '/:clientId/sites',
  requireRole(...SITE_WRITE_ROLES),
  validate(CreateSiteInputSchema.omit({ clientId: true })),
  asyncHandler(async (req, res) => {
    const site = await siteService.create(
      { ...req.body, clientId: req.params.clientId },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: site });
  }),
);

// ── Client portal access ──────────────────────────────────────────────────────
// The portal is switched on from the client that already exists. A company may
// hold more than one login — finance and operations often want their own — so
// granting adds a contact rather than replacing the last one.

// ── GET /:id/portal-access — the logins this client holds ────────────────────
router.get(
  '/:id/portal-access',
  requirePermission(PERMISSIONS.CLIENTS_VIEW),
  asyncHandler(async (req, res) => {
    const accounts = await accessService.listClientPortalAccounts(req.params.id as string);
    res.status(200).json({ success: true, data: accounts });
  }),
);

// ── POST /:id/grant-portal-access — add a portal login ───────────────────────
router.post(
  '/:id/grant-portal-access',
  requirePermission(PERMISSIONS.CLIENTS_EDIT),
  validate(GrantClientPortalSchema),
  asyncHandler(async (req, res) => {
    const account = await accessService.grantClientPortalAccess(
      req.params.id as string,
      req.body.email,
      req.body.password,
      req.body.contactName,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: account });
  }),
);

// ── DELETE /:id/revoke-portal-access — turn the portal off ───────────────────
// Without ?userId the whole portal goes dark; with it, just that one contact.
router.delete(
  '/:id/revoke-portal-access',
  requirePermission(PERMISSIONS.CLIENTS_EDIT),
  asyncHandler(async (req, res) => {
    const result = await accessService.revokeClientPortalAccess(
      req.params.id as string,
      req.user!.userId,
      typeof req.query.userId === 'string' ? req.query.userId : undefined,
    );
    res.status(200).json({ success: true, data: result });
  }),
);

// ── POST /:id/reset-portal-password — new temporary password ─────────────────
router.post(
  '/:id/reset-portal-password',
  requirePermission(PERMISSIONS.CLIENTS_EDIT),
  validate(ResetPortalPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await accessService.resetClientPortalPassword(
      req.params.id as string,
      req.body.userId,
      req.body.newPassword,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: result });
  }),
);

export { router as clientsRouter };
