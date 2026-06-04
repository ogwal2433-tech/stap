-- Add condition breakdown columns to InventoryItem.
-- Four buckets that sum to stockQuantity at all times.
ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "quantityNew"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantityGood"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantityFair"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantityDamaged" INTEGER NOT NULL DEFAULT 0;

-- Seed: assume all existing stock is in GOOD condition.
-- Stock managers can adjust via the condition editor once live.
UPDATE "InventoryItem"
SET "quantityGood" = "stockQuantity"
WHERE "stockQuantity" > 0;
