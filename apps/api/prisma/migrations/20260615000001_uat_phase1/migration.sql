-- UAT Phase 1: All 8 UAT feedback items

-- Item 4: Add UNDER_INVESTIGATION to ComplaintStatus enum
ALTER TYPE "ComplaintStatus" ADD VALUE IF NOT EXISTS 'UNDER_INVESTIGATION';

-- Item 4: Add receivedById, assignedAt, resolvedBy to ClientComplaint
ALTER TABLE "ClientComplaint"
  ADD COLUMN IF NOT EXISTS "receivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy"   TEXT;

ALTER TABLE "ClientComplaint"
  ADD CONSTRAINT "ClientComplaint_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Item 3: Add defaultSalary to GuardRank
ALTER TABLE "GuardRank"
  ADD COLUMN IF NOT EXISTS "defaultSalary" INTEGER;

-- Item 2+5: Add new fields to Requisition
ALTER TABLE "Requisition"
  ADD COLUMN IF NOT EXISTS "categories"    TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "particulars"   TEXT,
  ADD COLUMN IF NOT EXISTS "progress"      TEXT,
  ADD COLUMN IF NOT EXISTS "remarks"       TEXT,
  ADD COLUMN IF NOT EXISTS "accountDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "accountName"   TEXT,
  ADD COLUMN IF NOT EXISTS "bankName"      TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToId"  TEXT,
  ADD COLUMN IF NOT EXISTS "hrApprovedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hrApprovedBy"  TEXT,
  ADD COLUMN IF NOT EXISTS "dirApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dirApprovedBy" TEXT;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Item 6: ContractGuardRate table
CREATE TABLE IF NOT EXISTS "ContractGuardRate" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "contractId"   TEXT NOT NULL,
  "guardType"    TEXT NOT NULL DEFAULT 'UNARMED',
  "guardsCount"  INTEGER NOT NULL DEFAULT 1,
  "ratePerGuard" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractGuardRate_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Item 7: InvoiceLineItem table
CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "invoiceId"    TEXT NOT NULL,
  "description"  TEXT NOT NULL,
  "guardType"    TEXT,
  "guardsCount"  INTEGER NOT NULL DEFAULT 1,
  "ratePerGuard" INTEGER NOT NULL,
  "amount"       INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceLineItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Item 8: ServiceRequest table
CREATE TABLE IF NOT EXISTS "ServiceRequest" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "clientId"    TEXT NOT NULL,
  "siteId"      TEXT,
  "type"        TEXT NOT NULL DEFAULT 'OTHER',
  "subject"     TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "priority"    TEXT NOT NULL DEFAULT 'NORMAL',
  "resolvedBy"  TEXT,
  "resolvedAt"  TIMESTAMP(3),
  "resolution"  TEXT,
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRequest_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceRequest_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
