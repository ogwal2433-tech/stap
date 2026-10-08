-- Payroll groups are removed: payroll moves to a zone-based model.
-- Historical runs stay as history; they lose the group label by design
-- (the user approved full removal, keeping PayrollRun/Payslip rows).

DROP INDEX IF EXISTS "PayrollRun_month_year_payrollGroupId_key";

ALTER TABLE "PayrollRun" DROP CONSTRAINT IF EXISTS "PayrollRun_payrollGroupId_fkey";
ALTER TABLE "PayrollRun" DROP COLUMN IF EXISTS "payrollGroupId";

-- Join rows cascade with their parent; drop the join table first.
DROP TABLE IF EXISTS "GuardPayrollGroupMember";
DROP TABLE IF EXISTS "PayrollGroup";
