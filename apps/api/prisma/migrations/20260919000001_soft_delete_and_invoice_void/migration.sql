-- Soft delete for Client, Guard, User, Contract and Site; void for Invoice.
--
-- Schema part generated with `prisma migrate diff`: nullable columns and
-- SET NULL foreign keys only, so existing rows are untouched and every record
-- stays live (deletedAt is null) until someone deletes it.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Guard" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guard" ADD CONSTRAINT "Guard_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions. The seed adds any missing key, but a deployment is not re-seeded,
-- and Director would otherwise be refused the new routes on the day this ships.
-- clients.delete and guards.delete may already exist; ON CONFLICT leaves them.
INSERT INTO "Permission" ("id", "key", "name", "module", "createdAt")
VALUES
  (gen_random_uuid()::text, 'clients.delete',   'Clients Delete',   'clients',   NOW()),
  (gen_random_uuid()::text, 'guards.delete',    'Guards Delete',    'guards',    NOW()),
  (gen_random_uuid()::text, 'staff.delete',     'Staff Delete',     'staff',     NOW()),
  (gen_random_uuid()::text, 'contracts.delete', 'Contracts Delete', 'contracts', NOW()),
  (gen_random_uuid()::text, 'sites.delete',     'Sites Delete',     'sites',     NOW()),
  (gen_random_uuid()::text, 'invoices.void',    'Invoices Void',    'invoices',  NOW())
ON CONFLICT ("key") DO NOTHING;

-- Director only. Anyone else is granted these deliberately from Roles &
-- Permissions — a deletion is rare, and hard to notice after the fact.
INSERT INTO "RolePermission" ("id", "role", "permissionId", "grantedAt")
SELECT gen_random_uuid()::text, r."name", p."id", NOW()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'DIRECTOR'
  AND p."key" IN ('clients.delete', 'guards.delete', 'staff.delete',
                  'contracts.delete', 'sites.delete', 'invoices.void')
ON CONFLICT ("role", "permissionId") DO NOTHING;
