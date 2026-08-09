-- Add ON_LEAVE and RESIGNED to the guard employment status enum.
--
-- Placed positionally rather than appended so the enum's sort order matches the
-- lifecycle it describes: ACTIVE, ON_LEAVE, SUSPENDED, RESIGNED, TERMINATED.
-- A bare ADD VALUE appends, which would sort RESIGNED after TERMINATED.
--
-- Existing rows are untouched — adding enum values does not rewrite the column.
-- ON_LEAVE now carries the meaning of the never-written Guard."onLeave" boolean,
-- whose deployment checks are removed in this change.

ALTER TYPE "EmploymentStatus" ADD VALUE IF NOT EXISTS 'ON_LEAVE' AFTER 'ACTIVE';
ALTER TYPE "EmploymentStatus" ADD VALUE IF NOT EXISTS 'RESIGNED' BEFORE 'TERMINATED';
