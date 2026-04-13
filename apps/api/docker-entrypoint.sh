#!/bin/sh
set -e

echo "🗄️  Running database migrations..."

# Run migrations from the correct working directory
cd /app/apps/api
npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma

echo "✅ Migrations complete"
echo "🚀 Starting API server..."

# Go back to app root and run the server
cd /app
exec node apps/api/dist/index.js