/**
 * @openapi
 * tags:
 *   - name: Scheduled Jobs
 *     description: Background jobs — status, history, pause/resume and manual runs
 */
import { Router } from 'express';
import type { IRouter } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, NotFoundError } from '../errors/AppError';
import { writeAuditLog } from '../lib/auditLog';
import prisma from '../db/prisma';
import { jobDefinition } from '../constants/jobRegistry';
import { runRegisteredJob } from '../lib/jobRunner';
import { z } from 'zod';

const router: IRouter = Router();

const LOG_INCLUDE = {
  triggeredByUser: { select: { id: true, name: true } },
} as const;

type LogRow = {
  id: string; startedAt: Date; finishedAt: Date | null; status: string;
  duration: number | null; result: unknown; error: string | null;
  triggeredByUser: { id: string; name: string } | null;
};

const fmtLog = (l: LogRow) => ({
  id:          l.id,
  startedAt:   l.startedAt.toISOString(),
  finishedAt:  l.finishedAt?.toISOString() ?? null,
  status:      l.status,
  duration:    l.duration,
  result:      l.result ?? null,
  error:       l.error,
  triggeredBy: l.triggeredByUser?.name ?? 'Scheduler',
});

type JobRow = {
  id: string; key: string; name: string; description: string | null;
  cronExpr: string; cronHuman: string; category: string; isActive: boolean;
  lastRunAt: Date | null; lastRunStatus: string | null; lastRunDuration: number | null;
  lastRunError: string | null; nextRunAt: Date | null;
  totalRuns: number; totalFailed: number;
  logs?: LogRow[];
};

const fmtJob = (j: JobRow) => ({
  key:             j.key,
  name:            j.name,
  description:     j.description,
  cronExpr:        j.cronExpr,
  cronHuman:       j.cronHuman,
  category:        j.category,
  isActive:        j.isActive,
  lastRunAt:       j.lastRunAt?.toISOString() ?? null,
  lastRunStatus:   j.lastRunStatus,
  lastRunDuration: j.lastRunDuration,
  lastRunError:    j.lastRunError,
  nextRunAt:       j.nextRunAt?.toISOString() ?? null,
  totalRuns:       j.totalRuns,
  totalFailed:     j.totalFailed,
  // A row whose key is no longer in the registry is history, not something the
  // system can still run. The UI hides Run Now for these rather than offering a
  // button that would do nothing.
  isRegistered:    !!jobDefinition(j.key),
  logs:            (j.logs ?? []).map(fmtLog),
});

router.use(authenticate);

// GET /scheduled-jobs
router.get(
  '/',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => {
    const jobs = await prisma.scheduledJob.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { logs: { orderBy: { startedAt: 'desc' }, take: 5, include: LOG_INCLUDE } },
    });
    res.json({ success: true, data: jobs.map((j) => fmtJob(j as JobRow)) });
  }),
);

// GET /scheduled-jobs/:key/logs — paginated history
router.get(
  '/:key/logs',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  validateQuery(z.object({
    page:  z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const job = await prisma.scheduledJob.findUnique({ where: { key: req.params.key } });
    if (!job) throw new NotFoundError('Job not found');

    const [logs, total] = await Promise.all([
      prisma.jobRunLog.findMany({
        where:   { jobId: job.id },
        include: LOG_INCLUDE,
        orderBy: { startedAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.jobRunLog.count({ where: { jobId: job.id } }),
    ]);

    res.json({
      success: true,
      data:    logs.map((l) => fmtLog(l as LogRow)),
      total, page, limit,
      pages:   Math.ceil(total / limit) || 1,
    });
  }),
);

// GET /scheduled-jobs/:key
router.get(
  '/:key',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    const job = await prisma.scheduledJob.findUnique({
      where:   { key: req.params.key },
      include: { logs: { orderBy: { startedAt: 'desc' }, take: 20, include: LOG_INCLUDE } },
    });
    if (!job) throw new NotFoundError('Job not found');
    res.json({ success: true, data: fmtJob(job as JobRow) });
  }),
);

/** Pause and resume differ only by the flag, so they share a handler. */
const setActive = (isActive: boolean) =>
  asyncHandler(async (req: Parameters<Parameters<typeof asyncHandler>[0]>[0], res: Parameters<Parameters<typeof asyncHandler>[0]>[1]) => {
    const existing = await prisma.scheduledJob.findUnique({ where: { key: req.params.key } });
    if (!existing) throw new NotFoundError('Job not found');

    const job = await prisma.scheduledJob.update({
      where: { key: req.params.key },
      data:  { isActive },
    });

    await writeAuditLog({
      userId:   req.user!.userId,
      action:   isActive ? 'JOB_RESUMED' : 'JOB_PAUSED',
      entity:   'scheduledJob',
      entityId: job.id,
      oldValue: { isActive: existing.isActive },
      newValue: { isActive, key: job.key },
    });

    res.json({ success: true, data: fmtJob(job as JobRow) });
  });

// PATCH /scheduled-jobs/:key/pause
router.patch('/:key/pause', requirePermission(PERMISSIONS.SETTINGS_EDIT), setActive(false));

// PATCH /scheduled-jobs/:key/resume
router.patch('/:key/resume', requirePermission(PERMISSIONS.SETTINGS_EDIT), setActive(true));

// POST /scheduled-jobs/:key/trigger — run it now
router.post(
  '/:key/trigger',
  requirePermission(PERMISSIONS.SETTINGS_EDIT),
  asyncHandler(async (req, res) => {
    const job = await prisma.scheduledJob.findUnique({ where: { key: req.params.key } });
    if (!job) throw new NotFoundError('Job not found');

    if (!jobDefinition(job.key)) {
      throw new AppError(
        `"${job.name}" has no implementation in this build and cannot be run.`,
        400,
      );
    }
    if (job.lastRunStatus === 'RUNNING') {
      throw new AppError('This job is already running. Wait for it to finish.', 409);
    }

    // Answered immediately and left to run: a job that takes minutes would
    // otherwise hold the request open until the browser gave up on it, and the
    // caller cannot tell that apart from a failure. Progress is in the history.
    void runRegisteredJob(job.key, req.user!.userId);

    res.status(202).json({
      success: true,
      message: `${job.name} started. Its result will appear in the run history.`,
    });
  }),
);

export { router as scheduledJobsRouter };
