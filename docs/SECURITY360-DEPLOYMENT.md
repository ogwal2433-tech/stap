# Security360 — a second branded deployment

This stack is a second deployment of the same software, alongside the primary
stack (`docker-compose.yml`), with its own database. Both run on one host at the
same time and share nothing but the machine.

The brand is configuration, not a fork. There is one codebase, one set of
Dockerfiles, and one `develop` branch; what differs is a handful of environment
variables. This matters because the product was renamed to Security360 once
before and renamed back (`50c1327`, `15c1158`) — a rename that edits constants
forces that churn on every deployment at once, and cannot produce two names on
one server.

## Ports

| Service    | Primary (existing) | QA        | Security360 |
|------------|-----------------|-----------|-------------|
| Web        | 80, 443         | 8000      | **8080**    |
| API        | internal only   | internal  | internal    |
| PostgreSQL | internal only   | internal  | internal    |
| Redis      | internal only   | internal  | internal    |

Only the web port is published. The API is reached through nginx on the same
port under `/api/`, and the database and Redis are not exposed to the host at
all — in any of the three stacks. Reach them with `docker exec` instead:

```bash
docker exec -it security360-postgres psql -U security360 -d security360
docker exec -it security360-redis redis-cli
```

## What is isolated

|            | Primary                 | Security360               |
|------------|-------------------------|---------------------------|
| Project    | `s360-prod`             | `security360`             |
| Containers | `s360-*-prod`            | `security360-*`           |
| Volumes    | `s360-prod_postgres_data`, … | `security360_postgres`, … |
| Network    | `s360-prod-network`            | `security360_network`      |
| Database   | `security360_production` | `security360`             |

`apps/api/src/__tests__/infra/stackIsolation.test.ts` asserts that no container
name, volume, network or published port is shared between the three stacks. A
collision does not fail loudly at deploy time — Docker attaches the new stack to
the existing resource, and the second deployment comes up talking to the first
one's data. The test is what stops that reaching a server.

## Setting it up

```bash
cp .env.security360.example .env.security360
# Fill in every CHANGE_ME. Generate each secret with:
#   openssl rand -base64 48
./deploy-security360.sh
```

The deploy script refuses to build while any required secret is unset or still
`CHANGE_ME`, because the API deliberately will not start on a JWT secret shorter
than 32 characters and a placeholder is the likeliest reason a first deploy comes
up unhealthy.

## How the brand is applied

Two different mechanisms, because the two halves are built differently:

- **API** — reads `APP_NAME` from the environment at boot, so a rename needs
  only a restart.
- **Frontend** — a static bundle behind nginx, with no server to ask at page
  load. `VITE_APP_NAME` is a **build argument**, so each branded stack builds its
  own image. An unset argument silently produces Security360 branding, which is exactly
  what the primary stack wants.

Both resolve through `resolveBranding()` in `packages/shared/src/constants/app.ts`.
Unset, everything falls back to `Security360` — so this whole mechanism existing
does not change the original deployment.

### The product name and the company name are separate

```
APP_NAME      the software      tab, sidebar, login screen, API docs, email subjects
COMPANY_NAME  the legal entity  invoices, contracts, letters, ID cards, client notices
```

`S360_COMPANY_NAME` defaults to `Security360 Ltd`, and the other company
details to the Security360 values in `docker-compose.security360.yml`. Anything
saved in Settings > Company Branding takes precedence. Set these only when this
deployment bills its own clients under a different legal name — a client who
receives an invoice from an entity they never signed with has no idea who is
asking for money. `branding.test.ts` pins this split.

## Everyday commands

```bash
S360="docker compose -f docker-compose.security360.yml --env-file .env.security360"

$S360 up -d --build     # start, or apply changes
$S360 ps                # what is running
$S360 logs -f api       # follow the API
$S360 logs -f worker    # follow the queue (emails, cron)
$S360 down              # stop, keep the data
$S360 down -v           # stop and DELETE ALL DATA
```

`down -v` destroys the `security360_*` volumes. It cannot touch the primary stack's, because
they are different volumes — that is the point of the isolation test.

## Checking both are up

```bash
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 's360|security360'

curl -s http://localhost:8080/api/v1/health   # {"status":"ok","app":"Security360",…}
curl -s http://localhost/api/v1/health        # {"status":"ok","app":"Security360",…}
```

The health endpoint reports `app`, so it is possible to tell which deployment
answered. Without it, confirming "the stack is up" proves nothing about *which*
stack.

## Migrations and seeding

The API container runs `prisma migrate deploy` from its own entrypoint on every
boot, and compose gates it on the database healthcheck — so there is nothing to
run by hand. Set `S360_SEED_PASSWORD` if this deployment needs seeded accounts to
sign in with; leave it blank in production.

## What the Security360 rebrand kept

The codebase was rebranded from STAP to Security360 (migration
`20260929000001_security360_rebrand_defaults`). New records use the new
prefixes; what was already issued keeps the value it was issued with:

- Guard, client and staff IDs (`SSLG…`, `SSLC…`, `SSLS…`), which are printed on
  ID cards. New ones are `S360G…`, `S360C…`, `S360S…`.
- Invoice numbers (`STAP/INV/…`), letter references, inventory item codes and
  payment references, which appear on client statements, bank statements and
  stock records that already exist. New ones use `S360`.
- Login emails of accounts that already exist, which are people's usernames.
- The repository name and this stack's volumes. Renaming a volume orphans the
  data in it rather than moving it.
