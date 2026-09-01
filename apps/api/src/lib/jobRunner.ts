import parser from 'cron-parser';
import prisma from '../db/prisma';
import { JOB_REGISTRY, JOB_TIMEZONE, jobDefinition } from '../constants/jobRegistry';
import { errorLogger } from '../services/errorLogger';

/**
 * Wraps a scheduled job so every run is recorded — start, outcome, duration and
 * whatever the job returned — without each job having to remember to do it.
 */

/**
 * When the cron expression next fires, in the timezone the schedule is
 * registered with. Getting the zone wrong would show a Director a next-run time
 * three hours out from when the work actually happens.
 */
export function nextRunTime(cronExpr: string): Date | null {
  try {
    return parser.parseExpression(cronExpr, { tz: JOB_TIMEZONE }).next().toDate();
  } catch {
    // An unparseable expression is worth surfacing as "unknown" rather than as
    // a guess — a wrong time here reads as fact.
    return null;
  }
}

/** Ensures a ScheduledJob row exists for every registry entry. */
export async function syncJobRegistry(): Promise<number> {
  for (const def of JOB_REGISTRY) {
    // isActive is set only on create: it is an operator's decision after that,
    // and a deploy must not silently resume a job someone paused.
    await prisma.scheduledJob.upsert({
      where:  { key: def.key },
      update: {
        name:        def.name,
        description: def.description,
        cronExpr:    def.cronExpr,
        cronHuman:   def.cronHuman,
        category:    def.category,
        nextRunAt:   nextRunTime(def.cronExpr),
      },
      create: {
        key:         def.key,
        name:        def.name,
        description: def.description,
        cronExpr:    def.cronExpr,
        cronHuman:   def.cronHuman,
        category:    def.category,
        isActive:    def.isActive,
        nextRunAt:   nextRunTime(def.cronExpr),
      },
    });
  }
  return JOB_REGISTRY.length;
}

/**
 * Runs one job and records it.
 *
 * `triggeredBy` is 'cron' for the scheduler, or a user id for Run Now. A paused
 * job is skipped when the scheduler calls, but still runs when a person asks —
 * pressing Run Now on a paused job is an explicit instruction, and refusing it
 * would leave no way to test a job before resuming it.
 */
export async function runJob(
  jobKey:      string,
  triggeredBy: string,
  jobFn:       () => Promise<unknown>,
): Promise<void> {
  const job = await prisma.scheduledJob.findUnique({ where: { key: jobKey } });
  if (!job) {
    console.warn(`[Jobs] No ScheduledJob row for "${jobKey}" — run not recorded.`);
    return;
  }

  const manual = triggeredBy !== 'cron';

  if (!job.isActive && !manual) {
    await prisma.jobRunLog.create({
      data: { jobId: job.id, status: 'SKIPPED', finishedAt: new Date(), duration: 0 },
    });
    console.log(`[Jobs] ${jobKey} is paused — skipped.`);
    return;
  }

  const log = await prisma.jobRunLog.create({
    data: {
      jobId:       job.id,
      status:      'RUNNING',
      triggeredBy: manual ? triggeredBy : null,
    },
  });

  await prisma.scheduledJob.update({
    where: { id: job.id },
    data:  { lastRunAt: new Date(), lastRunStatus: 'RUNNING' },
  });

  const started = Date.now();
  console.log(`[Jobs] ▶ ${job.name}`);

  try {
    const result   = await jobFn();
    const duration = Date.now() - started;

    await prisma.jobRunLog.update({
      where: { id: log.id },
      data:  {
        finishedAt: new Date(),
        status:     'SUCCESS',
        duration,
        // Only a JSON object is worth keeping; a job returning void or a bare
        // value would otherwise store "null" and read as a missing result.
        result:     result && typeof result === 'object' ? (result as never) : undefined,
      },
    });

    await prisma.scheduledJob.update({
      where: { id: job.id },
      data:  {
        lastRunStatus:   'SUCCESS',
        lastRunDuration: duration,
        lastRunError:    null,
        nextRunAt:       nextRunTime(job.cronExpr),
        totalRuns:       { increment: 1 },
      },
    });

    console.log(`[Jobs] ✅ ${job.name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - started;
    const message  = (err as Error)?.message ?? 'Unknown error';

    await prisma.jobRunLog.update({
      where: { id: log.id },
      data:  { finishedAt: new Date(), status: 'FAILED', duration, error: message },
    });

    await prisma.scheduledJob.update({
      where: { id: job.id },
      data:  {
        lastRunStatus:   'FAILED',
        lastRunDuration: duration,
        lastRunError:    message,
        nextRunAt:       nextRunTime(job.cronExpr),
        totalRuns:       { increment: 1 },
        totalFailed:     { increment: 1 },
      },
    });

    // Logged, not rethrown: a failing job must not take the worker process down
    // with it and stop every other schedule.
    await errorLogger.log({
      message,
      stack:     (err as Error)?.stack,
      severity:  'ERROR',
      category:  'SYSTEM',
      errorCode: 'SCHEDULED_JOB_FAILED',
      context:   { jobKey, triggeredBy },
    }).catch(() => undefined);

    console.error(`[Jobs] ❌ ${job.name}: ${message}`);
  }
}

/** Runs a registry job by key — used by both the scheduler and Run Now. */
export async function runRegisteredJob(key: string, triggeredBy: string): Promise<void> {
  const def = jobDefinition(key);
  if (!def) {
    console.warn(`[Jobs] "${key}" is not in the registry — nothing to run.`);
    return;
  }
  await runJob(key, triggeredBy, def.run);
}
