import dotenv from 'dotenv';
dotenv.config();

// worker imports follow
/**
 * Worker-only entry point.
 * Starts all BullMQ workers without starting the Express HTTP server.
 * This process is managed separately by PM2 (see ecosystem.config.js).
 */
import './bootstrap';
import { auditWorker } from './jobs/workers/auditWorker';
import { emailWorker } from './jobs/workers/emailWorker';
import { smsWorker } from './jobs/workers/smsWorker';
import { invoiceWorker } from './jobs/workers/invoiceWorker';
import { payslipWorker } from './jobs/workers/payslipWorker';
import { disburseWorker } from './jobs/workers/disburseWorker';
import { queues } from './jobs/queues';
import { redisConnection } from './lib/redis';

console.log(`⚙️  STAP Worker process started (PID ${process.pid})`);

const workers = [auditWorker, emailWorker, smsWorker, invoiceWorker, payslipWorker, disburseWorker];

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
