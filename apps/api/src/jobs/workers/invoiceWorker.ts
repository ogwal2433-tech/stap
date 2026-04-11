import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis';
import type { InvoiceJobData } from '../QueueService';

export const invoiceWorker = new Worker<InvoiceJobData>(
  'invoice-gen',
  async (job) => {
    console.log(`🧾 Invoice job received: ${job.id} — client ${job.data.clientId}`);
    // Full implementation in Sprint 2 (billing story)
  },
  { connection: redisConnection },
);

invoiceWorker.on('failed', (job, err) => {
  console.error(
    `Invoice job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
    err.message,
  );
});
