-- ── Client: tax & compliance fields ───────────────────────────────────────────
ALTER TABLE "Client" ADD COLUMN "tin"           TEXT;
ALTER TABLE "Client" ADD COLUMN "vatRegistered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "vatRate"       DOUBLE PRECISION;

-- ── Client: CRM / lead-tracking fields ────────────────────────────────────────
-- leadStatus defaults to CONVERTED for all existing clients (they are customers)
ALTER TABLE "Client" ADD COLUMN "leadSource" TEXT;
ALTER TABLE "Client" ADD COLUMN "referredBy" TEXT;
ALTER TABLE "Client" ADD COLUMN "leadStatus" TEXT NOT NULL DEFAULT 'CONVERTED';

-- ── Contract: security deployment detail fields ────────────────────────────────
ALTER TABLE "Contract" ADD COLUMN "weaponsAllocation" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "shiftPattern"      TEXT;
