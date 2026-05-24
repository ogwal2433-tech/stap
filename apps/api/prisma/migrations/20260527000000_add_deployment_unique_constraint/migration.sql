-- Add isPrimaryDeployment column (defaults to true for all existing deployments)
ALTER TABLE "Deployment" ADD COLUMN "isPrimaryDeployment" BOOLEAN NOT NULL DEFAULT true;

-- Remove any existing duplicate deployments before adding unique constraint
-- Keep the earliest-created record for each (guardId, date) pair
DELETE FROM "Deployment"
WHERE id NOT IN (
  SELECT DISTINCT ON ("guardId", date) id
  FROM "Deployment"
  ORDER BY "guardId", date, "createdAt" ASC
);

-- Add unique constraint: one deployment per guard per date
CREATE UNIQUE INDEX "Deployment_guardId_date_key" ON "Deployment"("guardId", "date");
