-- CreateTable
CREATE TABLE "PayrollGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollGroup_name_key" ON "PayrollGroup"("name");

-- CreateTable
CREATE TABLE "GuardPayrollGroupMember" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardPayrollGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardPayrollGroupMember_guardId_groupId_key" ON "GuardPayrollGroupMember"("guardId", "groupId");

-- AddForeignKey
ALTER TABLE "GuardPayrollGroupMember" ADD CONSTRAINT "GuardPayrollGroupMember_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardPayrollGroupMember" ADD CONSTRAINT "GuardPayrollGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PayrollGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
