-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "outstandingBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoiceCarryForward" (
    "id" TEXT NOT NULL,
    "fromInvoiceId" TEXT NOT NULL,
    "toInvoiceId" TEXT,
    "clientId" TEXT NOT NULL,
    "carryAmount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCarryForward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceCarryForward_fromInvoiceId_key" ON "InvoiceCarryForward"("fromInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceCarryForward_clientId_toInvoiceId_idx" ON "InvoiceCarryForward"("clientId", "toInvoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceCarryForward" ADD CONSTRAINT "InvoiceCarryForward_fromInvoiceId_fkey" FOREIGN KEY ("fromInvoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCarryForward" ADD CONSTRAINT "InvoiceCarryForward_toInvoiceId_fkey" FOREIGN KEY ("toInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCarryForward" ADD CONSTRAINT "InvoiceCarryForward_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill. Both columns default to 0, which on an existing invoice would read
-- as "nothing owed" — the opposite of the truth. Set paidAmount from payments
-- already recorded and derive the balance from it.
UPDATE "Invoice" i
SET "paidAmount" = COALESCE(p.total, 0),
    "outstandingBalance" = GREATEST(0, i."totalAmount" - COALESCE(p.total, 0))
FROM (
  SELECT "invoiceId", SUM("amountPaid") AS total
  FROM "Payment"
  GROUP BY "invoiceId"
) p
WHERE p."invoiceId" = i.id;

-- Invoices with no payments at all still owe the full amount.
UPDATE "Invoice"
SET "outstandingBalance" = "totalAmount"
WHERE "paidAmount" = 0;

-- An invoice already marked PAID owes nothing, whatever the payment rows say.
UPDATE "Invoice" SET "outstandingBalance" = 0 WHERE status = 'PAID';
