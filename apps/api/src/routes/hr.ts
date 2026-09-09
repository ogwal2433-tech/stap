/**
 * @openapi
 * tags:
 *   - name: HR
 *     description: Recruitment pipeline, training sessions, leave management, letter templates
 *
 * /api/v1/hr/applicants:
 *   get:
 *     tags: [HR]
 *     summary: List applicants (pipeline view, paginated)
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [APPLICATION_RECEIVED, SCREENING, INTERVIEW_SCHEDULED, INTERVIEW_DONE, OFFER_MADE, ACCEPTED, REJECTED, ONBOARDING] }
 *     responses:
 *       200:
 *         description: Paginated applicant list
 *   post:
 *     tags: [HR]
 *     summary: Add a new applicant to the pipeline
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, phone, source]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               source: { type: string, enum: [WALK_IN, REFERRAL, ADVERT, OTHER] }
 *               email: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Applicant created
 *
 * /api/v1/hr/applicants/{id}/stage:
 *   patch:
 *     tags: [HR]
 *     summary: Advance or reject applicant stage
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
 *             required: [stage]
 *             properties:
 *               stage: { type: string, enum: [APPLICATION_RECEIVED, SCREENING, INTERVIEW_SCHEDULED, INTERVIEW_DONE, OFFER_MADE, ACCEPTED, REJECTED, ONBOARDING] }
 *     responses:
 *       200:
 *         description: Stage updated
 *       400:
 *         description: Invalid stage transition
 *
 * /api/v1/hr/training:
 *   get:
 *     tags: [HR]
 *     summary: List training sessions
 *     responses:
 *       200:
 *         description: Paginated training sessions
 *   post:
 *     tags: [HR]
 *     summary: Schedule a training session
 *     responses:
 *       201:
 *         description: Session created
 *
 * /api/v1/hr/training/{id}/results:
 *   post:
 *     tags: [HR]
 *     summary: Record attendance and pass/fail results for a session
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Results recorded
 *
 * /api/v1/hr/leave:
 *   get:
 *     tags: [HR]
 *     summary: List leave requests (GUARD sees own requests only)
 *     responses:
 *       200:
 *         description: Paginated leave requests
 *   post:
 *     tags: [HR]
 *     summary: Submit a leave request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guardId, leaveType, startDate, endDate]
 *             properties:
 *               guardId: { type: string, format: uuid }
 *               leaveType: { type: string, enum: [ANNUAL, SICK, MATERNITY, PATERNITY, UNPAID, OTHER] }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Leave request submitted
 *       400:
 *         description: Insufficient leave balance or invalid dates
 *
 * /api/v1/hr/leave/{id}/approve:
 *   post:
 *     tags: [HR]
 *     summary: Approve or reject a leave request
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
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, REJECT] }
 *               comment: { type: string }
 *     responses:
 *       200:
 *         description: Request approved or rejected
 *
 * /api/v1/hr/letter-templates:
 *   get:
 *     tags: [HR]
 *     summary: List all letter templates
 *     responses:
 *       200:
 *         description: Array of letter templates with HTML content
 *
 * /api/v1/hr/letter-templates/{type}:
 *   put:
 *     tags: [HR]
 *     summary: Save (upsert) a letter template
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [VERBAL_WARNING, FIRST_WARNING, FINAL_WARNING, TERMINATION_NOTICE, APPOINTMENT_LETTER, CONTRACT_EXTENSION, CONFIRMATION_OF_EMPLOYMENT, SALARY_REVIEW] }
 *     responses:
 *       200:
 *         description: Template saved
 *
 * /api/v1/hr/letter-templates/{type}/preview:
 *   post:
 *     tags: [HR]
 *     summary: Render a template with sample data
 *     responses:
 *       200:
 *         description: Rendered HTML string
 */
