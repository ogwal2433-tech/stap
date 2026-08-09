-- CreateTable
CREATE TABLE "GuardPromotion" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "fromRank" TEXT NOT NULL,
    "toRank" TEXT NOT NULL,
    "fromSalary" INTEGER NOT NULL,
    "toSalary" INTEGER NOT NULL,
    "salaryIncrement" INTEGER NOT NULL,
    "reason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuardPromotion_guardId_effectiveDate_idx" ON "GuardPromotion"("guardId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "GuardPromotion" ADD CONSTRAINT "GuardPromotion_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardPromotion" ADD CONSTRAINT "GuardPromotion_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

