/**
 * @openapi
 * tags:
 *   - name: Guards
 *     description: Guard management — CRUD, documents, status changes, payslips
 *
 * /api/v1/guards:
 *   get:
 *     tags: [Guards]
 *     summary: List all guards (paginated, filterable)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, SUSPENDED, TERMINATED] }
 *     responses:
 *       200:
 *         description: Paginated list of guards
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         $ref: '#/components/schemas/Error401'
 *       403:
 *         $ref: '#/components/schemas/Error403'
 *   post:
 *     tags: [Guards]
 *     summary: Create a new guard
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, nationalId, phone, dateOfBirth, salaryRate, contractStart]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               nationalId: { type: string }
 *               phone: { type: string }
 *               dateOfBirth: { type: string, format: date-time }
 *               salaryRate: { type: integer }
 *               contractStart: { type: string, format: date-time }
 *               nextOfKinName: { type: string }
 *               nextOfKinPhone: { type: string }
 *     responses:
 *       201:
 *         description: Guard created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guard'
 *       400:
 *         $ref: '#/components/schemas/Error400'
 *       409:
 *         description: National ID already registered
 *
 * /api/v1/guards/{id}:
 *   get:
 *     tags: [Guards]
 *     summary: Get a single guard by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Guard detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guard'
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *   patch:
 *     tags: [Guards]
 *     summary: Update guard details
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
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               salaryRate: { type: integer }
 *     responses:
 *       200:
 *         description: Updated guard
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *
 * /api/v1/guards/{id}/status:
 *   patch:
 *     tags: [Guards]
 *     summary: Change guard employment status (SUSPEND, TERMINATE, REINSTATE)
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
 *             required: [status, reason]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, SUSPENDED, TERMINATED] }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Status changed
 *       403:
 *         $ref: '#/components/schemas/Error403'
 *       404:
 *         $ref: '#/components/schemas/Error404'
 *
 * /api/v1/guards/{id}/documents:
 *   get:
 *     tags: [Guards]
 *     summary: List documents uploaded for a guard
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of documents
 *   post:
 *     tags: [Guards]
 *     summary: Upload a document for a guard
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               docType: { type: string }
 *     responses:
 *       201:
 *         description: Document uploaded
 */
import { Router, type IRouter } from 'express';
import fs from 'fs';
import multer from 'multer';
import prisma from '../db/prisma';
import { guardService } from '../services/guardService';
import { bulkImportService } from '../services/bulkImportService';
import { letterService } from '../services/letterService';
import { uploadService } from '../services/uploadService';
import { guardDocumentUpload } from '../config/multer';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import {
  ROLES,
  INTERNAL_ROLES,
  HR_ROLES,
  GUARD_WRITE_ROLES,
  CreateGuardSchema,
  UpdateGuardSchema,
  GuardStatusSchema,
  ReinstateGuardSchema,
  CreateGuardTransferSchema,
  GuardListQuerySchema,
  GuardVettingDataSchema,
  CreateDisciplinarySchema,
  LetterGenerationSchema,
} from '@stap/shared';

// Memory-based upload for Excel imports (not saved to disk)
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new AppError('Only Excel files (.xlsx, .xls) are allowed', 400));
    }
  },
});

const router: IRouter = Router();

// All guard routes require authentication
router.use(authenticate);

// ── GET / — list guards ────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole(...INTERNAL_ROLES),
  validateQuery(GuardListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as import('@stap/shared').GuardListQuery;
    const result = await guardService.list(query, req.user!.role);
    res.status(200).json({ success: true, ...result });
  }),
);

// ── POST / — create guard ──────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(...GUARD_WRITE_ROLES),
  validate(CreateGuardSchema),
  asyncHandler(async (req, res) => {
    const guard = await guardService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: guard });
  }),
);

// ── GET /dashboard — guard KPI dashboard ──────────────────────────────────────
router.get(
  '/dashboard',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (_req, res) => {
    const stats = await guardService.getDashboardStats();
    res.status(200).json({ success: true, data: stats });
  }),
);

// ── GET /import/template — download Excel import template ──────────────────────
router.get(
  '/import/template',
  requireRole(...GUARD_WRITE_ROLES),
  asyncHandler(async (_req, res) => {
    const buffer = await bulkImportService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=STAP_Guard_Import_Template.xlsx');
    res.send(buffer);
  }),
);

// ── POST /import — upload and process Excel file ───────────────────────────────
router.post(
  '/import',
  requireRole(...GUARD_WRITE_ROLES),
  importUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const result = await bulkImportService.parseAndValidate(
      req.file.buffer,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: result });
  }),
);

// ── GET /recent-activity — last 10 updated guards ─────────────────────────────
router.get(
  '/recent-activity',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (_req, res) => {
    const guards = await prisma.guard.findMany({
      orderBy: { updatedAt: 'desc' },
      take:    10,
      select: {
        id: true, firstName: true, lastName: true, otherNames: true,
        employmentStatus: true, updatedAt: true,
      },
    });
    const data = guards.map((g) => ({
      id:               g.id,
      fullName:         [g.firstName, g.otherNames, g.lastName].filter(Boolean).join(' '),
      employmentStatus: g.employmentStatus,
      updatedAt:        g.updatedAt.toISOString(),
    }));
    res.status(200).json({ success: true, data });
  }),
);