import { Router, type IRouter } from 'express';
import { hrService } from '../services/hrService';
import prisma from '../db/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, AppError } from '../errors/AppError';
import { guardDocumentUpload } from '../config/multer';
import {
  ROLES,
  HR_ROLES,
  INTERNAL_ROLES,
  CreateApplicantSchema,
  UpdateApplicantStageSchema,
  DocumentVerificationSchema,
  VettingRequirementsSchema,
  CreateTrainingSessionSchema,
  RecordTrainingResultsSchema,
  CreateLeaveRequestSchema,
  ApproveLeaveSchema,
  SaveLetterTemplateSchema,
  CreateGuardSchema,
} from '@stap/shared';

const router: IRouter = Router();

router.use(authenticate);

/**
 * Recruitment and vetting. The Trainer runs this pipeline — recruiting, vetting
 * and training guards is their brief — but converting an applicant into an
 * employee stays with HR, since that writes a Guard record.
 */
const RECRUITMENT_ROLES = [...HR_ROLES, ROLES.TRAINER, ROLES.HR] as const;
const RECRUITMENT_VIEW_ROLES = [...RECRUITMENT_ROLES, ROLES.OPERATIONS_SUPERVISOR] as const;

// ── Recruitment ────────────────────────────────────────────────────────────────

