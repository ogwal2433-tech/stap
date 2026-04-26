-- AlterTable: Add vetting form fields to Guard model
ALTER TABLE "Guard"
  ADD COLUMN IF NOT EXISTS "gender"                  TEXT,
  ADD COLUMN IF NOT EXISTS "tribe"                   TEXT,
  ADD COLUMN IF NOT EXISTS "placeOfBirth"            TEXT,
  ADD COLUMN IF NOT EXISTS "educationLevel"          TEXT,
  ADD COLUMN IF NOT EXISTS "registeredNames"         TEXT,
  ADD COLUMN IF NOT EXISTS "maritalStatus"           TEXT,
  ADD COLUMN IF NOT EXISTS "spouseName"              TEXT,
  ADD COLUMN IF NOT EXISTS "spouseWorkplace"         TEXT,
  ADD COLUMN IF NOT EXISTS "spouseTelephone"         TEXT,
  ADD COLUMN IF NOT EXISTS "preferredPaymentContact" TEXT,
  ADD COLUMN IF NOT EXISTS "village"                 TEXT,
  ADD COLUMN IF NOT EXISTS "parish"                  TEXT,
  ADD COLUMN IF NOT EXISTS "subCounty"               TEXT,
  ADD COLUMN IF NOT EXISTS "county"                  TEXT,
  ADD COLUMN IF NOT EXISTS "district"                TEXT,
  ADD COLUMN IF NOT EXISTS "lc1Zone"                 TEXT,
  ADD COLUMN IF NOT EXISTS "lcOfficialName"          TEXT,
  ADD COLUMN IF NOT EXISTS "lcOfficialPosition"      TEXT,
  ADD COLUMN IF NOT EXISTS "lcOfficialPhone"         TEXT,
  ADD COLUMN IF NOT EXISTS "nssfNumber"              TEXT,
  ADD COLUMN IF NOT EXISTS "tinNumber"               TEXT,
  ADD COLUMN IF NOT EXISTS "previousEmployer"        TEXT,
  ADD COLUMN IF NOT EXISTS "previousPosition"        TEXT,
  ADD COLUMN IF NOT EXISTS "talentsExperience"       TEXT,
  ADD COLUMN IF NOT EXISTS "fatherName"              TEXT,
  ADD COLUMN IF NOT EXISTS "fatherResidence"         TEXT,
  ADD COLUMN IF NOT EXISTS "fatherVillage"           TEXT,
  ADD COLUMN IF NOT EXISTS "fatherParish"            TEXT,
  ADD COLUMN IF NOT EXISTS "fatherSubCounty"         TEXT,
  ADD COLUMN IF NOT EXISTS "fatherCounty"            TEXT,
  ADD COLUMN IF NOT EXISTS "fatherDistrict"          TEXT,
  ADD COLUMN IF NOT EXISTS "fatherNationality"       TEXT,
  ADD COLUMN IF NOT EXISTS "fatherOccupation"        TEXT,
  ADD COLUMN IF NOT EXISTS "fatherPhone"             TEXT,
  ADD COLUMN IF NOT EXISTS "motherName"              TEXT,
  ADD COLUMN IF NOT EXISTS "motherResidence"         TEXT,
  ADD COLUMN IF NOT EXISTS "motherVillage"           TEXT,
  ADD COLUMN IF NOT EXISTS "motherParish"            TEXT,
  ADD COLUMN IF NOT EXISTS "motherSubCounty"         TEXT,
  ADD COLUMN IF NOT EXISTS "motherCounty"            TEXT,
  ADD COLUMN IF NOT EXISTS "motherDistrict"          TEXT,
  ADD COLUMN IF NOT EXISTS "motherNationality"       TEXT,
  ADD COLUMN IF NOT EXISTS "motherOccupation"        TEXT,
  ADD COLUMN IF NOT EXISTS "motherPhone"             TEXT,
  ADD COLUMN IF NOT EXISTS "numberOfDependents"      INTEGER,
  ADD COLUMN IF NOT EXISTS "hasDisability"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "disabilityDetails"       TEXT,
  ADD COLUMN IF NOT EXISTS "takesAlcohol"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasAllergies"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allergyDetails"          TEXT;

-- CreateTable: GuardRelative
CREATE TABLE IF NOT EXISTS "GuardRelative" (
  "id"               TEXT NOT NULL,
  "guardId"          TEXT NOT NULL,
  "relativeName"     TEXT NOT NULL,
  "phone"            TEXT,
  "relationship"     TEXT,
  "occupation"       TEXT,
  "placeOfResidence" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuardRelative_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuardAssociate
CREATE TABLE IF NOT EXISTS "GuardAssociate" (
  "id"            TEXT NOT NULL,
  "guardId"       TEXT NOT NULL,
  "associateName" TEXT NOT NULL,
  "placeOfWork"   TEXT,
  "workDetails"   TEXT,
  "residence"     TEXT,
  "phone"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuardAssociate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: GuardRelative → Guard
ALTER TABLE "GuardRelative"
  ADD CONSTRAINT "GuardRelative_guardId_fkey"
  FOREIGN KEY ("guardId") REFERENCES "Guard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: GuardAssociate → Guard
ALTER TABLE "GuardAssociate"
  ADD CONSTRAINT "GuardAssociate_guardId_fkey"
  FOREIGN KEY ("guardId") REFERENCES "Guard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
