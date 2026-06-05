-- Add replacement tracking fields to Deployment
ALTER TABLE "Deployment"
  ADD COLUMN IF NOT EXISTS "isReplacement"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "replacementForId"  TEXT,
  ADD COLUMN IF NOT EXISTS "replacementReason" TEXT;

-- Add replacement tracking fields to AttendanceRecord
ALTER TABLE "AttendanceRecord"
  ADD COLUMN IF NOT EXISTS "replacedByGuardId" TEXT,
  ADD COLUMN IF NOT EXISTS "replacementNote"   TEXT;
