-- Security360 rebrand: settings still holding a STAP default move to the
-- Security360 one. Data only; no schema change.
--
-- A value only changes while it is still exactly the old default, so a prefix
-- or name an administrator chose deliberately is left alone.
--
-- What has already been issued is NOT renamed: guard IDs (printed on ID
-- cards), invoice numbers (on client statements and payment references),
-- letter references and item codes keep the numbers they were issued with.
-- Only records created from now on use the new prefixes.
--
-- Reverse with rollback.sql in this directory.

-- New system IDs: SSLG001 -> S360G001 and so on.
UPDATE "SystemSetting" SET "value" = 'S360G', "updatedAt" = NOW() WHERE "key" = 'guard_id_prefix'  AND "value" = 'SSLG';
UPDATE "SystemSetting" SET "value" = 'S360C', "updatedAt" = NOW() WHERE "key" = 'client_id_prefix' AND "value" = 'SSLC';
UPDATE "SystemSetting" SET "value" = 'S360S', "updatedAt" = NOW() WHERE "key" = 'staff_id_prefix'  AND "value" = 'SSLS';

-- New invoice numbers: STAP/INV/2026/0001 -> S360/INV/2026/0001.
UPDATE "SystemSetting" SET "value" = 'S360/INV', "updatedAt" = NOW() WHERE "key" = 'invoice_prefix' AND "value" = 'STAP/INV';

-- Subject prefix on scheduled report emails.
UPDATE "SystemSetting" SET "value" = 'Security360 Report', "updatedAt" = NOW() WHERE "key" = 'scheduled_report_email_prefix' AND "value" = 'STAP Report';

-- Company details the old seed wrote as rows. A saved row overrides the
-- deployment default, so these pinned STAP onto every document. Removing them
-- lets Settings > Company Branding resolve to this deployment's defaults,
-- exactly as "Reset to defaults" would.
DELETE FROM "SystemSetting" WHERE ("key", "value") IN (
  ('company_name',    'STAP Security Ltd'),
  ('company_email',   'info@stapsecurity.co.ug'),
  ('company_website', 'www.stapsecurity.co.ug')
);
