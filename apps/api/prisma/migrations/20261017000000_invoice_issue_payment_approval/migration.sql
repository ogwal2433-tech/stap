-- MD request: month-end invoice runs (raised by the assistant manager, issued by
-- the MD), locked run invoices, and approval of manually recorded payments.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "runBatchId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issuedBy" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;

-- The daily 6AM auto-invoice job is switched off: the assistant manager raises
-- the month-end run and the MD issues it. isActive is only set on create by
-- syncJobRegistry, so the existing row has to be paused here too.
UPDATE "ScheduledJob" SET "isActive" = false WHERE "key" = 'invoice.generate.auto';

-- Permissions. ON CONFLICT leaves keys that already exist.
INSERT INTO "Permission" ("id", "key", "name", "module", "createdAt")
VALUES
  (gen_random_uuid()::text, 'invoices.run',     'Invoices Run',     'invoices', NOW()),
  (gen_random_uuid()::text, 'invoices.issue',   'Invoices Issue',   'invoices', NOW()),
  (gen_random_uuid()::text, 'payments.approve', 'Payments Approve', 'payments', NOW())
ON CONFLICT ("key") DO NOTHING;

-- Run: the assistant manager (Harold) and Finance. Issue and payment approval:
-- the MD's final sign-off, with Director matching requisition authority.
INSERT INTO "RolePermission" ("id", "role", "permissionId", "grantedAt")
SELECT gen_random_uuid()::text, r."name", p."id", NOW()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE (r."name" IN ('ASSISTANT_MANAGER', 'ACCOUNTS_OFFICER') AND p."key" = 'invoices.run')
   OR (r."name" IN ('MD', 'DIRECTOR') AND p."key" IN ('invoices.issue', 'payments.approve'))
ON CONFLICT ("role", "permissionId") DO NOTHING;
