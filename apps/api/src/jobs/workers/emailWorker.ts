import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import type { EmailJobData } from '../QueueService';

export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job) => {
    console.log(`📧 Email job received: ${job.id} — ${job.data.to}`);
    // Full implementation in Sprint 2 (notifications story)
  },
  { connection: redisConnection },
);

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});
