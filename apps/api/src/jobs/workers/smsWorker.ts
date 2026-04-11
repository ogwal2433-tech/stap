import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import type { SmsJobData } from '../QueueService';

export const smsWorker = new Worker<SmsJobData>(
  'sms',
  async (job) => {
    console.log(`📱 SMS job received: ${job.id} — ${job.data.to}`);
    // Full implementation in Sprint 2 (notifications story)
  },
  { connection: redisConnection },
);

smsWorker.on('failed', (job, err) => {
  console.error(`SMS job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});
