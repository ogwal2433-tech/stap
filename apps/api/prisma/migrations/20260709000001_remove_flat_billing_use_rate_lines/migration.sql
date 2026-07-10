-- AlterTable: ContractGuardRate — free-text guardType, add stored monthlyTotal
ALTER TABLE "ContractGuardRate" ALTER COLUMN "guardType" DROP DEFAULT;
ALTER TABLE "ContractGuardRate" ADD COLUMN "monthlyTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Contract — add totalMonthlyValue ahead of dropping billingPerGuard
ALTER TABLE "Contract" ADD COLUMN "totalMonthlyValue" INTEGER NOT NULL DEFAULT 0;

-- Data migration: preserve existing flat billingPerGuard as a single rate line
-- per contract, before the column is dropped.
INSERT INTO "ContractGuardRate" ("id", "contractId", "guardType", "guardsCount", "ratePerGuard", "monthlyTotal", "createdAt", "updatedAt")
SELECT
  'cgr_migrated_' || c.id,
  c.id,
  'Guard',
  c."guardsRequired",
  c."billingPerGuard",
  c."guardsRequired" * c."billingPerGuard",
  now(),
  now()
FROM "Contract" c
WHERE c."billingPerGuard" > 0
  AND NOT EXISTS (SELECT 1 FROM "ContractGuardRate" cgr WHERE cgr."contractId" = c.id);

-- Backfill totalMonthlyValue from whatever rate lines now exist per contract
UPDATE "Contract" c
SET "totalMonthlyValue" = COALESCE((
  SELECT SUM(cgr."monthlyTotal") FROM "ContractGuardRate" cgr WHERE cgr."contractId" = c.id
), 0);

-- Backfill guardsRequired to match the rate-line sum too, in case it had drifted
UPDATE "Contract" c
SET "guardsRequired" = COALESCE((
  SELECT SUM(cgr."guardsCount") FROM "ContractGuardRate" cgr WHERE cgr."contractId" = c.id
), c."guardsRequired");

-- AlterTable: drop the flat billing column now that data is preserved
ALTER TABLE "Contract" DROP COLUMN "billingPerGuard";
