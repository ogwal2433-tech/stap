-- Payroll runs become per payroll group: uniqueness moves from
-- (month, year) to (month, year, payrollGroupId).

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN "payrollGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollGroupId_fkey" FOREIGN KEY ("payrollGroupId") REFERENCES "PayrollGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: one run per group per period. Legacy rows keep a null group,
-- and Postgres treats nulls as distinct, so they never collide with each
-- other or with grouped runs.
CREATE UNIQUE INDEX "PayrollRun_month_year_payrollGroupId_key" ON "PayrollRun"("month", "year", "payrollGroupId");
