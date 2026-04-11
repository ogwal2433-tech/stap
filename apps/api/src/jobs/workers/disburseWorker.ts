import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import type { DisburseJobData } from '../QueueService';

export const disburseWorker = new Worker<DisburseJobData>(
  'disburse',
  async (job) => {
    console.log(`🏦 Disburse job received: ${job.id} — run ${job.data.payrollRunId}`);
    // Full implementation in Sprint 3 (payroll story)
  },
  { connection: redisConnection },
);

disburseWorker.on('failed', (job, err) => {
  console.error(
    `Disburse job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
    err.message,
  );
});
