-- AlterTable: Add rank column to Guard model
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "rank" TEXT NOT NULL DEFAULT 'GUARD';
