import dotenv from 'dotenv';
dotenv.config();

// worker imports follow
/**
 * Worker-only entry point.
 * Starts all BullMQ workers and the scheduled cron jobs, without starting the
 * Express HTTP server. This process is managed separately by PM2 (see
 * ecosystem.config.js) and — unlike stap-api — always runs as a single
 * instance, so cron jobs registered here fire exactly once per schedule.
 */
import './bootstrap';
import cron from 'node-cron';
import { auditWorker } from './jobs/workers/auditWorker';
import { emailWorker } from './jobs/workers/emailWorker';
import { smsWorker } from './jobs/workers/smsWorker';
import { invoiceWorker } from './jobs/workers/invoiceWorker';
import { payslipWorker } from './jobs/workers/payslipWorker';
import { disburseWorker } from './jobs/workers/disburseWorker';
import { queues } from './jobs/queues';
import { redisConnection } from './lib/redis';
import { reportService } from './services/reportService';
import { runInvoiceEmailJob } from './jobs/invoiceCron';
import { errorLogger } from './services/errorLogger';
import { JOB_REGISTRY, JOB_TIMEZONE } from './constants/jobRegistry';
import { runRegisteredJob, syncJobRegistry } from './lib/jobRunner';
import { settingsService } from './services/settingsService';
import { startReportTitleCacheSync, stopReportTitleCacheSync } from './lib/reportTitleCacheBus';
import { startCompanyBrandingCacheSync, stopCompanyBrandingCacheSync } from './lib/companyBrandingCacheBus';
import { clearCompanyBrandingCache } from './services/companyBrandingService';

console.log(`⚙️  STAP Worker process started (PID ${process.pid})`);
startReportTitleCacheSync(() => settingsService.clearReportTitleCache());
startCompanyBrandingCacheSync(clearCompanyBrandingCache);

const workers = [auditWorker, emailWorker, smsWorker, invoiceWorker, payslipWorker, disburseWorker];

// ── Scheduled jobs ─────────────────────────────────────────────────────────────
// Runs only here (a single PM2 instance), not in stap-api (which runs 2
// cluster instances) — otherwise every job below would fire twice daily.

// Registered from JOB_REGISTRY rather than written out one by one. The
// registry holds each job's cron expression and its function, so the schedule
// the Scheduled Jobs page shows an operator is the schedule that is actually
// registered here — the two cannot drift.
//
// Every run goes through runRegisteredJob, which records it and swallows the
// error: one failing job must not take the worker down and stop the rest.
for (const def of JOB_REGISTRY) {
  cron.schedule(def.cronExpr, () => runRegisteredJob(def.key, 'cron'), {
    timezone: JOB_TIMEZONE,
  });
}

// Make sure a row exists for each job before anything reports on it, then catch
// any invoice emails missed while the worker was down.
syncJobRegistry()
  .then((n) => console.log(`⏰ ${n} scheduled jobs registered`))
  .then(() => runInvoiceEmailJob())
  .catch((err) => console.error('❌ Job registry sync failed:', err));

// Initialise any persisted scheduled reports on startup
reportService.initScheduledReports();

async function gracefulShutdown(signal: string) {
  console.log(`\n⚙️  Worker received ${signal}. Shutting down cleanly...`);

  await Promise.all([
    ...workers.map((w) => w.close()),
    ...Object.values(queues).map((q) => q.close()),
    stopReportTitleCacheSync(),
    stopCompanyBrandingCacheSync(),
  ]);

  await redisConnection.quit();

  console.log('⚙️  Worker process shut down cleanly');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: any) => {
  void errorLogger.log({
    message:   reason?.message ?? String(reason),
    stack:     reason?.stack,
    severity:  'CRITICAL',
    category:  'SYSTEM',
    errorCode: 'UNHANDLED_REJECTION',
  });
});

process.on('uncaughtException', (err: Error) => {
  void errorLogger.log({
    message:   err.message,
    stack:     err.stack,
    severity:  'CRITICAL',
    category:  'SYSTEM',
    errorCode: 'UNCAUGHT_EXCEPTION',
  });
  // Give the logger a moment to persist before crashing — an uncaught
  // exception leaves the process in an undefined state, so we must exit.
  setTimeout(() => process.exit(1), 1000);
});
