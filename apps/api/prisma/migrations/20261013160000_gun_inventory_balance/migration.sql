-- Gun inventory balancing: live type/location counters plus an
-- append-only bullet ledger per gun. Gun.currentBullets stays as the cached
-- balance; AmmoTransaction is the trail that proves it.
-- Backfilled from live rows so reconciliation starts clean; retired guns are
-- excluded from both (they are out of the inventory by definition).
-- CreateTable
CREATE TABLE "GunTypeStock" (
    "id" TEXT NOT NULL,
    "gunType" TEXT NOT NULL,
    "siteId" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GunTypeStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GunTypeStock_gunType_siteId_key" ON "GunTypeStock"("gunType", "siteId");

-- CreateTable
CREATE TABLE "AmmoTransaction" (
    "id" TEXT NOT NULL,
    "gunId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "movementId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmmoTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmmoTransaction_gunId_createdAt_idx" ON "AmmoTransaction"("gunId", "createdAt");

-- AddForeignKey
ALTER TABLE "AmmoTransaction" ADD CONSTRAINT "AmmoTransaction_gunId_fkey" FOREIGN KEY ("gunId") REFERENCES "Gun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmoTransaction" ADD CONSTRAINT "AmmoTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON UPDATE CASCADE;

-- Backfill type/location counters from live (non-retired) guns.
INSERT INTO "GunTypeStock" ("id", "gunType", "siteId", "count", "updatedAt")
SELECT
  'stock-' || "gunType" || '-' || COALESCE("currentSiteId", 'ARMOURY'),
  "gunType",
  COALESCE("currentSiteId", ''),
  COUNT(*),
  CURRENT_TIMESTAMP
FROM "Gun"
WHERE "status" <> 'RETIRED'
GROUP BY "gunType", "currentSiteId";

-- Backfill opening bullet balances from live guns.
INSERT INTO "AmmoTransaction" ("id", "gunId", "change", "balance", "reason", "recordedById", "createdAt")
SELECT
  'ammo-opening-' || "id",
  "id",
  "currentBullets",
  "currentBullets",
  'OPENING_BALANCE',
  "registeredById",
  CURRENT_TIMESTAMP
FROM "Gun"
WHERE "status" <> 'RETIRED';
