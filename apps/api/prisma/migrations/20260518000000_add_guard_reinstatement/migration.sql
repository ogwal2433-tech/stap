-- AlterEnum
ALTER TYPE "DisciplinaryType" ADD VALUE 'REINSTATEMENT';

-- AlterTable
ALTER TABLE "Guard"
  ADD COLUMN "reinstatedCount"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "lastReinstatedAt" TIMESTAMP(3),
  ADD COLUMN "lastReinstatedBy" TEXT;
