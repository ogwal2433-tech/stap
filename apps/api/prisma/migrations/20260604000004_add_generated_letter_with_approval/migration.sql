CREATE TABLE "GeneratedLetter" (
    "id"             TEXT NOT NULL,
    "subjectType"    TEXT NOT NULL,
    "subjectId"      TEXT NOT NULL,
    "subjectName"    TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "body"           TEXT NOT NULL,
    "letterType"     TEXT NOT NULL DEFAULT 'GENERAL',
    "generatedBy"    TEXT NOT NULL,
    "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy"     TEXT,
    "approvedAt"     TIMESTAMP(3),
    "approvalNotes"  TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedLetter_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GeneratedLetter"
    ADD CONSTRAINT "GeneratedLetter_generatedBy_fkey"
        FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GeneratedLetter"
    ADD CONSTRAINT "GeneratedLetter_approvedBy_fkey"
        FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