// ── GET /:id — get guard by ID ─────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(...INTERNAL_ROLES),
  asyncHandler(async (req, res) => {
    const guard = await guardService.getById(req.params.id, req.user!.role);
    res.status(200).json({ success: true, data: guard });
  }),
);

// ── PATCH /:id — update guard ──────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole(...GUARD_WRITE_ROLES),
  validate(UpdateGuardSchema),
  asyncHandler(async (req, res) => {
    const guard = await guardService.update(req.params.id, req.body, req.user!.userId);
    res.status(200).json({ success: true, data: guard });
  }),
);

// ── PATCH /:id/status — change employment status ───────────────────────────────
router.patch(
  '/:id/status',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(GuardStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body as { status: string; reason: string };
    const guard = await guardService.updateStatus(
      req.params.id,
      status,
      reason,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: guard });
  }),
);

// ── POST /:id/reinstate — reinstate a SUSPENDED guard ─────────────────────────
router.post(
  '/:id/reinstate',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(ReinstateGuardSchema),
  asyncHandler(async (req, res) => {
    const guard = await guardService.reinstateGuard(
      req.params.id,
      req.body.reason,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: guard });
  }),
);

// ── POST /:id/transfer — record a guard transfer to a new site ────────────────
router.post(
  '/:id/transfer',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR),
  validate(CreateGuardTransferSchema),
  asyncHandler(async (req, res) => {
    const transfer = await guardService.transferGuard(
      req.params.id,
      req.body,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: transfer });
  }),
);

// ── GET /:id/transfers — list transfer history for a guard ────────────────────
router.get(
  '/:id/transfers',
  requireRole(...INTERNAL_ROLES),
  asyncHandler(async (req, res) => {
    const transfers = await guardService.getTransferHistory(req.params.id);
    res.status(200).json({ success: true, data: transfers });
  }),
);

// ── PUT /:id/vetting-data — replace relatives + associates ────────────────────
router.put(
  '/:id/vetting-data',
  requireRole(...GUARD_WRITE_ROLES),
  validate(GuardVettingDataSchema),
  asyncHandler(async (req, res) => {
    await guardService.updateVettingData(
      req.params.id,
      req.body.relatives ?? [],
      req.body.associates ?? [],
      req.user!.userId,
    );
    res.status(200).json({ success: true });
  }),
);

// ── POST /:id/photo — upload guard photo ───────────────────────────────────────
router.post(
  '/:id/photo',
  requireRole(...GUARD_WRITE_ROLES),
  guardDocumentUpload.single('photo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400);

    // Photos must be images only
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      throw new AppError('Only JPG and PNG images are allowed for photos', 400);
    }

    const guard = await guardService.uploadPhoto(
      req.params.id,
      req.file.path,
      req.user!.userId,
    );
    res.status(200).json({ success: true, data: { photoUrl: guard.photoUrl } });
  }),
);

