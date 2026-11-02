-- Links a system-written cashbook entry to the money event it came from, so a
-- retried webhook or a re-run backfill can never post the same movement twice.
-- All existing rows are manual (sourceRef null), and Postgres keeps nulls out
-- of the unique index, so this is safe on a populated table too.
ALTER TABLE "CashbookEntry" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CashbookEntry_sourceRef_key"
  ON "CashbookEntry"("sourceRef");
