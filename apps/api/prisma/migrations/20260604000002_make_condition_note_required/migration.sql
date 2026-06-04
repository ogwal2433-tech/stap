-- Fill existing NULL condition notes before making the column non-nullable.
-- Pre-existing records that never had a note get a placeholder so the
-- constraint never fails on old data.
UPDATE "InventoryTransaction"
SET "conditionNote" = 'Not recorded — pre-existing record'
WHERE "conditionNote" IS NULL OR "conditionNote" = '';

-- Set the column default to empty string (Zod validation blocks empty values
-- at the API layer, so this default is only a safety net for direct DB writes).
ALTER TABLE "InventoryTransaction" ALTER COLUMN "conditionNote" SET DEFAULT '';

-- Enforce NOT NULL now that all rows have a value.
ALTER TABLE "InventoryTransaction" ALTER COLUMN "conditionNote" SET NOT NULL;
