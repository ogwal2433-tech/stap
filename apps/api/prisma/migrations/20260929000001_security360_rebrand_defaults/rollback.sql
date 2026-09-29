-- Reverses migration.sql in this directory. Prisma applies only migration.sql;
-- run this by hand if the rebrand has to be undone:
--
--   psql "$DATABASE_URL" -f rollback.sql
--   npx prisma migrate resolve --rolled-back 20260929000001_security360_rebrand_defaults
--
-- Like the migration, each statement only touches a value still equal to what
-- the migration wrote, so anything changed since is kept.

UPDATE "SystemSetting" SET "value" = 'SSLG', "updatedAt" = NOW() WHERE "key" = 'guard_id_prefix'  AND "value" = 'S360G';
UPDATE "SystemSetting" SET "value" = 'SSLC', "updatedAt" = NOW() WHERE "key" = 'client_id_prefix' AND "value" = 'S360C';
UPDATE "SystemSetting" SET "value" = 'SSLS', "updatedAt" = NOW() WHERE "key" = 'staff_id_prefix'  AND "value" = 'S360S';
UPDATE "SystemSetting" SET "value" = 'STAP/INV', "updatedAt" = NOW() WHERE "key" = 'invoice_prefix' AND "value" = 'S360/INV';
UPDATE "SystemSetting" SET "value" = 'STAP Report', "updatedAt" = NOW() WHERE "key" = 'scheduled_report_email_prefix' AND "value" = 'Security360 Report';

-- Restores the company rows only where none has been saved since.
INSERT INTO "SystemSetting" ("id", "key", "value", "label", "group", "dataType", "updatedAt") VALUES
  (gen_random_uuid()::text, 'company_name',    'STAP Security Ltd',       'Company Name',    'GENERAL', 'string', NOW()),
  (gen_random_uuid()::text, 'company_email',   'info@stapsecurity.co.ug', 'Company Email',   'GENERAL', 'string', NOW()),
  (gen_random_uuid()::text, 'company_website', 'www.stapsecurity.co.ug',  'Company Website', 'GENERAL', 'string', NOW())
ON CONFLICT ("key") DO NOTHING;
