-- CreateTable
CREATE TABLE "GuardTransfer" (
    "id"           TEXT NOT NULL,
    "guardId"      TEXT NOT NULL,
    "fromSiteId"   TEXT,
    "toSiteId"     TEXT NOT NULL,
    "reason"       TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "authorisedBy" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardTransfer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GuardTransfer" ADD CONSTRAINT "GuardTransfer_guardId_fkey"
    FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardTransfer" ADD CONSTRAINT "GuardTransfer_fromSiteId_fkey"
    FOREIGN KEY ("fromSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardTransfer" ADD CONSTRAINT "GuardTransfer_toSiteId_fkey"
    FOREIGN KEY ("toSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardTransfer" ADD CONSTRAINT "GuardTransfer_authorisedBy_fkey"
    FOREIGN KEY ("authorisedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
