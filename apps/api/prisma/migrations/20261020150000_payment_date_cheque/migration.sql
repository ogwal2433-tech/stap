-- Adds the operator-entered payment date and cheque number to manual invoice
-- payments. Both nullable so existing rows are untouched; the service defaults
-- paymentDate to the recording moment when the operator leaves it blank.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "chequeNumber" TEXT;
