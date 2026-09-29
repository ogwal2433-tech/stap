#!/usr/bin/env bash
#
# Stops the Security360 stack without ever deleting its data.
#
#   ./stop-security360.sh
#
# Always the Security360 file and env: a bare `docker compose down` in this
# directory reads docker-compose.yml instead, which is the other stack.
#
# The database is backed up to ./backups first, and `down` runs without -v, so
# the security360_postgres, security360_redis and security360_uploads volumes
# are kept. `./deploy-security360.sh` brings the stack back on the same data.
#
# Takes no arguments on purpose, so -v / --volumes cannot be passed through.
set -euo pipefail

COMPOSE_FILE="docker-compose.security360.yml"
ENV_FILE=".env.security360"
BACKUP_DIR="backups"

cd "$(dirname "$0")"

if [ "$#" -gt 0 ]; then
  echo "✗ This script takes no arguments — it never removes volumes."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE is missing, so this is not a Security360 checkout."
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# Back up while the database is still running. If the dump fails, stop here
# rather than take the stack down with no copy of the data.
if [ -n "$(compose ps --status running -q postgres)" ]; then
  mkdir -p "$BACKUP_DIR"
  backup="$BACKUP_DIR/security360_$(date +%Y%m%d_%H%M%S).sql"
  echo "💾 Backing up the database to $backup…"
  if ! compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup" \
     || [ ! -s "$backup" ]; then
    rm -f "$backup"
    echo "✗ Backup failed — nothing was stopped."
    exit 1
  fi
  echo "✅ Backup written ($(du -h "$backup" | cut -f1))."
else
  echo "ℹ️  Postgres is not running, so there is nothing to back up. Its volume is untouched."
fi

echo "🛑 Stopping Security360 (volumes are kept)…"
compose down

echo
echo "✅ Stopped. Data volumes still present:"
docker volume ls --format '{{.Name}}' | grep '^security360_' || true
echo "   Start again with: ./deploy-security360.sh"
