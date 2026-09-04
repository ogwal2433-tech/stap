import { Router, type IRouter } from 'express';
import { letterService } from '../services/letterService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ROLES, INTERNAL_ROLES, HR_ROLES, GenerateLetterSchema, ApproveLetterSchema, UpdateLetterBodySchema } from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// All internal users can generate a letter draft.
// CLIENT and GUARD are excluded via INTERNAL_ROLES (which omits them).
const GENERATE_ROLES = [...INTERNAL_ROLES, ROLES.HR];

router.post(
  '/',
  requireRole(...GENERATE_ROLES),
  validate(GenerateLetterSchema),
  asyncHandler(async (req, res) => {
    const data = await letterService.generateRecord(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/',
  requireRole(...GENERATE_ROLES),
  asyncHandler(async (req, res) => {
    // The HR officer browses every letter, like the managers do; everyone else
    // sees an unscoped listing limited to what they generated themselves.
    const isHR = ([...HR_ROLES, ROLES.HR] as string[]).includes(req.user!.role);
    const subjectId = req.query.subjectId as string | undefined;
    // A subjectId-scoped query (e.g. a guard's profile) is its own access
    // boundary — anyone who can view that subject sees all its letters,
    // regardless of who generated them. The generatedBy restriction only
    // applies to an unscoped listing (which non-HR users can't broadly browse).
    const result = await letterService.listRecords({
      subjectId,
      approvalStatus:       req.query.approvalStatus       as string | undefined,
      letterType:           req.query.letterType           as string | undefined,
      disciplinaryRecordId: req.query.disciplinaryRecordId as string | undefined,
      isDisciplinary:       req.query.isDisciplinary === undefined
                               ? undefined
                               : req.query.isDisciplinary === 'true',
      generatedBy:          (!isHR && !subjectId) ? req.user!.userId : undefined,
      page:                 Number(req.query.page)  || 1,
      limit:                Number(req.query.limit) || 20,
    });
    res.json({ success: true, ...result });
  }),
);

router.get(
  '/:id',
  requireRole(...GENERATE_ROLES),
  asyncHandler(async (req, res) => {
    const data = await letterService.getRecord(req.params.id);
    res.json({ success: true, data });
  }),
);

router.get(
  '/:id/pdf',
  requireRole(...GENERATE_ROLES),
  asyncHandler(async (req, res) => {
    const { buffer, fileName } = await letterService.getPdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }),
);

// Only HR (Director / Assistant Manager) can edit a pending letter's body.
router.patch(
  '/:id/body',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(UpdateLetterBodySchema),
  asyncHandler(async (req, res) => {
    const data = await letterService.updateBody(req.params.id, req.body.body);
    res.json({ success: true, data });
  }),
);

// Only HR (Director / Assistant Manager) can approve or reject letters.
router.patch(
  '/:id/approve',
  requireRole(ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER),
  validate(ApproveLetterSchema),
  asyncHandler(async (req, res) => {
    const data = await letterService.approveRecord(
      req.params.id,
      req.body.approvalStatus,
      req.body.approvalNotes,
      req.user!.userId,
    );
    res.json({ success: true, data });
  }),
);

export { router as lettersRouter };
