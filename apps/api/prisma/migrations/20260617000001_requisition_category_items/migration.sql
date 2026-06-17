-- Create RequisitionCategoryItem table
CREATE TABLE "RequisitionCategoryItem" (
  "id"            TEXT          NOT NULL,
  "requisitionId" TEXT          NOT NULL,
  "category"      TEXT          NOT NULL,
  "quantity"      INTEGER       NOT NULL DEFAULT 1,
  "unit"          TEXT,
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RequisitionCategoryItem_pkey" PRIMARY KEY ("id")
);

-- Cascade-delete items when requisition is deleted
ALTER TABLE "RequisitionCategoryItem"
  ADD CONSTRAINT "RequisitionCategoryItem_requisitionId_fkey"
  FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing flat categories[] → one row per category (quantity = 1)
INSERT INTO "RequisitionCategoryItem" ("id", "requisitionId", "category", "quantity", "createdAt")
SELECT
  gen_random_uuid()::text,
  r.id,
  unnest(r.categories),
  1,
  NOW()
FROM "Requisition" r
WHERE r.categories IS NOT NULL
  AND array_length(r.categories, 1) > 0;

-- Drop the now-superseded flat array column
ALTER TABLE "Requisition" DROP COLUMN IF EXISTS "categories";
