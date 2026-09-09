#!/usr/bin/env bash
#
# Deploys the Security360 stack. Touches nothing belonging to the STAP stack:
# different compose project, containers, volumes, network and database.
#
#   ./deploy-security360.sh
#
set -euo pipefail

COMPOSE_FILE="docker-compose.security360.yml"
ENV_FILE=".env.security360"

cd "$(dirname "$0")"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE is missing."
  echo "  cp .env.security360.example $ENV_FILE  — then fill in the secrets."
  exit 1
fi

# Fail before building rather than after: the API refuses to start on a short
# JWT secret, and a placeholder left in place is the likeliest reason a first
# deploy comes up unhealthy.
missing=()
while read -r key; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [ -z "$value" ] || [[ "$value" == CHANGE_ME* ]]; then
    missing+=("$key")
  fi
done <<'KEYS'
S360_POSTGRES_PASSWORD
S360_JWT_SECRET
S360_JWT_REFRESH_SECRET
S360_SETTINGS_ENCRYPTION_KEY
KEYS

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Still unset or left as CHANGE_ME in $ENV_FILE:"
  printf '    %s\n' "${missing[@]}"
  echo "  Generate each with: openssl rand -base64 48"
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "🚀 Building and starting Security360…"
compose up -d --build

# The api container's entrypoint runs migrations itself and compose gates it on
# the database healthcheck, so there is nothing to wait for or run by hand here.
echo "⏳ Waiting for the API to report healthy…"
port="$(grep -E '^S360_PORT=' "$ENV_FILE" | cut -d= -f2- || true)"
port="${port:-8080}"

for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${port}/api/v1/health" >/dev/null 2>&1; then
    echo "✅ API is up."
    curl -fsS "http://localhost:${port}/api/v1/health"; echo
    break
  fi
  sleep 2
done

echo
echo "🌐 Security360: http://localhost:${port}"
echo "   STAP is untouched on its own ports."
echo
compose ps
