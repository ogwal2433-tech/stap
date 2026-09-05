-- A guard may be identified by their own national ID, by a relative's, or by
-- another document such as a student card — not everyone holds a NIN.

ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "idType"           TEXT;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "relativeIdName"   TEXT;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "relativeIdNumber" TEXT;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "otherDocType"     TEXT;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "otherDocNumber"   TEXT;

-- relativeIdNumber is deliberately left without a unique index: siblings on the
-- payroll are identified by the same parent's card, and a unique constraint
-- would let whoever was registered first lock the others out.

-- Everyone already on file with a NIN is identified by their own. Without this
-- every existing guard reads as "no document provided" and the statistics say
-- the company has undocumented staff it does not have.
UPDATE "Guard" SET "idType" = 'OWN_ID'
WHERE "nationalId" IS NOT NULL AND "idType" IS NULL;
