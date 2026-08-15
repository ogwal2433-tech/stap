-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplaintStatus" ADD VALUE 'SENT';
ALTER TYPE "ComplaintStatus" ADD VALUE 'ACKNOWLEDGED';

-- AlterTable
ALTER TABLE "ClientComplaint" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT,
ADD COLUMN     "clientResponse" TEXT,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'INBOUND',
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentById" TEXT;

-- CreateIndex
CREATE INDEX "ClientComplaint_clientId_direction_status_idx" ON "ClientComplaint"("clientId", "direction", "status");

-- AddForeignKey
ALTER TABLE "ClientComplaint" ADD CONSTRAINT "ClientComplaint_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientComplaint" ADD CONSTRAINT "ClientComplaint_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

