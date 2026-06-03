-- Step 1: Add new integer quantity columns
ALTER TABLE "Site"
  ADD COLUMN IF NOT EXISTS "armedGuardsRequired" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "firearmsRequired"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "batonRequired"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "otherWeaponsNotes"   TEXT;

-- Step 2: Preserve existing boolean data (true → 1)
UPDATE "Site" SET "armedGuardsRequired" = 1 WHERE "requiresArmedGuards" = true;
UPDATE "Site" SET "firearmsRequired"    = 1 WHERE "requiresFirearms"    = true;
UPDATE "Site" SET "batonRequired"       = 1 WHERE "requiresWeapons"     = true;

-- Step 3: Drop old boolean columns
ALTER TABLE "Site"
  DROP COLUMN IF EXISTS "requiresArmedGuards",
  DROP COLUMN IF EXISTS "requiresFirearms",
  DROP COLUMN IF EXISTS "requiresWeapons";
