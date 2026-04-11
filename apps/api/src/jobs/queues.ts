import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
};

export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions,
});

export const smsQueue = new Queue('sms', {
  connection: redisConnection,
  defaultJobOptions,
});

export const auditQueue = new Queue('audit', {
  connection: redisConnection,
  defaultJobOptions,
});

export const invoiceQueue = new Queue('invoice-gen', {
  connection: redisConnection,
  defaultJobOptions,
});

export const payslipQueue = new Queue('payslip', {
  connection: redisConnection,
  defaultJobOptions,
});

export const disburseQueue = new Queue('disburse', {
  connection: redisConnection,
  defaultJobOptions,
});

export const queues = {
  email: emailQueue,
  sms: smsQueue,
  audit: auditQueue,
  invoice: invoiceQueue,
  payslip: payslipQueue,
  disburse: disburseQueue,
};
