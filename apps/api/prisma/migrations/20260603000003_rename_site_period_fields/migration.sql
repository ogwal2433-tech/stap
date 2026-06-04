-- Rename specialDuty* columns to unified sitePeriod* names.
-- These fields now apply to both TEMPORARY and SPECIAL_DUTIES sites.
-- Uses conditional logic so this is safe whether the DB was set up via
-- db push (already has sitePeriod* names) or via migrate (has old names).

DO $$
DECLARE
  already_renamed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Site'
      AND column_name = 'sitePeriodStart'
  ) INTO already_renamed;

  IF already_renamed THEN
    -- DB was set up via db push — just drop the old-named columns if they exist
    ALTER TABLE "Site" DROP COLUMN IF EXISTS "specialDutyStartDate";
    ALTER TABLE "Site" DROP COLUMN IF EXISTS "specialDutyEndDate";
    ALTER TABLE "Site" DROP COLUMN IF EXISTS "specialDutyNotes";
  ELSE
    -- Standard migration path — rename the columns
    ALTER TABLE "Site" RENAME COLUMN "specialDutyStartDate" TO "sitePeriodStart";
    ALTER TABLE "Site" RENAME COLUMN "specialDutyEndDate"   TO "sitePeriodEnd";
    ALTER TABLE "Site" RENAME COLUMN "specialDutyNotes"     TO "sitePeriodNotes";
  END IF;
END $$;
