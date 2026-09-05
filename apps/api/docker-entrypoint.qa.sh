#!/bin/sh
set -e

# QA entrypoint. Mirrors docker-entrypoint.sh so QA exercises the same startup
# path production does, then adds seeding — QA needs accounts to log in with.
#
# Mounted into the image by docker-compose.qa.yml rather than baked in, so QA
# runs the identical image as production. A separate QA Dockerfile would drift
# from the real one and QA would stop testing what actually ships.

echo "════════════════════════════════════════"
echo "  STAP Security — QA environment"
echo "════════════════════════════════════════"

cd /app/apps/api

# No wait loop here: compose gates this container on the database and redis
# healthchecks, so both are already accepting connections.

echo "🗄️  Running database migrations..."
# The one-time unblock for 20260602000001 that used to sit here is gone, for
# the reason it was removed from the production entrypoint: that migration
# rewrites any shiftType it does not recognise to 'DAY' and converts the columns
# back to an enum. Since 20260829000002 those columns hold configurable codes,
# so clearing and re-running it would flatten every custom shift on the roster.
npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma
echo "✅ Migrations complete"

cd /app

echo "⚙️  Initialising default system settings..."
node apps/api/dist/db/initSettings.js
echo "✅ Settings initialised"

echo "📄  Initialising default letter templates..."
node apps/api/dist/db/initTemplates.js
echo "✅ Templates initialised"

# The seed is built from upserts and deletes nothing, so re-running it on every
# boot tops up anything missing without touching a tester's work. It does not
# reset the database — for a clean slate use `pnpm qa:reset`, which drops the
# volume.
if [ "${QA_SKIP_SEED}" = "true" ]; then
  echo "⏭️  QA_SKIP_SEED=true — skipping seed"
else
  echo "🌱 Seeding QA data..."
  node apps/api/dist/db/seed.js
  echo "✅ Seed complete"
fi

echo "🚀 Starting API on port ${PORT:-3001}..."
exec node apps/api/dist/index.js
