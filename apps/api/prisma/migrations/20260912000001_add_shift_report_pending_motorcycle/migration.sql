-- Sections 8 and 9 of the Control Room handover: pending matters for the next
-- shift, and the supervisor motorcycle report.
--
-- Nullable rather than NOT NULL DEFAULT '[]': every report already written was
-- handed over without these sections, and an empty array would claim the
-- controller recorded "nothing pending" when they were never asked.
ALTER TABLE "ShiftHandoverReport" ADD COLUMN     "motorcycleReport" JSONB,
ADD COLUMN     "pendingMatters" JSONB;
