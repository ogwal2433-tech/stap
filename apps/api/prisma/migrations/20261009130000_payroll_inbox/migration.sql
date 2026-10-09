-- Payroll inbox: persisted shares of a run's files plus recipients with
-- read receipts. All new tables; existing rows are untouched. Deleting a run
-- removes its shares (draft-only operation); recipients can never be detached
-- from their account while a share points at them.
-- CreateTable
CREATE TABLE "PayrollShare" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "note" TEXT,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollShare_payrollRunId_idx" ON "PayrollShare"("payrollRunId");

-- AddForeignKey
ALTER TABLE "PayrollShare" ADD CONSTRAINT "PayrollShare_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PayrollShareRecipient" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollShareRecipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollShareRecipient_share_user_key" UNIQUE ("shareId", "userId")
);

-- CreateIndex
CREATE INDEX "PayrollShareRecipient_userId_idx" ON "PayrollShareRecipient"("userId");

-- AddForeignKey
ALTER TABLE "PayrollShareRecipient" ADD CONSTRAINT "PayrollShareRecipient_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "PayrollShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollShareRecipient" ADD CONSTRAINT "PayrollShareRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
