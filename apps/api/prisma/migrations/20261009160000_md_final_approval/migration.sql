-- MD final approval: catalogue row, Managing Director assignment, run stamps.
-- The MD role holds nobody until the assignment below moves Micheal
-- Kabushenga (today a Director) into it. Existing runs are untouched: the
-- new stamp columns start null and every live run predates the MD step.
INSERT INTO "Role" ("id", "name", "label", "description", "colour", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT 'role-md', 'MD', 'Managing Director', 'Final authority. Gives the last approval on payroll and requisitions, then Finance disburses.', '#4B0082', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'MD');

UPDATE "User" SET "role" = 'MD' WHERE id = 'cmufik43c00dp6p7yxdxcs2ty' AND "role" = 'DIRECTOR';

ALTER TABLE "PayrollRun" ADD COLUMN "mdApprovedBy" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "mdApprovedAt" TIMESTAMP(3);
