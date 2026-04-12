import { Router, type IRouter } from 'express';
import fs from 'fs';
import prisma from '../db/prisma';
import { guardService } from '../services/guardService';
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
  GUARD_WRITE_ROLES,
  CreateGuardSchema,
  UpdateGuardSchema,
  GuardStatusSchema,
  GuardListQuerySchema,
} from '@stap/shared';

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

export { router as guardsRouter };
