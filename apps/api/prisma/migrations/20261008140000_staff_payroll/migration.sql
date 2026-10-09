-- Staff payroll: pay fields on User, StaffDeduction table, staff-capable
-- Payslip (guardId nullable, new userId) and PayrollRun (runType, totalStaff).
-- All additive; existing guard payroll rows are untouched: runType defaults
-- to GUARD, totalStaff to 0, and every existing payslip keeps its guardId.
ALTER TABLE "User" ADD COLUMN "salaryRate" INTEGER;
ALTER TABLE "User" ADD COLUMN "bankName" TEXT;
ALTER TABLE "User" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "preferredPaymentContact" TEXT;
ALTER TABLE "User" ADD COLUMN "mobileNetwork" TEXT;
ALTER TABLE "User" ADD COLUMN "momoAccountName" TEXT;
ALTER TABLE "User" ADD COLUMN "nssfNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "tinNumber" TEXT;

-- CreateTable
CREATE TABLE "StaffDeduction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payrollRunId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffDeduction_userId_idx" ON "StaffDeduction"("userId");

-- AddForeignKey
ALTER TABLE "StaffDeduction" ADD CONSTRAINT "StaffDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDeduction" ADD CONSTRAINT "StaffDeduction_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: payslips can now belong to a staff user instead of a guard
ALTER TABLE "Payslip" ALTER COLUMN "guardId" DROP NOT NULL;
ALTER TABLE "Payslip" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one payee per payslip: a guard or a staff user, never neither
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payee_check" CHECK ("guardId" IS NOT NULL OR "userId" IS NOT NULL);

-- AlterTable: staff-only runs
ALTER TABLE "PayrollRun" ADD COLUMN "runType" TEXT NOT NULL DEFAULT 'GUARD';
ALTER TABLE "PayrollRun" ADD COLUMN "totalStaff" INTEGER NOT NULL DEFAULT 0;

-- Seed catalogue rows for statutory staff deductions; skipped when present.
INSERT INTO "DeductionType" ("id", "name", "code", "description", "isAutomatic", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT 'seed-deduction-nssf', 'NSSF', 'NSSF', 'National Social Security Fund contribution', false, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "DeductionType" WHERE "code" = 'NSSF');
INSERT INTO "DeductionType" ("id", "name", "code", "description", "isAutomatic", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT 'seed-deduction-paye', 'PAYE', 'PAYE', 'Pay As You Earn income tax', false, 11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "DeductionType" WHERE "code" = 'PAYE');
