-- Payroll reject action: a DRAFT or APPROVED run can be rejected with a
-- reason. The run row is kept as the trail (status 'REJECTED'); its payslips
-- are deleted and its deductions rewound by the service, so the zone and
-- period become re-calculable. These columns stamp who rejected, when and why.
ALTER TABLE "PayrollRun" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "PayrollRun" ADD COLUMN "rejectReason" TEXT;
