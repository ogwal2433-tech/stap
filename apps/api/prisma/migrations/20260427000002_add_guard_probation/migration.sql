-- AlterTable: Add probation tracking fields to Guard
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "probationStatus" TEXT NOT NULL DEFAULT 'ON_PROBATION';
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "probationEndDate" TIMESTAMP(3);
