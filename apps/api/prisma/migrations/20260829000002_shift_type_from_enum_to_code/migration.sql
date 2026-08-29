-- Deployment.shiftType and DeploymentHistory.shiftType become the shift-type
-- code rather than a fixed enum.
--
-- Shift types are configurable from Settings (ShiftTypeConfig), but these two
-- columns were an enum of DAY | NIGHT | FULL_24. Anything an administrator
-- added could not be deployed — OVERTIME ships in the seed and was already
-- unstorable, failing with "Invalid value for argument `shiftType`".
--
-- The cast is lossless: every existing value is one of the three enum labels
-- and becomes the identical string. Site.defaultShiftType was already TEXT, so
-- this makes the three agree.

ALTER TABLE "Deployment"        ALTER COLUMN "shiftType" TYPE TEXT USING "shiftType"::text;
ALTER TABLE "DeploymentHistory" ALTER COLUMN "shiftType" TYPE TEXT USING "shiftType"::text;

DROP TYPE IF EXISTS "ShiftType";
