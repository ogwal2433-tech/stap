-- AlterTable: Add contractType column to Guard model
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "contractType" TEXT NOT NULL DEFAULT 'PERMANENT';
