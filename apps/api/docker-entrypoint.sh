#!/bin/sh
set -e

echo "🗄️  Running database migrations..."

cd /app/apps/api

# A one-time unblock for 20260602000001 used to live here: every boot marked it
# rolled back so Prisma would re-apply it. It was a no-op on a healthy database
# — resolve refuses a migration that is not in a failed state, and the error was
# swallowed — but it is not safe to keep now that 20260829000002 has landed.
#
# 20260602000001 rewrites shiftType values it does not recognise to 'DAY' and
# converts the columns back to the ShiftType enum. Since 20260829000002 those
# columns hold configurable codes, so re-running it would silently flatten every
# custom shift — OVERTIME included — across the deployment roster and undo the
# very change that allowed them. A migration that fails should stop the boot and
# be resolved deliberately, not be cleared on a schedule.

npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma

echo "✅ Migrations complete"

echo "⚙️  Initialising default system settings..."
cd /app
node apps/api/dist/db/initSettings.js
echo "✅ Settings initialised"

echo "📄  Initialising default letter templates..."
node apps/api/dist/db/initTemplates.js
echo "✅ Templates initialised"

# Run whatever the container was asked to run, rather than a hardcoded path.
#
# This used to end `exec node apps/api/dist/index.js`, which discarded the
# command compose passes. The worker service asks for worker.js and was silently
# given the API instead: security360-worker came up listening on 3001, passed the HTTP
# healthcheck because it really was the API, and no cron job ran anywhere —
# they are all registered in worker.js.
#
# The Dockerfile CMD supplies index.js, so a container started without a command
# still runs the API exactly as before.
echo "🚀 Starting: $*"
exec "$@"
