import { PrismaClient } from '@prisma/client';

const base = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

/**
 * Soft delete.
 *
 * Client, Guard, User, Contract and Site rows carry deletedAt, and every read of
 * those models skips deleted rows — unless the query names deletedAt itself.
 * That is how the Deleted records page and restore reach them:
 *
 *   where: { deletedAt: { not: null } }   only deleted rows
 *   where: { deletedAt: undefined }       every row, deleted or not
 *
 * Done here rather than query by query: there are more than two hundred reads
 * of these models, and a filter that must be remembered at each one is a filter
 * that gets forgotten. Writes are untouched, so updating a deleted row by id —
 * which is what restore does — still works.
 *
 * Relations are not filtered on purpose. An invoice still names the client it
 * was issued to after that client is deleted; keeping that history is the point
 * of not removing the row. Relation *lists* under a live parent (a client's
 * sites) are filtered where they are included.
 *
 * Raw SQL bypasses this. The system-id generators rely on that, so a deleted
 * record's id is never issued again.
 */
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set(['Client', 'Guard', 'User', 'Contract', 'Site']);

const READS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
]);

const extended = base.$extends({
  name: 'softDelete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model && SOFT_DELETE_MODELS.has(model) && READS.has(operation)) {
          const a = (args ?? {}) as { where?: Record<string, unknown> };
          if (!a.where || !('deletedAt' in a.where)) {
            a.where = { ...(a.where ?? {}), deletedAt: null };
          }
          return query(a as typeof args);
        }
        return query(args);
      },
    },
  },
});

// Typed as the plain client: the extension changes what reads return, not the
// API, and keeping the type stable avoids a ripple through every file using it.
const prisma = extended as unknown as PrismaClient;

process.on('SIGINT', async () => {
  await base.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await base.$disconnect();
  process.exit(0);
});

export default prisma;
