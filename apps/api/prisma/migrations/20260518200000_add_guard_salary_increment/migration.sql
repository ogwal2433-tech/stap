-- AlterTable
ALTER TABLE "Guard" ADD COLUMN "incrementCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guard" ADD COLUMN "lastIncrementDate" TIMESTAMP(3);
