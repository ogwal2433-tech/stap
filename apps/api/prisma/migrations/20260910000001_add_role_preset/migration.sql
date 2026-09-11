-- Named permission sets that can be applied to a role in one step.
--
-- Additive only: no existing table, index or grant is touched. Keys are held
-- as text, not foreign keys, so a preset survives changes to the catalogue.

-- CreateTable
CREATE TABLE "RolePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissionKeys" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePreset_name_key" ON "RolePreset"("name");

-- AddForeignKey
ALTER TABLE "RolePreset" ADD CONSTRAINT "RolePreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

