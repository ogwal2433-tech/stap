-- Add SICK and ON_LEAVE to the attendance status enum.
--
-- The deployment sheet marks a guard's status per posting, and "sick" and
-- "on leave" are day-to-day attendance outcomes that previously had to be
-- recorded as plain ABSENT, losing the reason.
--
-- Placed positionally so the enum sorts best-to-worst outcome:
-- PRESENT, LATE, SICK, ON_LEAVE, ABSENT, AWOL.
--
-- Neither counts toward days worked in payrollService (which sums PRESENT and
-- LATE), so both are unpaid — the same treatment ABSENT already gets.
-- Existing rows are untouched; adding enum values does not rewrite the column.

ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'SICK' AFTER 'LATE';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'ON_LEAVE' AFTER 'SICK';
