-- AlterTable: Add document verification + vetting + training tracking to Applicant
ALTER TABLE "Applicant"
  ADD COLUMN IF NOT EXISTS "relativesIdVerified"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "relativesIdVerifiedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nationalIdVerified"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nationalIdVerifiedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "academicDocsVerified"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "academicDocsVerifiedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "applicationLetterUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "applicationLetterPath"     TEXT,
  ADD COLUMN IF NOT EXISTS "contractSigned"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "contractSignedAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "vettingFormUploaded"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vettingFormPath"           TEXT,
  ADD COLUMN IF NOT EXISTS "trainingStartedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trainingCompletedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trainingSessionId"         TEXT,
  ADD COLUMN IF NOT EXISTS "siteAssignedAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "shoeDeductionCreated"      BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey: Applicant → TrainingSession
ALTER TABLE "Applicant"
  ADD CONSTRAINT IF NOT EXISTS "Applicant_trainingSessionId_fkey"
  FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add issuedFree + isShoeItem to InventoryItem
ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "issuedFree"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isShoeItem"  BOOLEAN NOT NULL DEFAULT false;
