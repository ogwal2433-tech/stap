-- Add new fields required by client spec
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "date"   TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "amount" INTEGER       NOT NULL DEFAULT 0;

-- Back-fill amount from estimatedTotal
UPDATE "Requisition" SET "amount" = "estimatedTotal" WHERE "amount" = 0;

-- Back-fill particulars from description so NOT NULL constraint works
UPDATE "Requisition" SET "particulars" = "description" WHERE "particulars" IS NULL;

-- Null out old plain-string approver fields before renaming + adding FK constraints
UPDATE "Requisition" SET "hrApprovedBy"  = NULL;
UPDATE "Requisition" SET "dirApprovedBy" = NULL;

-- Rename raisedBy → requestedById (drop old FK, rename column, add new FK)
ALTER TABLE "Requisition" DROP CONSTRAINT IF EXISTS "Requisition_raisedBy_fkey";
ALTER TABLE "Requisition" RENAME COLUMN "raisedBy" TO "requestedById";
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rename hrApprovedBy → hrApprovedById + add FK
ALTER TABLE "Requisition" RENAME COLUMN "hrApprovedBy" TO "hrApprovedById";
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_hrApprovedById_fkey"
  FOREIGN KEY ("hrApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename dirApprovedBy → directorApprovedById + add FK
ALTER TABLE "Requisition" RENAME COLUMN "dirApprovedBy" TO "directorApprovedById";
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_directorApprovedById_fkey"
  FOREIGN KEY ("directorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename dirApprovedAt → directorApprovedAt
ALTER TABLE "Requisition" RENAME COLUMN "dirApprovedAt" TO "directorApprovedAt";

-- Rename the assignedToUser relation in DB (constraint rename — Prisma uses model names for constraints)
ALTER TABLE "Requisition" DROP CONSTRAINT IF EXISTS "Requisition_assignedToId_fkey";
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
