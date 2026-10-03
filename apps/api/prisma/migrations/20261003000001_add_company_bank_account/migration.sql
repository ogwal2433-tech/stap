-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK_ACCOUNT',
    "currency" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "branchNo" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyBankAccount_isActive_sortOrder_idx" ON "CompanyBankAccount"("isActive", "sortOrder");

-- SeedRow
-- Carry the single set of company_bank_* settings into one default account so
-- existing invoices are unaffected. Inserted only when at least one of those
-- rows actually holds a value; a deployment that never filled them in gets no
-- row and prints no payment block, exactly as before.
INSERT INTO "CompanyBankAccount"
    ("id", "label", "type", "currency", "bankName", "branchName", "branchNo",
     "accountName", "accountNumber", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
    'seed-company-bank-default',
    'Default Account',
    'BANK_ACCOUNT',
    NULL,
    MAX(CASE WHEN "key" = 'company_bank_name'         THEN NULLIF(btrim("value"), '') END),
    MAX(CASE WHEN "key" = 'company_bank_branch_name'  THEN NULLIF(btrim("value"), '') END),
    MAX(CASE WHEN "key" = 'company_bank_branch_no'    THEN NULLIF(btrim("value"), '') END),
    MAX(CASE WHEN "key" = 'company_bank_account_name' THEN NULLIF(btrim("value"), '') END),
    MAX(CASE WHEN "key" = 'company_bank_account'      THEN NULLIF(btrim("value"), '') END),
    true,
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" IN ('company_bank_name', 'company_bank_branch_name', 'company_bank_branch_no',
                'company_bank_account_name', 'company_bank_account')
HAVING COUNT(*) FILTER (WHERE btrim(COALESCE("value", '')) <> '') > 0;
