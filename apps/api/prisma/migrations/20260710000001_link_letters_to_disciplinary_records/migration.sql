-- AlterTable
ALTER TABLE "GeneratedLetter" ADD COLUMN "disciplinaryRecordId" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedLetter_disciplinaryRecordId_idx" ON "GeneratedLetter"("disciplinaryRecordId");
