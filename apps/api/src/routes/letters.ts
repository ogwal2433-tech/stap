import { Router, type IRouter } from 'express';
import { letterService } from '../services/letterService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ROLES, INTERNAL_ROLES, HR_ROLES, GenerateLetterSchema, ApproveLetterSchema } from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

// All internal users can generate a letter draft.
// CLIENT and GUARD are excluded via INTERNAL_ROLES (which omits them).
const GENERATE_ROLES = INTERNAL_ROLES;

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
    const isHR = (HR_ROLES as string[]).includes(req.user!.role);
    const result = await letterService.listRecords({
      subjectId:      req.query.subjectId      as string | undefined,
      approvalStatus: req.query.approvalStatus as string | undefined,
      letterType:     req.query.letterType     as string | undefined,
      generatedBy:    isHR ? undefined : req.user!.userId,
      page:           Number(req.query.page)   || 1,
      limit:          Number(req.query.limit)  || 20,
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
