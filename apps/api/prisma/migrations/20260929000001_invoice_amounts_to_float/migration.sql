-- Invoice money becomes double precision.
--
-- An invoice line's rate is a daily figure, and the only sane source for it is
-- a contract's monthly rate divided by 30 — 500,000/30 = 16,666.66…, which the
-- old integer columns forced to a whole shilling (and rounding it up billed the
-- client 50 UGX more per guard per month than the contract says). Two decimals
-- are enough for UGX, and they are enforced at the request boundary rather than
-- in the database.
--
-- Widening integer columns to double precision is lossless: every stored value
-- maps to exactly the same number, so no row is rewritten in substance and no
-- payment, balance or carry-forward figure shifts.

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "ratePerGuard" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "subtotal" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "taxAmount" SET DEFAULT 0,
ALTER COLUMN "taxAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "totalAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "paidAmount" SET DEFAULT 0,
ALTER COLUMN "paidAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "outstandingBalance" SET DEFAULT 0,
ALTER COLUMN "outstandingBalance" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InvoiceCarryForward" ALTER COLUMN "carryAmount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InvoiceLineItem" ALTER COLUMN "ratePerGuard" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InvoicePayment" ALTER COLUMN "amountPaid" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amountPaid" SET DATA TYPE DOUBLE PRECISION;
