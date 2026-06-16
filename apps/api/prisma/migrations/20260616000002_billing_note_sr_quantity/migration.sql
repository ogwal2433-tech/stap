-- Add billingNote to Contract
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "billingNote" TEXT;

-- Add quantity to ServiceRequest
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
