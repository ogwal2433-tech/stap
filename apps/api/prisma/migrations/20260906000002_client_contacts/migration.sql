-- Multiple contact persons per client.
--
-- Client.contactPerson / contactPhone stay where they are: invoices, the client
-- portal and MoMo disbursement read them directly. They become the denormalised
-- primary, mirrored from whichever ClientContact row is isPrimary.

CREATE TABLE "ClientContact" (
    "id"          TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "contactType" TEXT NOT NULL DEFAULT 'PRIMARY',
    "name"        TEXT NOT NULL,
    "phone"       TEXT,
    "email"       TEXT,
    "jobTitle"    TEXT,
    "isPrimary"   BOOLEAN NOT NULL DEFAULT false,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientContact_clientId_isPrimary_idx"
    ON "ClientContact"("clientId", "isPrimary");

ALTER TABLE "ClientContact"
    ADD CONSTRAINT "ClientContact_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing client keeps the contact it already had, as its
-- PRIMARY row. Without this, opening any existing client after the deploy would
-- show an empty contacts list next to a populated contactPerson field.
--
-- gen_random_uuid() rather than a cuid: pgcrypto is available and the id only
-- has to be unique. Rows created through the API get cuids from Prisma.
INSERT INTO "ClientContact" (
    "id", "clientId", "contactType", "name", "phone", "isPrimary",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'PRIMARY',
    "contactPerson",
    NULLIF("contactPhone", ''),
    true,
    "createdAt",
    NOW()
FROM "Client"
WHERE COALESCE(TRIM("contactPerson"), '') <> '';
