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
import { contractService } from './services/contractService';
import { invoiceService } from './services/invoiceService';
import { reportService } from './services/reportService';
import { inventoryService } from './services/inventoryService';
import { guardService } from './services/guardService';
import { runInvoiceEmailJob } from './jobs/invoiceCron';
import { errorLogger } from './services/errorLogger';

console.log(`⚙️  STAP Worker process started (PID ${process.pid})`);

const workers = [auditWorker, emailWorker, smsWorker, invoiceWorker, payslipWorker, disburseWorker];

// ── Scheduled jobs ─────────────────────────────────────────────────────────────
// Runs only here (a single PM2 instance), not in stap-api (which runs 2
// cluster instances) — otherwise every job below would fire twice daily.

// Refresh contract statuses daily at 06:00 EAT (Africa/Kampala)
cron.schedule('0 6 * * *', () => contractService.runStatusRefresh(), {
  timezone: 'Africa/Kampala',
});

// Auto-generate invoices for active contracts on their billing day
cron.schedule('0 6 * * *', () => invoiceService.generateAutoInvoices(), {
  timezone: 'Africa/Kampala',
});

// Email due/overdue invoices that haven't been sent yet — daily at 07:00 EAT
cron.schedule('0 7 * * *', () => runInvoiceEmailJob(), {
  timezone: 'Africa/Kampala',
});
// Also run on startup to catch any missed sends
runInvoiceEmailJob().catch(console.error);

// Initialise any persisted scheduled reports on startup
reportService.initScheduledReports();

// Daily low stock check at 07:00 EAT
cron.schedule('0 7 * * *', () => inventoryService.runLowStockCheck(), {
  timezone: 'Africa/Kampala',
});

// Daily probation status check at 06:00 EAT
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ Running probation check...');
  await guardService.runProbationCheck();
}, { timezone: 'Africa/Kampala' });

// Annual salary increment check — runs every day at 07:00 EAT
// Applies UGX 20,000 (year 1) or UGX 10,000 (subsequent years) on each guard's contract anniversary
cron.schedule('0 7 * * *', async () => {
  console.log('⏰ Running annual salary increments...');
  try {
    await guardService.runSalaryIncrements();
  } catch (err) {
    console.error('❌ Salary increment cron failed:', err);
  }
}, { timezone: 'Africa/Kampala' });

async function gracefulShutdown(signal: string) {
  console.log(`\n⚙️  Worker received ${signal}. Shutting down cleanly...`);

  await Promise.all([
    ...workers.map((w) => w.close()),
    ...Object.values(queues).map((q) => q.close()),
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
