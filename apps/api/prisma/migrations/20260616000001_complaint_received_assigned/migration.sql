-- Complaint assignment and status workflow
-- Renames assignedTo → assignedToId and adds phone to User

-- 1. Add phone field to User (optional, for assigned-to contact display)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- 2. Drop existing FK constraint on the old column name
ALTER TABLE "ClientComplaint"
  DROP CONSTRAINT IF EXISTS "ClientComplaint_assignedTo_fkey";

-- 3. Rename the column
ALTER TABLE "ClientComplaint"
  RENAME COLUMN "assignedTo" TO "assignedToId";

-- 4. Re-add FK constraint under the new column name
ALTER TABLE "ClientComplaint"
  ADD CONSTRAINT "ClientComplaint_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
