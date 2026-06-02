-- Add onLeave to Guard
ALTER TABLE "Guard" ADD COLUMN "onLeave" BOOLEAN NOT NULL DEFAULT false;

-- Add zone/type fields to Site
ALTER TABLE "Site" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "Site" ADD COLUMN "siteType" TEXT NOT NULL DEFAULT 'COMMERCIAL';
ALTER TABLE "Site" ADD COLUMN "defaultShiftType" "ShiftType";
ALTER TABLE "Site" ADD COLUMN "requiresArmedGuards" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "requiresFirearms" BOOLEAN NOT NULL DEFAULT false;

-- Create Zone table
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supervisorId" TEXT,
    "alternateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- Foreign keys
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_supervisorId_fkey"
    FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_alternateId_fkey"
    FOREIGN KEY ("alternateId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
