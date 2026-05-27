#!/bin/sh
set -e

echo "🗄️  Running database migrations..."

# Run migrations from the correct working directory
cd /app/apps/api
npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma

echo "✅ Migrations complete"

echo "⚙️  Initialising default system settings..."
cd /app
node apps/api/dist/db/initSettings.js
echo "✅ Settings initialised"

echo "🚀 Starting API server..."
exec node apps/api/dist/index.js