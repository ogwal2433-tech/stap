-- Add onLeave to Guard
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "onLeave" BOOLEAN NOT NULL DEFAULT false;

-- Add zone/type fields to Site
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "siteType" TEXT NOT NULL DEFAULT 'COMMERCIAL';
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "defaultShiftType" "ShiftType";
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "requiresArmedGuards" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "requiresFirearms" BOOLEAN NOT NULL DEFAULT false;

-- Create Zone table
CREATE TABLE IF NOT EXISTS "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supervisorId" TEXT,
    "alternateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Zone_name_key" ON "Zone"("name");

-- Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Zone_supervisorId_fkey') THEN
    ALTER TABLE "Zone" ADD CONSTRAINT "Zone_supervisorId_fkey"
      FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Zone_alternateId_fkey') THEN
    ALTER TABLE "Zone" ADD CONSTRAINT "Zone_alternateId_fkey"
      FOREIGN KEY ("alternateId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Site_zoneId_fkey') THEN
    ALTER TABLE "Site" ADD CONSTRAINT "Site_zoneId_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
