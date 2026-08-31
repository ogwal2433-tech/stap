-- The Control Room's end-of-shift handover report.
--
-- The seven sections are JSONB: they are written and read as one document and
-- never queried across, and the rows are free text on the paper form, so child
-- tables with foreign keys would reject what a controller legitimately needs to
-- write at 6am — a site named in prose, a guard with no record yet.

CREATE TABLE IF NOT EXISTS "ShiftHandoverReport" (
  "id"                     TEXT NOT NULL,
  "systemId"               TEXT,
  "date"                   TIMESTAMP(3) NOT NULL,
  "shift"                  TEXT NOT NULL,
  "controllerId"           TEXT NOT NULL,
  "timeFrom"               TEXT NOT NULL,
  "timeTo"                 TEXT NOT NULL,
  "deploymentRows"         JSONB NOT NULL,
  "deploymentRemarks"      TEXT,
  "incidents"              JSONB NOT NULL,
  "supervisionRows"        JSONB NOT NULL,
  "clientComms"            JSONB NOT NULL,
  "gunsDeployed"           JSONB NOT NULL,
  "disciplineIssues"       JSONB NOT NULL,
  "totalIncidents"         INTEGER NOT NULL DEFAULT 0,
  "totalClientCalls"       INTEGER NOT NULL DEFAULT 0,
  "totalAbsentees"         INTEGER NOT NULL DEFAULT 0,
  "totalReplacements"      INTEGER NOT NULL DEFAULT 0,
  "majorIssue"             TEXT,
  "outgoingControllerName" TEXT,
  "outgoingTime"           TEXT,
  "incomingControllerName" TEXT,
  "incomingTime"           TEXT,
  "incomingControllerId"   TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'DRAFT',
  "acknowledgedAt"         TIMESTAMP(3),
  "acknowledgedById"       TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftHandoverReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftHandoverReport_systemId_key"
  ON "ShiftHandoverReport"("systemId");
CREATE INDEX IF NOT EXISTS "ShiftHandoverReport_date_shift_idx"
  ON "ShiftHandoverReport"("date", "shift");
CREATE INDEX IF NOT EXISTS "ShiftHandoverReport_status_idx"
  ON "ShiftHandoverReport"("status");

-- Restrict on the controller: a submitted handover is an operational record and
-- must not disappear because the account that wrote it was removed. The two
-- optional references null out instead, since they are sign-off metadata.
DO $$ BEGIN
  ALTER TABLE "ShiftHandoverReport"
    ADD CONSTRAINT "ShiftHandoverReport_controllerId_fkey"
    FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ShiftHandoverReport"
    ADD CONSTRAINT "ShiftHandoverReport_incomingControllerId_fkey"
    FOREIGN KEY ("incomingControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ShiftHandoverReport"
    ADD CONSTRAINT "ShiftHandoverReport_acknowledgedById_fkey"
    FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
