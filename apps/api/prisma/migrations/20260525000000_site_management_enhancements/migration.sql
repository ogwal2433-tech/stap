-- AlterTable: add new columns to Site
ALTER TABLE "Site" ADD COLUMN "siteType"            TEXT NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "Site" ADD COLUMN "requiresFirearms"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "requiresArmedGuards" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "requiresWeapons"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "equipmentDetails"    TEXT;
ALTER TABLE "Site" ADD COLUMN "allowedShiftTypes"   TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Site" ADD COLUMN "defaultShiftType"    TEXT;

-- CreateTable: SiteEquipmentItem
CREATE TABLE "SiteEquipmentItem" (
    "id"        TEXT NOT NULL,
    "siteId"    TEXT NOT NULL,
    "itemName"  TEXT NOT NULL,
    "quantity"  INTEGER NOT NULL DEFAULT 1,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEquipmentItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SiteEquipmentItem" ADD CONSTRAINT "SiteEquipmentItem_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
