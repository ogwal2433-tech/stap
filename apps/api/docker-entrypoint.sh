#!/bin/sh
set -e

echo "🗄️  Running database migrations..."

cd /app/apps/api

# If the enum-fix migration is stuck in "failed" state, mark it as rolled-back
# so Prisma will re-apply it. The SQL uses IF EXISTS/IF NOT EXISTS guards and
# is idempotent — re-running is safe.
npx prisma migrate resolve \
  --rolled-back 20260602000001_fix_shift_type_enum \
  --schema /app/apps/api/prisma/schema.prisma 2>/dev/null || true

npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma

echo "✅ Migrations complete"

echo "⚙️  Initialising default system settings..."
cd /app
node apps/api/dist/db/initSettings.js
echo "✅ Settings initialised"

echo "🚀 Starting API server..."
exec node apps/api/dist/index.js
