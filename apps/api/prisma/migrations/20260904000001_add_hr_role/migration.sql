-- The HR officer role.
--
-- Only adds the value. Postgres will not let a new enum label be *used* in the
-- transaction that adds it, and Prisma runs each migration in one, so anything
-- that assigns HR to a row has to be a later statement — the seed does it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR' BEFORE 'GUARD';
