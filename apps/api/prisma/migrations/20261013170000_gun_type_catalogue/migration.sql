-- Firearm catalogue: gun types move from a compiled list to a managed
-- table so new types are added in Settings without a deploy. Seeded from the
-- outgoing list (all active) plus Pistol (inactive, keeps the legacy rows
-- readable exactly as before). Registration is held to active rows.
-- CreateTable
CREATE TABLE "GunType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GunType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GunType_code_key" ON "GunType"("code");

-- SeedRow
INSERT INTO "GunType" ("id", "code", "label", "isActive", "displayOrder", "createdAt", "updatedAt") VALUES
  ('seed-guntype-ak47', 'AK-47', 'AK-47', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-sar', 'SAR_RIFLE', 'SAR Rifle', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-rifle', 'RIFLE', 'Rifle', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-pardus', 'PARDUS_SHORT_GUN', 'Pardus Short Gun', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-12bore', '12_BORE_SG_DB', '12 Bore S/G D/B', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-atac', 'A-TAC', 'A-TAC', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-guntype-pistol', 'Pistol', 'Pistol', false, 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
