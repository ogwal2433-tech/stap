-- Leave can now belong to a member of office staff as well as a guard.

ALTER TABLE "LeaveRequest" ADD COLUMN "userId" TEXT;
ALTER TABLE "LeaveRequest" ALTER COLUMN "guardId" DROP NOT NULL;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one subject. Prisma cannot express this, and without it a request
-- belonging to nobody would sit in the approval queue with no name against it.
ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_one_subject"
  CHECK (("guardId" IS NOT NULL) <> ("userId" IS NOT NULL));

-- Both lists are read by subject and status, and the overlap check queries a
-- date range for one subject at a time.
CREATE INDEX "LeaveRequest_userId_status_idx"  ON "LeaveRequest" ("userId", "status");
CREATE INDEX "LeaveRequest_guardId_status_idx" ON "LeaveRequest" ("guardId", "status");
