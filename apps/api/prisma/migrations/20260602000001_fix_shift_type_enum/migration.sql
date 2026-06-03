-- Fix ShiftType: the lookup table "ShiftType" shadowed the intended PostgreSQL enum.
-- Rename the table (and its auto-created composite type) to free up the name,
-- then create the proper enum and cast the text columns to it.

-- Step 1: Rename the lookup table to free up the "ShiftType" type name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ShiftType' AND schemaname = 'public') THEN
    ALTER TABLE "ShiftType" RENAME TO "ShiftTypeConfig";
  END IF;
END $$;

-- Step 2: Create the ShiftType enum (now the name is free)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShiftType' AND typtype = 'e') THEN
    CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT', 'FULL_24');
  END IF;
END $$;

-- Step 3a: Normalise legacy short-code values in Deployment before casting.
-- Production data contains single-char codes ('D', 'N', 'F') from an earlier
-- schema version. Map them to canonical enum values; fall back to 'DAY' for
-- anything else so the NOT NULL constraint is preserved.
UPDATE "Deployment" SET "shiftType" = 'DAY'     WHERE "shiftType" = 'D';
UPDATE "Deployment" SET "shiftType" = 'NIGHT'   WHERE "shiftType" = 'N';
UPDATE "Deployment" SET "shiftType" = 'FULL_24' WHERE "shiftType" IN ('F', '24', 'FULL24');
UPDATE "Deployment" SET "shiftType" = 'DAY'
  WHERE "shiftType" NOT IN ('DAY', 'NIGHT', 'FULL_24');

-- Step 3b: Alter Deployment.shiftType from text to enum
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Deployment' AND column_name = 'shiftType') <> 'ShiftType' THEN
    ALTER TABLE "Deployment"
      ALTER COLUMN "shiftType" TYPE "ShiftType" USING "shiftType"::"ShiftType";
  END IF;
END $$;

-- Step 4a: Normalise legacy short-code values in DeploymentHistory
UPDATE "DeploymentHistory" SET "shiftType" = 'DAY'     WHERE "shiftType" = 'D';
UPDATE "DeploymentHistory" SET "shiftType" = 'NIGHT'   WHERE "shiftType" = 'N';
UPDATE "DeploymentHistory" SET "shiftType" = 'FULL_24' WHERE "shiftType" IN ('F', '24', 'FULL24');
UPDATE "DeploymentHistory" SET "shiftType" = 'DAY'
  WHERE "shiftType" NOT IN ('DAY', 'NIGHT', 'FULL_24');

-- Step 4b: Alter DeploymentHistory.shiftType from text to enum
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'DeploymentHistory' AND column_name = 'shiftType') <> 'ShiftType' THEN
    ALTER TABLE "DeploymentHistory"
      ALTER COLUMN "shiftType" TYPE "ShiftType" USING "shiftType"::"ShiftType";
  END IF;
END $$;

-- Step 5a: Normalise Site.defaultShiftType (nullable — set unrecognised values to NULL)
UPDATE "Site" SET "defaultShiftType" = 'DAY'     WHERE "defaultShiftType" = 'D';
UPDATE "Site" SET "defaultShiftType" = 'NIGHT'   WHERE "defaultShiftType" = 'N';
UPDATE "Site" SET "defaultShiftType" = 'FULL_24' WHERE "defaultShiftType" IN ('F', '24', 'FULL24');
UPDATE "Site" SET "defaultShiftType" = NULL
  WHERE "defaultShiftType" IS NOT NULL
    AND "defaultShiftType" NOT IN ('DAY', 'NIGHT', 'FULL_24');

-- Step 5b: Alter Site.defaultShiftType from text to enum (nullable)
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Site' AND column_name = 'defaultShiftType') <> 'ShiftType' THEN
    ALTER TABLE "Site"
      ALTER COLUMN "defaultShiftType" TYPE "ShiftType" USING "defaultShiftType"::"ShiftType";
  END IF;
END $$;
