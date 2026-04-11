import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import type { PayslipJobData } from '../QueueService';

export const payslipWorker = new Worker<PayslipJobData>(
  'payslip',
  async (job) => {
    console.log(`💰 Payslip job received: ${job.id} — guard ${job.data.guardId}`);
    // Full implementation in Sprint 3 (payroll story)
  },
  { connection: redisConnection },
);

payslipWorker.on('failed', (job, err) => {
  console.error(
    `Payslip job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
    err.message,
  );
});
