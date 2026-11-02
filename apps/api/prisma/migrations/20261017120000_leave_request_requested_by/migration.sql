-- The person who filed a leave request learns the outcome even when the
-- leave belongs to someone else (HR filing a guard's leave).

ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "requestedBy" TEXT;
