-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN     "dispatchStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "totalDispatched" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FundDispatch" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "recipientName" TEXT,
    "recipientAccount" TEXT,
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "dispatchedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundDispatch_requisitionId_dispatchDate_idx" ON "FundDispatch"("requisitionId", "dispatchDate");

-- AddForeignKey
ALTER TABLE "FundDispatch" ADD CONSTRAINT "FundDispatch_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundDispatch" ADD CONSTRAINT "FundDispatch_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

