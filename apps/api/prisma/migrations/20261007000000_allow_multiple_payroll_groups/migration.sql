-- A guard may now belong to more than one payroll group.
-- Drops the single-group unique index from 20260927000002_guard_single_payroll_group;
-- the (guardId, groupId) pair stays unique so nobody is double-listed in one group.
DROP INDEX IF EXISTS "GuardPayrollGroupMember_guardId_key";
