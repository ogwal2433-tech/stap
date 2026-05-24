-- Convert ShiftType enum columns to text (preserving existing values)
ALTER TABLE "DeploymentHistory" ALTER COLUMN "shiftType" TYPE TEXT;
ALTER TABLE "Deployment" ALTER COLUMN "shiftType" TYPE TEXT;

-- Drop the old ShiftType enum
DROP TYPE IF EXISTS "ShiftType";

-- Create the new ShiftType model table
CREATE TABLE "ShiftType" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "code"          TEXT NOT NULL,
    "startTime"     TEXT,
    "endTime"       TEXT,
    "durationHours" DOUBLE PRECISION,
    "displayOrder"  INTEGER NOT NULL DEFAULT 0,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "isOvertime"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftType_name_key" ON "ShiftType"("name");
CREATE UNIQUE INDEX "ShiftType_code_key" ON "ShiftType"("code");

-- Add new fields to Deployment
ALTER TABLE "Deployment" ADD COLUMN "deploymentType"        TEXT NOT NULL DEFAULT 'UNARMED';
ALTER TABLE "Deployment" ADD COLUMN "weaponsDetails"        TEXT;
ALTER TABLE "Deployment" ADD COLUMN "overtimeHours"         DOUBLE PRECISION;
ALTER TABLE "Deployment" ADD COLUMN "overtimeReason"        TEXT;
ALTER TABLE "Deployment" ADD COLUMN "copiedFromDate"        TIMESTAMP(3);
ALTER TABLE "Deployment" ADD COLUMN "replacementForGuardId" TEXT;
