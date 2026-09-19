-- Security log: the request a refusal was for, the caller's role, and what it
-- lacked. Nullable, so existing audit rows are untouched. The two indexes serve
-- the Security Log (action + date) and the audit page's newest-first listing,
-- which until now scanned the whole table.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "method" TEXT,
ADD COLUMN     "path" TEXT,
ADD COLUMN     "required" TEXT,
ADD COLUMN     "role" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

