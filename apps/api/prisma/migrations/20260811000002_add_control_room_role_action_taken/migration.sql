-- AlterEnum
-- Positioned explicitly: a bare ADD VALUE appends, which would leave the
-- database enum ordered differently from schema.prisma.
ALTER TYPE "Role" ADD VALUE 'CONTROL_ROOM' BEFORE 'MARKETING';

-- AlterTable
ALTER TABLE "ClientComplaint" ADD COLUMN     "actionTaken" TEXT,
ADD COLUMN     "actionTakenAt" TIMESTAMP(3),
ADD COLUMN     "actionTakenById" TEXT;

-- AddForeignKey
ALTER TABLE "ClientComplaint" ADD CONSTRAINT "ClientComplaint_actionTakenById_fkey" FOREIGN KEY ("actionTakenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

