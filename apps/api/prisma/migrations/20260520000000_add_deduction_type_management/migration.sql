-- CreateTable
CREATE TABLE "DeductionType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultAmount" INTEGER,
    "description" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeductionType_name_key" ON "DeductionType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionType_code_key" ON "DeductionType"("code");
