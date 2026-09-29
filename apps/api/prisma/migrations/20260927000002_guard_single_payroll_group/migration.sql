-- A guard may belong to at most one payroll group.

-- First collapse any existing multi-membership down to the oldest row per
-- guard, so adding the unique index cannot fail on data created while the
-- join table allowed several groups.
DELETE FROM "GuardPayrollGroupMember"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT DISTINCT ON ("guardId") "id"
    FROM "GuardPayrollGroupMember"
    ORDER BY "guardId", "createdAt", "id"
  ) AS keep
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardPayrollGroupMember_guardId_key" ON "GuardPayrollGroupMember"("guardId");
