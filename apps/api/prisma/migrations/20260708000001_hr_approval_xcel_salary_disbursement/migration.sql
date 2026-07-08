-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "disbursedAt" TIMESTAMP(3),
ADD COLUMN     "disbursedBy" TEXT,
ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hrApprovedAt" TIMESTAMP(3),
ADD COLUMN     "hrApprovedBy" TEXT,
ADD COLUMN     "hrNotes" TEXT,
ADD COLUMN     "successCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "disbursementFailureReason" TEXT,
ADD COLUMN     "hrAdjustedAmount" INTEGER,
ADD COLUMN     "hrFlagReason" TEXT,
ADD COLUMN     "hrFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookPayload" JSONB,
ADD COLUMN     "webhookReceivedAt" TIMESTAMP(3),
ADD COLUMN     "xcelDlCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_disbursementRef_key" ON "Payslip"("disbursementRef");
