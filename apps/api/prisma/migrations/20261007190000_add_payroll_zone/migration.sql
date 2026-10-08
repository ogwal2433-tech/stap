-- Payroll becomes zone-based: a run belongs to one Zone (null = legacy
-- company-wide/grouped history, which is kept and displayed as-is).
-- No unique index on (month, year, zoneId): legacy rows already hold several
-- runs per period, so the one-run-per-zone rule is enforced in calculateRun.

ALTER TABLE "PayrollRun" ADD COLUMN "zoneId" TEXT;

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PayrollRun_zoneId_idx" ON "PayrollRun"("zoneId");
