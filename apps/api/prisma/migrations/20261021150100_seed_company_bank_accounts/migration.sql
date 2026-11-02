-- The two accounts clients pay invoices into (MD's instruction, 21 Oct 2026).
-- Idempotent on accountNumber so re-running the migration cannot duplicate a
-- row, and both inserts land in one statement each so a partially-seeded table
-- still completes. updatedAt is written by hand because the column has no
-- database default — Prisma normally fills it in.
INSERT INTO "CompanyBankAccount"
  ("id", "label", "type", "currency", "bankName", "accountName", "accountNumber",
   "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'bkaccforestmallstanbic01', 'Forest Mall', 'BANK_ACCOUNT', 'UGX', 'Stanbic Bank',
       'TIGER SECURITY SOLUTIONS LIMITED', '9030024318345',
       true, true, 1, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "CompanyBankAccount" WHERE "accountNumber" = '9030024318345'
);

INSERT INTO "CompanyBankAccount"
  ("id", "label", "type", "currency", "bankName", "accountName", "accountNumber",
   "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'bkaccgardencityequity01', 'Garden City', 'BANK_ACCOUNT', 'UGX', 'Equity Bank',
       'TIGER SECURITY SOLUTIONS LIMITED', '1032203458921',
       false, true, 2, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "CompanyBankAccount" WHERE "accountNumber" = '1032203458921'
);

-- One true default at a time, whatever state the table was in before.
UPDATE "CompanyBankAccount"
   SET "isDefault" = ("accountNumber" = '9030024318345'),
       "updatedAt" = now()
 WHERE "isDefault" <> ("accountNumber" = '9030024318345');