router.get(
  '/applicants',
  requireRole(...RECRUITMENT_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const stage = req.query.stage as string | undefined;
    const result = await hrService.listApplicants({ stage, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/applicants',
  requireRole(...RECRUITMENT_ROLES),
  validate(CreateApplicantSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.createApplicant(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/applicants/pipeline',
  requireRole(...RECRUITMENT_VIEW_ROLES),
  asyncHandler(async (_req, res) => {
    const data = await hrService.getPipelineSummary();
    res.json({ success: true, data });
  }),
);

router.patch(
  '/applicants/:id/stage',
  requireRole(...RECRUITMENT_ROLES),
  validate(UpdateApplicantStageSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.updateStage(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.get(
  '/applicants/:id',
  requireRole(...RECRUITMENT_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const data = await hrService.getApplicant(req.params.id);
    res.json({ success: true, data });
  }),
);

router.post(
  '/applicants/:id/convert',
  requireRole(...HR_ROLES, ROLES.HR),
  validate(CreateGuardSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.convertToGuard(req.params.id, req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/applicants/:id/verify-documents',
  requireRole(...RECRUITMENT_ROLES),
  validate(DocumentVerificationSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.verifyDocuments(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/applicants/:id/vetting-requirements',
  requireRole(...RECRUITMENT_ROLES),
  validate(VettingRequirementsSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.updateVettingRequirements(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/applicants/:id/application-letter',
  requireRole(...RECRUITMENT_ROLES),
  guardDocumentUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const data = await hrService.uploadApplicationLetter(
      req.params.id,
      req.file.path,
      req.user!.userId,
    );
    res.json({ success: true, data });
  }),
);

router.post(
  '/applicants/:id/vetting-form',
  requireRole(...RECRUITMENT_ROLES),
  guardDocumentUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const data = await hrService.uploadVettingForm(
      req.params.id,
      req.file.path,
      req.user!.userId,
    );
    res.json({ success: true, data });
  }),
);

// ── Facilitator lookup (dropdown data for the scheduling form) ───────────────
// Was restricted to users holding the TRAINER role. Supervisors, controllers
// and administrators run sessions too, so this is every active member of
// staff — guards and client portal logins excluded, since neither facilitates.
// Kept on the /trainers path: it is the same lookup for the same dropdown, and
// a second endpoint returning almost the same list would only drift.
router.get(
  '/trainers',
  requireRole(...HR_ROLES, ROLES.TRAINER),
  asyncHandler(async (_req, res) => {
    const facilitators = await prisma.user.findMany({
      where:   { role: { notIn: [ROLES.GUARD, ROLES.CLIENT] }, status: 'ACTIVE' },
      select:  { id: true, name: true, role: true, jobTitle: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: facilitators });
  }),
);

// ── Training ───────────────────────────────────────────────────────────────────

const TRAINING_VIEW_ROLES = [
  ...INTERNAL_ROLES.filter((r) => r !== ROLES.GUARD && r !== ROLES.CLIENT),
  ROLES.HR,
];

router.get(
  '/training',
  requireRole(...TRAINING_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const page      = Number(req.query.page)  || 1;
    const limit     = Number(req.query.limit) || 20;
    const status      = req.query.status      as string | undefined;
    const targetGroup = req.query.targetGroup as string | undefined;
    // trainerId still accepted so an existing caller keeps working; the column
    // it filters on is facilitatorUserId now.
    const facilitatorUserId =
      (req.query.facilitatorUserId ?? req.query.trainerId) as string | undefined;
    const result = await hrService.listSessions({
      status, facilitatorUserId, targetGroup, page, limit,
    });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/training',
  requireRole(...HR_ROLES, ROLES.TRAINER),
  validate(CreateTrainingSessionSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.createTrainingSession(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/training/:id/results',
  requireRole(...HR_ROLES, ROLES.TRAINER),
  validate(RecordTrainingResultsSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.recordResults(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Leave ──────────────────────────────────────────────────────────────────────

const LEAVE_ROLES = [...INTERNAL_ROLES.filter((r) => r !== ROLES.CLIENT), ROLES.HR];

router.get(
  '/leave',
  requireRole(...LEAVE_ROLES),
  asyncHandler(async (req, res) => {
    const page    = Number(req.query.page)  || 1;
    const limit   = Number(req.query.limit) || 20;
    const status  = req.query.status  as string | undefined;
    const type    = req.query.type    as string | undefined;
    let guardId   = req.query.guardId as string | undefined;

    // Guards can only see their own leave requests
    if (req.user!.role === ROLES.GUARD) {
      const guard = await import('../db/prisma').then((m) =>
        m.default.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } }),
      );
      guardId = guard?.id;
    }

    const result = await hrService.listLeaveRequests({ guardId, status, type, page, limit });
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/leave',
  requireRole(...LEAVE_ROLES),
  validate(CreateLeaveRequestSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.requestLeave(req.body, req.user!.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/leave/:guardId/balance',
  requireRole(...HR_ROLES, ROLES.GUARD),
  asyncHandler(async (req, res) => {
    // Guards can only check own balance
    if (req.user!.role === ROLES.GUARD) {
      const guard = await import('../db/prisma').then((m) =>
        m.default.guard.findUnique({ where: { userId: req.user!.userId }, select: { id: true } }),
      );
      if (guard?.id !== req.params.guardId) {
        throw new ForbiddenError('Guards can only view their own leave balance');
      }
    }
    const data = await hrService.getLeaveBalance(req.params.guardId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/leave/:id/approve',
  requireRole(...HR_ROLES, ROLES.HR),
  validate(ApproveLeaveSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.approveLeave(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

// ── Letter Templates ───────────────────────────────────────────────────────────

router.get(
  '/templates',
  requireRole(...HR_ROLES, ROLES.HR),
  asyncHandler(async (_req, res) => {
    const data = await hrService.listTemplates();
    res.json({ success: true, data });
  }),
);

router.get(
  '/templates/:letterType',
  requireRole(...HR_ROLES, ROLES.HR),
  asyncHandler(async (req, res) => {
    const data = await hrService.getTemplate(req.params.letterType);
    res.json({ success: true, data });
  }),
);

router.put(
  '/templates/:letterType',
  requireRole(...HR_ROLES, ROLES.HR),
  validate(SaveLetterTemplateSchema),
  asyncHandler(async (req, res) => {
    const data = await hrService.saveTemplate(req.body, req.user!.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/templates/:letterType/preview',
  requireRole(...HR_ROLES, ROLES.HR),
  asyncHandler(async (req, res) => {
    const { sampleData } = req.body as { sampleData: Record<string, string> };
    const html = await hrService.previewTemplate(req.params.letterType, sampleData ?? {});
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }),
);

export { router as hrRouter };
