-- Retire the "Regular" site type.
--
-- siteType is a plain TEXT column, not a Postgres enum, so there is no type to
-- alter — only the stored values and the column default need correcting.
--
-- REGULAR ("ongoing, no end date") and PERMANENT ("long-term contracted site")
-- were already handled identically by siteService: both clear the period dates
-- that TEMPORARY and SPECIAL_DUTIES require. PERMANENT is therefore the
-- behaviour-preserving target for retired REGULAR rows.
--
-- COMMERCIAL is swept up in the same pass: it was never one of the four
-- documented site types, and leaked in as the column default set by
-- 20260602000000_add_zones. Rows carrying it render no badge and cannot be
-- saved from the site form.

UPDATE "Site"
SET "siteType" = 'PERMANENT'
WHERE "siteType" IS NULL
   OR upper("siteType") IN ('REGULAR', 'COMMERCIAL');

-- Stop new rows from inheriting a value the application does not offer.
ALTER TABLE "Site" ALTER COLUMN "siteType" SET DEFAULT 'PERMANENT';
