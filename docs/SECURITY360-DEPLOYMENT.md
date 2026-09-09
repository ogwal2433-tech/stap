# Security360 — a second branded deployment

Security360 is the same software as STAP Security, deployed a second time under
a different name, with its own database. Both run on one host at the same time
and share nothing but the machine.

The brand is configuration, not a fork. There is one codebase, one set of
Dockerfiles, and one `develop` branch; what differs is a handful of environment
variables. This matters because the product was renamed to Security360 once
before and renamed back (`50c1327`, `15c1158`) — a rename that edits constants
forces that churn on every deployment at once, and cannot produce two names on
one server.

## Ports

| Service    | STAP (existing) | QA        | Security360 |
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

|            | STAP                    | Security360               |
|------------|-------------------------|---------------------------|
| Project    | *(directory name)*      | `security360`             |
| Containers | `stap-*`                | `security360-*`           |
| Volumes    | `postgres_data`, …      | `security360_postgres`, … |
| Network    | `stap-network`          | `security360_network`      |
| Database   | `stap_production`       | `security360`             |

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
  own image. An unset argument silently produces STAP branding, which is exactly
  what the STAP stack wants.

Both resolve through `resolveBranding()` in `packages/shared/src/constants/app.ts`.
Unset, everything falls back to `STAP Security` — so this whole mechanism existing
does not change the original deployment.

### The product name and the company name are separate

```
APP_NAME      the software      tab, sidebar, login screen, API docs, email subjects
COMPANY_NAME  the legal entity  invoices, contracts, letters, ID cards, client notices
```

`S360_COMPANY_NAME` is **blank by default**, which keeps `STAP Security Ltd`.

That is correct if Security360 is the same business under a new product name,
and wrong if it is a different company. Set it only when this deployment bills
its own clients under its own name — a client who signed with STAP Security Ltd
and receives an invoice from someone else has no idea who is asking for money.
`branding.test.ts` pins this split.

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

`down -v` destroys the `security360_*` volumes. It cannot touch STAP's, because
they are different volumes — that is the point of the isolation test.

## Checking both are up

```bash
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'stap|security360'

curl -s http://localhost:8080/api/v1/health   # {"status":"ok","app":"Security360",…}
curl -s http://localhost/api/v1/health        # {"status":"ok","app":"STAP Security",…}
```

The health endpoint reports `app`, so it is possible to tell which deployment
answered. Without it, confirming "the stack is up" proves nothing about *which*
stack.

## Migrations and seeding

The API container runs `prisma migrate deploy` from its own entrypoint on every
boot, and compose gates it on the database healthcheck — so there is nothing to
run by hand. Set `S360_SEED_PASSWORD` if this deployment needs seeded accounts to
sign in with; leave it blank in production.

## Deliberately not renamed

Following the reasoning recorded in `15c1158`:

- The `@stap/shared` package name, the `stap-security` repository, and existing
  infrastructure identifiers. These are not display text, and renaming a volume
  orphans the data in it rather than moving it.
- The `@stapsecurity.co.ug` mail domain and the seed logins on it.
- Inventory SKUs (`STAP-UNI-*`) and the payroll narration (`STAP-SAL-*`), which
  appear on bank statements and in stock records that already exist.
- Anything a guard or client reads, which names the company, not the product.
