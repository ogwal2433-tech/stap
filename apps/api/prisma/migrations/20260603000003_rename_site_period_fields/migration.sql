-- Rename specialDuty* columns to unified sitePeriod* names.
-- These fields now apply to both TEMPORARY and SPECIAL_DUTIES sites.

ALTER TABLE "Site" RENAME COLUMN "specialDutyStartDate" TO "sitePeriodStart";
ALTER TABLE "Site" RENAME COLUMN "specialDutyEndDate"   TO "sitePeriodEnd";
ALTER TABLE "Site" RENAME COLUMN "specialDutyNotes"     TO "sitePeriodNotes";
