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

-- Step 3: Alter Deployment.shiftType from text to enum
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Deployment' AND column_name = 'shiftType') <> 'ShiftType' THEN
    ALTER TABLE "Deployment"
      ALTER COLUMN "shiftType" TYPE "ShiftType" USING "shiftType"::"ShiftType";
  END IF;
END $$;

-- Step 4: Alter DeploymentHistory.shiftType from text to enum
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'DeploymentHistory' AND column_name = 'shiftType') <> 'ShiftType' THEN
    ALTER TABLE "DeploymentHistory"
      ALTER COLUMN "shiftType" TYPE "ShiftType" USING "shiftType"::"ShiftType";
  END IF;
END $$;

-- Step 5: Alter Site.defaultShiftType from text to enum (nullable)
DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'Site' AND column_name = 'defaultShiftType') <> 'ShiftType' THEN
    ALTER TABLE "Site"
      ALTER COLUMN "defaultShiftType" TYPE "ShiftType" USING "defaultShiftType"::"ShiftType";
  END IF;
END $$;
