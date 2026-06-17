-- Add billingRatePerDay to Guard (nullable — falls back to salaryRate when not set)
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "billingRatePerDay" INTEGER;

-- Extend InvoiceLineItem with guardId and days
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "guardId" TEXT;
ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "days" INTEGER NOT NULL DEFAULT 30;
