-- Guns gain an ownership (which decides the licence fee), the rounds issued at
-- registration, and a GUN-001 style id. Calibre goes.

ALTER TABLE "Gun" ADD COLUMN IF NOT EXISTS "systemId"      TEXT;
ALTER TABLE "Gun" ADD COLUMN IF NOT EXISTS "ownership"     TEXT NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "Gun" ADD COLUMN IF NOT EXISTS "licenceFee"    INTEGER;
ALTER TABLE "Gun" ADD COLUMN IF NOT EXISTS "licencePeriod" TEXT;
ALTER TABLE "Gun" ADD COLUMN IF NOT EXISTS "totalBullets"  INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Gun_systemId_key" ON "Gun"("systemId");

-- Existing rows predate the field, so seed the rounds they already hold as the
-- number they were issued with. Without this every existing gun reads as
-- "12 of 0", which looks like a data fault rather than a missing history.
UPDATE "Gun" SET "totalBullets" = "currentBullets" WHERE "totalBullets" = 0;

-- Everything already held is company-owned; that is the default the column took.
UPDATE "Gun"
SET "licenceFee"    = 160000,
    "licencePeriod" = 'YEARLY'
WHERE "ownership" = 'COMPANY' AND "licenceFee" IS NULL;

-- Number the existing guns, oldest first, so they are not left blank.
WITH numbered AS (
  SELECT "id", 'GUN-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::text, 3, '0') AS sid
  FROM "Gun" WHERE "systemId" IS NULL
)
UPDATE "Gun" g SET "systemId" = n.sid FROM numbered n WHERE g."id" = n."id";

-- Calibre is replaced by ownership, but two rows carry a real value. Fold it
-- into the notes before dropping the column rather than discarding what someone
-- recorded about a physical weapon.
UPDATE "Gun"
SET "notes" = TRIM(BOTH E'\n' FROM COALESCE("notes" || E'\n', '') || 'Calibre (recorded before this field was retired): ' || "calibre")
WHERE "calibre" IS NOT NULL AND "calibre" <> '';

ALTER TABLE "Gun" DROP COLUMN IF EXISTS "calibre";
