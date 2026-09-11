-- Roles become rows instead of values of a Postgres enum, so one can be created,
-- relabelled, disabled or deleted from the UI without a migration.
--
-- Hand-written, not generated. A generated diff changes an enum column to text by
-- dropping and re-adding it, which would discard every user's role. This keeps
-- every value in place and converts it.
--
-- User.role and RolePermission.role stay text columns holding the role's NAME,
-- now with a foreign key to Role.name. Every query, token and requireRole check
-- that compares role names therefore works unchanged.

-- 1. The two enum columns become text, keeping every value.
ALTER TABLE "User"           ALTER COLUMN "role" TYPE TEXT USING "role"::text;
ALTER TABLE "RolePermission" ALTER COLUMN "role" TYPE TEXT USING "role"::text;

-- 2. Drop the enum type. Table names and type names share one namespace in
--    Postgres (pg_type), so a "Role" table cannot be created while it exists.
DROP TYPE "Role";

-- 3. The Role table.
CREATE TABLE "Role" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "label"       TEXT         NOT NULL,
    "description" TEXT,
    "colour"      TEXT,
    "isSystem"    BOOLEAN      NOT NULL DEFAULT false,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- 4. The fourteen system roles — every value the enum held. MARKETING was
--    retired when it split into MARKETING_HEAD and SALES; it is kept, disabled,
--    so its existing grants and any token issued before the split still resolve.
--    Labels and colours match ROLE_CONFIG and apps/api/src/constants/systemRoles.ts.
INSERT INTO "Role" ("id", "name", "label", "description", "colour", "isSystem", "isActive", "updatedAt") VALUES
  (gen_random_uuid()::text, 'DIRECTOR',              'Director',              'Full system access. Can manage all modules, approve requisitions, and view all reports.', '#1B3A6B', true, true,  NOW()),
  (gen_random_uuid()::text, 'ASSISTANT_MANAGER',     'Assistant Manager',     'Near-full access. Manages operations, HR, and finance but cannot change system settings.', '#17a2b8', true, true,  NOW()),
  (gen_random_uuid()::text, 'ADMINISTRATOR',         'Administrator',         'Manages users, system settings, and error logs.', '#6c757d', true, true,  NOW()),
  (gen_random_uuid()::text, 'OPERATIONS_SUPERVISOR', 'Operations Supervisor', 'Manages deployments, rosters, sites, and guard assignments.', '#2E86C1', true, true,  NOW()),
  (gen_random_uuid()::text, 'FIELD_SUPERVISOR',      'Field Supervisor',      'Builds rosters for their assigned zone. Views guards and attendance.', '#ffc107', true, true,  NOW()),
  (gen_random_uuid()::text, 'TRAINER',               'Trainer',               'Manages guard recruitment, vetting, training records, and gun issuance.', '#6C3483', true, true,  NOW()),
  (gen_random_uuid()::text, 'ACCOUNTS_OFFICER',      'Accounts Officer',      'Manages invoices, payments, requisitions, and financial reports.', '#28a745', true, true,  NOW()),
  (gen_random_uuid()::text, 'CONTROL_ROOM',          'Control Room',          'Receives and manages complaints. Forwards communications to department heads.', '#E8701A', true, true,  NOW()),
  (gen_random_uuid()::text, 'MARKETING',             'Marketing (legacy)',    'Superseded by Marketing Head and Sales. No account should still hold it.', '#0F7B6C', true, false, NOW()),
  (gen_random_uuid()::text, 'MARKETING_HEAD',        'Marketing Head',        'Full marketing access. Sees every lead from every sales officer, sets targets, manages bids and tenders, and runs all marketing reports.', '#6C3483', true, true,  NOW()),
  (gen_random_uuid()::text, 'SALES',                 'Sales',                 'Sells. Sees only the leads assigned to them, and creates and updates those. No targets, no bids, no sight of a colleague''s pipeline.', '#E8701A', true, true,  NOW()),
  (gen_random_uuid()::text, 'HR',                    'HR Officer',            'Guard HR records, leave, discipline, letters, training and HR reports. No finance, payroll, complaints or marketing.', '#0F7B6C', true, true,  NOW()),
  (gen_random_uuid()::text, 'GUARD',                 'Guard',                 'A security guard. Signs in to check in and see their own records.', '#34495E', true, true,  NOW()),
  (gen_random_uuid()::text, 'CLIENT',                'Client',                'A customer''s portal login. Sees only their own company.', '#7F8C8D', true, true,  NOW());

-- 5. Stop loudly if any role in use has no row. The foreign keys below would
--    refuse anyway, but with a message that does not name the role.
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(DISTINCT v, ', ') INTO missing
    FROM (SELECT "role" AS v FROM "User" UNION SELECT "role" FROM "RolePermission") used
   WHERE v NOT IN (SELECT "name" FROM "Role");
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Roles in use with no Role row: %', missing;
  END IF;
END $$;

-- 6. Foreign keys. A user's role cannot be deleted from under them; deleting a
--    role takes its grants with it. ON UPDATE CASCADE is belt and braces — the
--    application never renames a role.
ALTER TABLE "User"
  ADD CONSTRAINT "User_role_fkey"
  FOREIGN KEY ("role") REFERENCES "Role"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_role_fkey"
  FOREIGN KEY ("role") REFERENCES "Role"("name") ON DELETE CASCADE ON UPDATE CASCADE;
