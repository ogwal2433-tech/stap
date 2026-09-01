-- Operator-facing registry of the background jobs the system runs on a
-- schedule, plus a log of each execution.
--
-- The table records state, never behaviour: which function a key runs is fixed
-- in jobRegistry.ts, so a row inserted by hand cannot make the system execute
-- anything it does not already know how to do.

CREATE TABLE IF NOT EXISTS "ScheduledJob" (
  "id"              TEXT NOT NULL,
  "key"             TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "cronExpr"        TEXT NOT NULL,
  "cronHuman"       TEXT NOT NULL,
  "category"        TEXT NOT NULL DEFAULT 'general',
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"       TIMESTAMP(3),
  "lastRunStatus"   TEXT,
  "lastRunDuration" INTEGER,
  "lastRunError"    TEXT,
  "nextRunAt"       TIMESTAMP(3),
  "totalRuns"       INTEGER NOT NULL DEFAULT 0,
  "totalFailed"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledJob_key_key" ON "ScheduledJob"("key");
CREATE INDEX IF NOT EXISTS "ScheduledJob_category_idx" ON "ScheduledJob"("category");
CREATE INDEX IF NOT EXISTS "ScheduledJob_lastRunStatus_idx" ON "ScheduledJob"("lastRunStatus");

CREATE TABLE IF NOT EXISTS "JobRunLog" (
  "id"          TEXT NOT NULL,
  "jobId"       TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),
  "status"      TEXT NOT NULL,
  "duration"    INTEGER,
  "result"      JSONB,
  "error"       TEXT,
  "triggeredBy" TEXT,
  CONSTRAINT "JobRunLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobRunLog_jobId_startedAt_idx" ON "JobRunLog"("jobId", "startedAt");

-- Cascade on the job: removing a job takes its own history with it.
DO $$ BEGIN
  ALTER TABLE "JobRunLog" ADD CONSTRAINT "JobRunLog_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ScheduledJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull on the trigger: deleting a user must not erase the record that a job
-- ran, only who started it.
DO $$ BEGIN
  ALTER TABLE "JobRunLog" ADD CONSTRAINT "JobRunLog_triggeredBy_fkey"
    FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
