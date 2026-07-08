-- CreateTable
CREATE TABLE "SystemError" (
    "id" TEXT NOT NULL,
    "errorCode" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "route" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "userId" TEXT,
    "userRole" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemError_status_severity_lastSeenAt_idx" ON "SystemError"("status", "severity", "lastSeenAt");

-- CreateIndex
CREATE INDEX "SystemError_message_route_status_idx" ON "SystemError"("message", "route", "status");

-- AddForeignKey
ALTER TABLE "SystemError" ADD CONSTRAINT "SystemError_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
