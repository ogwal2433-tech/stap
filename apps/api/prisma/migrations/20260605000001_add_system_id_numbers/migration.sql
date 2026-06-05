-- Add formatted system ID fields to Guard, Client, and User.
-- Nullable to allow backwards-compatible migration; backfilled by seed.

ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "systemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Guard_systemId_key" ON "Guard"("systemId");

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "systemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_systemId_key" ON "Client"("systemId");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "systemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_systemId_key" ON "User"("systemId");
