-- Deserted employment status for guards who abscond.
--
-- Placed after SUSPENDED so the enum order still reads as a severity
-- lifecycle: ACTIVE, ON_LEAVE, SUSPENDED, DESERTED, RESIGNED, TERMINATED.
-- Existing rows are untouched; adding values does not rewrite the column.
-- DESERTION joins the disciplinary catalogue for the paper trail.

ALTER TYPE "EmploymentStatus" ADD VALUE IF NOT EXISTS 'DESERTED' AFTER 'SUSPENDED';
ALTER TYPE "DisciplinaryType" ADD VALUE IF NOT EXISTS 'DESERTION';
