-- Fields for the integration credentials that used to live only in .env.
--
-- All additive with defaults, so the 21 rows already in the table keep working
-- unchanged: they are plain text, not required, and render as text inputs.

ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "isEncrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "inputType"   TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "isRequired"  BOOLEAN NOT NULL DEFAULT false;
