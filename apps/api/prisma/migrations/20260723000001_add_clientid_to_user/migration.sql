-- AlterTable: add the new FK column on User first, nullable, so we can backfill before touching Client
ALTER TABLE "User" ADD COLUMN "clientId" TEXT;

-- Backfill: carry over the existing single client-user link (Client.clientUserId -> User.id)
-- onto the new User.clientId column before the old column is dropped.
UPDATE "User" u
SET "clientId" = c."id"
FROM "Client" c
WHERE c."clientUserId" = u."id";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_clientUserId_fkey";

-- DropIndex
DROP INDEX "Client_clientUserId_key";

-- AlterTable: remove the old, superseded column
ALTER TABLE "Client" DROP COLUMN "clientUserId";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
