-- CreateTable
CREATE TABLE "ProspectiveClient" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimatedValue" INTEGER,
    "lostReason" TEXT,
    "wonDate" TIMESTAMP(3),
    "convertedClientId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectiveClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectStatusHistory" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "bidType" TEXT NOT NULL,
    "amount" INTEGER,
    "submissionDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "requirements" TEXT,
    "notes" TEXT,
    "lostReason" TEXT,
    "submittedById" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTarget" (
    "id" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "targetClients" INTEGER,
    "targetBids" INTEGER,
    "achievedValue" INTEGER NOT NULL DEFAULT 0,
    "achievedClients" INTEGER NOT NULL DEFAULT 0,
    "achievedBids" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectiveClient_convertedClientId_key" ON "ProspectiveClient"("convertedClientId");

-- CreateIndex
CREATE INDEX "ProspectiveClient_status_assignedToId_idx" ON "ProspectiveClient"("status", "assignedToId");

-- CreateIndex
CREATE INDEX "ProspectStatusHistory_prospectId_createdAt_idx" ON "ProspectStatusHistory"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Bid_status_closingDate_idx" ON "Bid"("status", "closingDate");

-- CreateIndex
CREATE INDEX "MarketingTarget_period_idx" ON "MarketingTarget"("period");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingTarget_assignedToId_period_periodType_key" ON "MarketingTarget"("assignedToId", "period", "periodType");

-- AddForeignKey
ALTER TABLE "ProspectiveClient" ADD CONSTRAINT "ProspectiveClient_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectiveClient" ADD CONSTRAINT "ProspectiveClient_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectiveClient" ADD CONSTRAINT "ProspectiveClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "ProspectiveClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTarget" ADD CONSTRAINT "MarketingTarget_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTarget" ADD CONSTRAINT "MarketingTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

