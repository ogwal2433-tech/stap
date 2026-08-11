-- CreateTable
CREATE TABLE "Gun" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "gunType" TEXT NOT NULL,
    "manufacturer" TEXT,
    "calibre" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'IN_ARMOURY',
    "currentSiteId" TEXT,
    "currentBullets" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GunMovement" (
    "id" TEXT NOT NULL,
    "gunId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "fromSiteId" TEXT,
    "toSiteId" TEXT,
    "bullets" INTEGER NOT NULL DEFAULT 0,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GunMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gun_serialNumber_key" ON "Gun"("serialNumber");

-- CreateIndex
CREATE INDEX "Gun_status_gunType_idx" ON "Gun"("status", "gunType");

-- CreateIndex
CREATE INDEX "GunMovement_gunId_movementDate_idx" ON "GunMovement"("gunId", "movementDate");

-- CreateIndex
CREATE INDEX "GunMovement_toSiteId_idx" ON "GunMovement"("toSiteId");

-- AddForeignKey
ALTER TABLE "Gun" ADD CONSTRAINT "Gun_currentSiteId_fkey" FOREIGN KEY ("currentSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gun" ADD CONSTRAINT "Gun_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GunMovement" ADD CONSTRAINT "GunMovement_gunId_fkey" FOREIGN KEY ("gunId") REFERENCES "Gun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GunMovement" ADD CONSTRAINT "GunMovement_toSiteId_fkey" FOREIGN KEY ("toSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GunMovement" ADD CONSTRAINT "GunMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

