CREATE TABLE IF NOT EXISTS "GuardAllowance" (
  "id"            TEXT PRIMARY KEY,
  "guardId"       TEXT NOT NULL REFERENCES "Guard"("id") ON DELETE RESTRICT,
  "type"          TEXT NOT NULL,
  "amount"        INTEGER NOT NULL,
  "description"   TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "payrollRunId"  TEXT REFERENCES "PayrollRun"("id"),
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
