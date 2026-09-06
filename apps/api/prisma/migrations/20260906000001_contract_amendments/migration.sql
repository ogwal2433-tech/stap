-- Amendment history for contracts.
--
-- Updating a contract deletes and recreates its guard rates, so the terms a
-- client originally signed were not recoverable. Each amendment now stores both
-- sides of the change, and the contract itself is never deleted — only amended.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "amendmentCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ContractAmendment" (
  "id"             TEXT NOT NULL,
  "systemId"       TEXT,
  "contractId"     TEXT NOT NULL,
  "amendedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amendedById"    TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "effectiveDate"  TIMESTAMP(3) NOT NULL,
  "previousValues" JSONB NOT NULL,
  "newValues"      JSONB NOT NULL,
  "changeSummary"  TEXT,
  "amendmentType"  TEXT NOT NULL DEFAULT 'GENERAL',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- Numbered per contract, so AMD-0001 exists once per contract rather than once
-- across the whole system.
CREATE UNIQUE INDEX IF NOT EXISTS "ContractAmendment_contractId_systemId_key"
  ON "ContractAmendment"("contractId", "systemId");
CREATE INDEX IF NOT EXISTS "ContractAmendment_contractId_amendedAt_idx"
  ON "ContractAmendment"("contractId", "amendedAt");

-- Cascade from the contract: an amendment has no meaning without it.
DO $$ BEGIN
  ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Restrict on the author: who amended a contract is part of the record and must
-- not disappear because an account was removed.
DO $$ BEGIN
  ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_amendedById_fkey"
    FOREIGN KEY ("amendedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
