-- Payslip keeps the guard name when a deserted guard is permanently deleted
-- (purge): the payslip row stays for finance, de-linked from the removed guard.
ALTER TABLE "Payslip" ADD COLUMN "guardNameSnapshot" TEXT;
