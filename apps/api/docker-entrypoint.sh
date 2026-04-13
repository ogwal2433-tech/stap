#!/bin/sh
set -e

echo "🗄️  Running database migrations..."
cd /app/apps/api
node_modules/.bin/prisma migrate deploy

echo "✅ Migrations complete"
echo "🚀 Starting API server..."

exec "$@"