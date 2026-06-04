-- Add subject field to ClientComplaint (existing rows get a placeholder)
ALTER TABLE "ClientComplaint" ADD COLUMN IF NOT EXISTS "subject" TEXT;
UPDATE "ClientComplaint" SET "subject" = COALESCE(SPLIT_PART("description", '.', 1), "description") WHERE "subject" IS NULL;
ALTER TABLE "ClientComplaint" ALTER COLUMN "subject" SET NOT NULL;
