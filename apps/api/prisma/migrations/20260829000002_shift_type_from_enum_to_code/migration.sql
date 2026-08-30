-- Deployment.shiftType and DeploymentHistory.shiftType become the shift-type
-- code rather than a fixed enum.
--
-- Shift types are configurable from Settings (ShiftTypeConfig), but these two
-- columns were an enum of DAY | NIGHT | FULL_24. Anything an administrator
-- added could not be deployed — OVERTIME ships in the seed and was already
-- unstorable, failing with "Invalid value for argument `shiftType`".
--
-- The cast is lossless: every existing value is one of the three enum labels
-- and becomes the identical string.
--
-- Site.defaultShiftType is converted here too. An earlier revision of this file
-- named only the two Deployment columns, on the assumption that Site was still
-- TEXT — true on a database where 20260602000001 was baselined rather than run,
-- false on one where it actually executed and converted Site as well. There the
-- DROP below failed with "cannot drop type ShiftType because other objects
-- depend on it", leaving the migration half-finished and every later migration
-- blocked behind P3009.
--
-- So rather than name the columns, find them. The loop converts whatever still
-- uses the type, which makes this safe to re-run against a database in either
-- state — including one where the two ALTERs above already went through before
-- the DROP failed.

DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT table_schema, table_name, column_name, column_default
    FROM information_schema.columns
    WHERE udt_name = 'ShiftType' AND table_schema = 'public'
  LOOP
    -- A default is itself typed, so it has to go before the column can change.
    -- No column in this schema declares one; this is here so an old database
    -- that picked one up somewhere does not fail the ALTER.
    IF col.column_default IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
                     col.table_schema, col.table_name, col.column_name);
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE TEXT USING %I::text',
                   col.table_schema, col.table_name, col.column_name, col.column_name);
  END LOOP;
END $$;

DROP TYPE IF EXISTS "ShiftType";
