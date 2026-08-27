-- Splits MARKETING into MARKETING_HEAD (all leads, targets, bids) and SALES
-- (own leads only).
--
-- Adding the values is a migration of its own because Postgres refuses to use a
-- new enum value in the transaction that created it. The UPDATE that moves
-- existing holders is the next migration.
--
-- MARKETING itself stays in the type. Removing a value means recreating the
-- type and rewriting every column that references it, which is not worth doing
-- to retire a name nothing assigns any more.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MARKETING_HEAD';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES';
