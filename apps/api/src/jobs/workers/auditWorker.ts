import { Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redisConnection } from '../../lib/redis';
import prisma from '../../db/prisma';
import type { AuditJobData } from '../QueueService';

export const auditWorker = new Worker<AuditJobData>(
  'audit',
  async (job) => {
    const { userId, action, entity, entityId, oldValue, newValue, ipAddress, userAgent } =
      job.data;

    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId,
        oldValue: (oldValue as Prisma.InputJsonObject) ?? undefined,
        newValue: (newValue as Prisma.InputJsonObject) ?? undefined,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  },
  { connection: redisConnection },
);

auditWorker.on('failed', (job, err) => {
  console.error(`Audit job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});
