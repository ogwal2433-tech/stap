# QA Environment

A full copy of the stack on **port 8000**, isolated from production on 80/443.

Separate database volume, separate Redis, separate network, separate container
names. The two stacks share only the host machine, so QA testing cannot reach
production data even by mistake.

| | Production | QA |
|---|---|---|
| URL | `https://stap.stapsecurity.com` (80/443) | `http://<host>:8000` |
| Compose project | `stap-security` | `security360-qa` |
| Postgres volume | `postgres_data` | `security360_qa_postgres` |
| Uploads volume | `uploads` | `security360_qa_uploads` |
| Network | `stap-network` | `security360_qa_network` |
| Containers | `stap-*` | `s360-*-qa` |

Both stacks build from the **same Dockerfiles**. QA's differences — seeding, the
nginx proxy config — are applied in `docker-compose.qa.yml` as mounts and
overrides. There is deliberately no `Dockerfile.qa`: a parallel copy would drift
from production and QA would stop testing what actually ships.

## First run

```bash
cp .env.qa.example .env.qa
```

Fill in the three required values — compose refuses to start without them:

```bash
QA_POSTGRES_PASSWORD=...
QA_JWT_SECRET=$(openssl rand -base64 48)
QA_JWT_REFRESH_SECRET=$(openssl rand -base64 48)
```

Set `QA_HOST` to the machine QA runs on (`localhost`, or the server IP when
deployed). The API tells the browser its own address from this, so a wrong value
breaks redirects and the payment webhook URL.

```bash
pnpm qa:up          # build and start
pnpm qa:logs:api    # watch migrations and seeding
```

Then open `http://localhost:8000` and sign in with any seeded account, e.g.
`director@stapsecurity.co.ug` / the value of `QA_SEED_PASSWORD`.

## Day to day

```bash
pnpm qa:up          # start (rebuilds changed layers)
pnpm qa:down        # stop, keeping data
pnpm qa:status      # what is running
pnpm qa:logs        # all services
pnpm qa:logs:api    # API only — also qa:logs:web, qa:logs:worker
pnpm qa:rebuild     # force-recreate after code changes
pnpm qa:shell:api   # shell inside the API container
pnpm qa:shell:db    # psql on the QA database
pnpm qa:config      # render the resolved compose file (catches env mistakes)
```

## Resetting

```bash
pnpm qa:reset       # drops the QA volumes, rebuilds, re-seeds
```

This destroys **QA** data only — production volumes have different names and are
not touched.

Note that a normal restart does **not** reset anything. The seed is built from
upserts and deletes nothing, so it tops up missing rows and leaves a tester's
work alone. `qa:reset` is the only clean slate. Set `QA_SKIP_SEED=true` to keep a
hand-built dataset across restarts.

## What runs

| Service | Container | Why it is there |
|---|---|---|
| postgres | `s360-postgres-qa` | QA database, own volume |
| redis | `s360-redis-qa` | queue backend |
| api | `s360-api-qa` | migrates, seeds, serves `/api` |
| worker | `s360-worker-qa` | drains the BullMQ queue |
| web | `s360-web-qa` | serves the frontend, proxies `/api`, publishes 8000 |

The **worker matters**. Audit entries, emails and SMS are queued rather than
written inline. Without it they are enqueued and never processed — the audit log
would stay empty and no notification would arrive, making QA look broken in ways
production is not.

## Safety

- **Payments** — `QA_XCEL_*` are blank by default, so the gateway is not called
  and a QA run cannot move real money. Use sandbox credentials only.
- **Email** — `QA_SMTP_*` blank means the API logs messages instead of sending
  them. The seed carries real-looking addresses, so point this at a catcher such
  as Mailtrap rather than a live SMTP server.
- **Tokens** — QA JWT secrets must differ from production, so a token minted in
  QA is never accepted by production.
- `.env.qa` is gitignored. QA is plain HTTP with a shared seeded password; never
  put production credentials in it.

## Deploying QA to the VPS

```bash
cd /var/www/stap-security
git pull origin develop

nano .env.qa                     # QA_HOST=<server ip>, plus the three secrets
pnpm qa:up
pnpm qa:status
```

Open port 8000:

```bash
ufw allow 8000/tcp               # or:
firewall-cmd --add-port=8000/tcp --permanent && firewall-cmd --reload
```

QA is then at `http://<server-ip>:8000`. Production on 80/443 is unaffected —
different containers, volumes and network.

## Checks after starting

```bash
pnpm qa:status                                  # all five up, postgres/redis healthy
curl -s http://localhost:8000/api/v1/health     # API reachable through nginx
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"director@stapsecurity.co.ug","password":"12345678"}'
```

To prove the databases are independent, compare row counts — the numbers should
move independently:

```bash
docker exec s360-postgres-qa psql -U s360_qa -d s360_qa -c 'SELECT COUNT(*) FROM "User";'
docker exec stap-postgres     psql -U stap_user -d stap_production -c 'SELECT COUNT(*) FROM "User";'
```
