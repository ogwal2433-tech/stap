-- CreateTable InvoicePayment for XCEL mobile money collections
CREATE TABLE "InvoicePayment" (
    "id"                TEXT NOT NULL,
    "invoiceId"         TEXT NOT NULL,
    "extReference"      TEXT NOT NULL,
    "phone"             TEXT NOT NULL,
    "network"           TEXT NOT NULL,
    "amountPaid"        INTEGER NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "xcelTransactionId" TEXT,
    "failureReason"     TEXT,
    "initiatedBy"       TEXT NOT NULL,
    "initiatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"        TIMESTAMP(3),
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_extReference_key" ON "InvoicePayment"("extReference");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