// ── POST /:id/documents — upload guard document ────────────────────────────────
router.post(
  '/:id/documents',
  requireRole(...GUARD_WRITE_ROLES),
  guardDocumentUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const { documentType } = req.body as { documentType?: string };
    if (!documentType) throw new AppError('documentType is required', 400);

    const validTypes = [
      'NIN', 'LC1_LETTER', 'CONTRACT', 'PSO_CERTIFICATE',
      'NSSF', 'WARNING_LETTER', 'OTHER',
    ];
    if (!validTypes.includes(documentType)) {
      throw new AppError(`Invalid documentType. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const doc = await uploadService.saveGuardDocument(
      req.params.id,
      req.file,
      documentType,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: doc });
  }),
);

// ── GET /:id/documents — list guard documents ──────────────────────────────────
router.get(
  '/:id/documents',
  requireRole(...INTERNAL_ROLES),
  asyncHandler(async (req, res) => {
    const docs = await prisma.guardDocument.findMany({
      where: { guardId: req.params.id, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
      include: { uploader: { select: { name: true } } },
    });

    res.status(200).json({
      success: true,
      data: docs.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        filePath: d.filePath,
        version: d.version,
        uploadedAt: d.uploadedAt.toISOString(),
        uploadedBy: { name: d.uploader.name },
        deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
      })),
    });
  }),
);

// ── GET /:id/deployment-history — guard deployment history ─────────────────────
router.get(
  '/:id/deployment-history',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR, ROLES.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '10'), 10);
    const result = await guardService.getDeploymentHistory(req.params.id, { page, limit });
    res.status(200).json({ success: true, ...result });
  }),
);

// ── DELETE /:id/documents/:docId — soft-delete a document ─────────────────────
router.delete(
  '/:id/documents/:docId',
  requireRole(...GUARD_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    // Soft delete only — documents are legal records and must not be permanently destroyed
    const doc = await prisma.guardDocument.findFirst({
      where: { id: req.params.docId, guardId: req.params.id },
    });

    if (!doc) throw new AppError('Document not found', 404);

    await prisma.guardDocument.update({
      where: { id: req.params.docId },
      data: { deletedAt: new Date() },
    });

    await QueueService.logAudit({
      userId: req.user!.userId,
      action: 'DOCUMENT_DELETED',
      entity: 'guardDocument',
      entityId: req.params.docId,
      oldValue: { guardId: req.params.id, documentType: doc.documentType },
    });

    res.status(200).json({ success: true, message: 'Document removed' });
  }),
);

// ── POST /:id/disciplinary — create disciplinary record ────────────────────────
router.post(
  '/:id/disciplinary',
  requireRole(...GUARD_WRITE_ROLES),
  validate(CreateDisciplinarySchema),
  asyncHandler(async (req, res) => {
    const guard = await prisma.guard.findUnique({ where: { id: req.params.id } });
    if (!guard) throw new AppError('Guard not found', 404);

    const record = await prisma.disciplinaryRecord.create({
      data: {
        guardId: req.params.id,
        incidentDate: new Date(req.body.incidentDate),
        type: req.body.type,
        officerId: req.user!.userId,
        reason: req.body.reason,
        outcome: req.body.outcome,
      },
      include: {
        guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, nationalId: true } },
        officer: { select: { id: true, name: true } },
      },
    });

    await QueueService.logAudit({
      userId: req.user!.userId,
      action: 'DISCIPLINARY_RECORD_CREATED',
      entity: 'disciplinaryRecord',
      entityId: record.id,
      newValue: { guardId: req.params.id, type: record.type },
    });

    const fullName = [record.guard.firstName, record.guard.otherNames, record.guard.lastName]
      .filter(Boolean)
      .join(' ');

    res.status(201).json({
      success: true,
      data: {
        id: record.id,
        guard: { id: record.guard.id, fullName, nationalId: record.guard.nationalId },
        incidentDate: record.incidentDate.toISOString(),
        type: record.type,
        officer: { id: record.officer.id, name: record.officer.name },
        reason: record.reason,
        outcome: record.outcome,
        letterPath: record.letterPath,
        createdAt: record.createdAt.toISOString(),
      },
    });
  }),
);

// ── GET /:id/disciplinary — list disciplinary records for a guard ──────────────
router.get(
  '/:id/disciplinary',
  requireRole(...HR_ROLES, ROLES.OPERATIONS_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const records = await prisma.disciplinaryRecord.findMany({
      where: { guardId: req.params.id },
      orderBy: { incidentDate: 'desc' },
      include: {
        guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, nationalId: true } },
        officer: { select: { id: true, name: true } },
      },
    });

    res.status(200).json({
      success: true,
      data: records.map((r) => ({
        id: r.id,
        guard: {
          id: r.guard.id,
          fullName: [r.guard.firstName, r.guard.otherNames, r.guard.lastName].filter(Boolean).join(' '),
          nationalId: r.guard.nationalId,
        },
        incidentDate: r.incidentDate.toISOString(),
        type: r.type,
        officer: { id: r.officer.id, name: r.officer.name },
        reason: r.reason,
        outcome: r.outcome,
        letterPath: r.letterPath,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

// ── GET /:id/id-card — generate a printable PDF ID card ───────────────────────
router.get(
  '/:id/id-card',
  requireRole(...GUARD_WRITE_ROLES, ROLES.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const buffer = await guardService.generateIdCard(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=STAP-Guard-ID-${req.params.id}.pdf`);
    res.send(buffer);
  }),
);

// ── POST /:id/letters — generate a letter for a guard ─────────────────────────
router.post(
  '/:id/letters',
  requireRole(...GUARD_WRITE_ROLES),
  validate(LetterGenerationSchema),
  asyncHandler(async (req, res) => {
    const result = await letterService.generateLetter(
      { ...req.body, guardId: req.params.id },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: result });
  }),
);

// ── GET /:id/letters — list generated letters for a guard ─────────────────────
router.get(
  '/:id/letters',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const docs = await prisma.guardDocument.findMany({
      where: {
        guardId: req.params.id,
        documentType: { in: ['WARNING_LETTER', 'CONTRACT', 'OTHER'] },
        deletedAt: null,
      },
      orderBy: { uploadedAt: 'desc' },
      include: { uploader: { select: { name: true } } },
    });

    res.status(200).json({
      success: true,
      data: docs.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        filePath: d.filePath,
        version: d.version,
        uploadedAt: d.uploadedAt.toISOString(),
        uploadedBy: { name: d.uploader.name },
        deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
      })),
    });
  }),
);

// ── POST /salary-increment/run — manual trigger (Director only) ────────────────
router.post(
  '/salary-increment/run',
  requireRole(ROLES.DIRECTOR),
  asyncHandler(async (_req, res) => {
    await guardService.runSalaryIncrements();
    res.json({ success: true, message: 'Salary increment check completed.' });
  }),
);

export { router as guardsRouter };
