-- AlterTable: Make nationalId optional and add NID pending flag to Guard model
ALTER TABLE "Guard" ALTER COLUMN "nationalId" DROP NOT NULL;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "isIncompleteNID" BOOLEAN NOT NULL DEFAULT false;
