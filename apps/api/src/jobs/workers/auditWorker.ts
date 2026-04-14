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

    // Verify the userId actually exists — the user could have been deleted between
    // the request and the job being processed, or the ID could be stale after a
    // DB re-seed.  Fall back to null rather than letting the FK constraint kill
    // the whole audit job and losing the record entirely.
    let resolvedUserId: string | null = null;
    if (userId) {
      const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (exists) {
        resolvedUserId = userId;
      } else {
        console.warn(`[audit] userId "${userId}" not found in users table — recording audit without user link`);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: resolvedUserId,
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
