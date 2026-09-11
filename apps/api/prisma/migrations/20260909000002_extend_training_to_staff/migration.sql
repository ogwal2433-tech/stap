-- Training sessions can now be for office staff as well as guards, and the
-- person running one is a facilitator rather than necessarily a TRAINER.

-- ── Attendees may be a guard or a member of staff ────────────────────────────
ALTER TABLE "TrainingAttendee" ADD COLUMN "userId" TEXT;
ALTER TABLE "TrainingAttendee" ALTER COLUMN "guardId" DROP NOT NULL;

-- NULLs do not collide in Postgres, so this only constrains staff rows.
CREATE UNIQUE INDEX "TrainingAttendee_trainingSessionId_userId_key"
  ON "TrainingAttendee" ("trainingSessionId", "userId");

ALTER TABLE "TrainingAttendee"
  ADD CONSTRAINT "TrainingAttendee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of the two. Prisma cannot express this, and without it a row with
-- both set — or neither — renders as an attendee nobody can account for.
ALTER TABLE "TrainingAttendee"
  ADD CONSTRAINT "TrainingAttendee_one_subject"
  CHECK (("guardId" IS NOT NULL) <> ("userId" IS NOT NULL));

-- ── Facilitator replaces trainer ─────────────────────────────────────────────
ALTER TABLE "TrainingSession" ADD COLUMN "targetGroup"       TEXT NOT NULL DEFAULT 'GUARDS';
ALTER TABLE "TrainingSession" ADD COLUMN "facilitatorType"   TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "TrainingSession" ADD COLUMN "facilitatorName"   TEXT;
ALTER TABLE "TrainingSession" ADD COLUMN "facilitatorUserId" TEXT;

-- Carry the existing trainer across before the column goes. Writing the name
-- as well as the id means a session still says who ran it after that account is
-- deactivated. Generated SQL would have dropped the column outright; this
-- database happens to hold no sessions, but a deployed one may.
UPDATE "TrainingSession" ts
   SET "facilitatorUserId" = ts."trainerId",
       "facilitatorName"   = u."name",
       "facilitatorType"   = 'INTERNAL'
  FROM "User" u
 WHERE u."id" = ts."trainerId";

ALTER TABLE "TrainingSession" DROP CONSTRAINT "TrainingSession_trainerId_fkey";
ALTER TABLE "TrainingSession" DROP COLUMN "trainerId";

ALTER TABLE "TrainingSession"
  ADD CONSTRAINT "TrainingSession_facilitatorUserId_fkey"
  FOREIGN KEY ("facilitatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
