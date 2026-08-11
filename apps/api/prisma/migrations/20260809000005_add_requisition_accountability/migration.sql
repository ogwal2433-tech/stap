-- CreateTable
CREATE TABLE "RequisitionAccountability" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "totalAdminAmount" INTEGER NOT NULL DEFAULT 0,
    "totalHRAmount" INTEGER NOT NULL DEFAULT 0,
    "totalDirectorAmount" INTEGER NOT NULL DEFAULT 0,
    "originalAmount" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "adminReviewedById" TEXT,
    "adminReviewedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "hrReviewedById" TEXT,
    "hrReviewedAt" TIMESTAMP(3),
    "hrNotes" TEXT,
    "directorApprovedById" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "directorNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitionAccountability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountabilityItem" (
    "id" TEXT NOT NULL,
    "accountabilityId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "requisitionItem" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rate" INTEGER NOT NULL DEFAULT 0,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "adminAmount" INTEGER,
    "hrAmount" INTEGER,
    "directorAmount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountabilityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionAccountability_requisitionId_key" ON "RequisitionAccountability"("requisitionId");

-- CreateIndex
CREATE INDEX "AccountabilityItem_accountabilityId_itemNumber_idx" ON "AccountabilityItem"("accountabilityId", "itemNumber");

-- AddForeignKey
ALTER TABLE "RequisitionAccountability" ADD CONSTRAINT "RequisitionAccountability_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionAccountability" ADD CONSTRAINT "RequisitionAccountability_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionAccountability" ADD CONSTRAINT "RequisitionAccountability_adminReviewedById_fkey" FOREIGN KEY ("adminReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionAccountability" ADD CONSTRAINT "RequisitionAccountability_hrReviewedById_fkey" FOREIGN KEY ("hrReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionAccountability" ADD CONSTRAINT "RequisitionAccountability_directorApprovedById_fkey" FOREIGN KEY ("directorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilityItem" ADD CONSTRAINT "AccountabilityItem_accountabilityId_fkey" FOREIGN KEY ("accountabilityId") REFERENCES "RequisitionAccountability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

