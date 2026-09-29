# Security360 — Server Operations Runbook

## Server Details
| Item | Value |
|------|-------|
| IP | 185.194.218.245 |
| OS | AlmaLinux 9 |
| Deploy user | deploy |
| App directory | /var/www/security360 |
| Log directory | /var/log/security360/ |

## Accessing the Server

```bash
ssh -i ~/.ssh/stap_deploy_key deploy@185.194.218.245
```

---

## Docker Commands

### View running containers
```bash
cd /var/www/security360
docker compose ps
```

### View live logs
```bash
# All containers
docker compose logs -f

# API only
docker compose logs -f api

# Last 50 lines from API
docker compose logs api --tail 50
```

### Restart a service
```bash
# Restart API only (zero-downtime for stateless service)
docker compose restart api

# Restart all services
docker compose restart
```

### Full manual deployment
```bash
cd /var/www/security360
git pull origin main
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
curl http://localhost/api/v1/health
```

---

## Database Operations

### Connect to PostgreSQL
```bash
docker compose exec postgres psql -U security360_user -d security360_production
```

### Run migrations manually
```bash
docker compose exec api sh -c "cd apps/api && npx prisma migrate deploy"
```

### Create manual backup
```bash
docker compose exec postgres pg_dump \
  -U security360_user security360_production \
  > /var/backups/security360_manual_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from backup
```bash
# WARNING: This overwrites the current database
docker compose exec -T postgres psql \
  -U security360_user security360_production \
  < /var/backups/security360/security360_backup_YYYYMMDD.sql
```

---

## Backup Schedule

| Frequency | Time | Location | Retention |
|-----------|------|----------|-----------|
| Nightly | 02:00 EAT | /var/backups/security360/ | 30 days |
| Weekly | Sunday 03:00 EAT | /var/backups/security360/weekly/ | 12 weeks |

### Verify latest backup
```bash
ls -lh /var/backups/security360/ | tail -5
```

### Restore dry run (backup verification)
```bash
# 1. Create a test database
docker compose exec postgres psql -U security360_user \
  -c "CREATE DATABASE security360_restore_test;"

# 2. Restore into it
docker compose exec -T postgres psql \
  -U security360_user security360_restore_test \
  < /var/backups/security360/latest.sql

# 3. Verify row counts
docker compose exec postgres psql -U security360_user security360_restore_test \
  -c "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS guards FROM guards;"

# 4. Drop the test database
docker compose exec postgres psql -U security360_user \
  -c "DROP DATABASE security360_restore_test;"
```

---

## Common Incidents

### API not responding (5xx errors)

1. Check API logs: `docker compose logs api --tail 100`
2. Check DB connectivity: `docker compose exec api sh -c "cd apps/api && npx prisma db execute --stdin <<< 'SELECT 1'"`
3. Check Redis: `docker compose exec redis redis-cli ping`
4. Restart API: `docker compose restart api`

### Database connection errors

1. Check postgres container: `docker compose ps postgres`
2. Check disk space: `df -h`
3. View postgres logs: `docker compose logs postgres --tail 50`
4. Restart postgres: `docker compose restart postgres` (brief downtime)

### High memory usage

1. Check container stats: `docker stats --no-stream`
2. Check for zombie jobs: `docker compose logs api | grep -i "bullmq\|queue\|worker"`
3. If workers are stuck: `docker compose restart api`

### Out of disk space

1. Check: `df -h && du -sh /var/backups/security360/*`
2. Prune old backups (keep last 30): `ls -t /var/backups/security360/*.sql | tail -n +31 | xargs rm -f`
3. Prune Docker: `docker system prune -f` (removes stopped containers, dangling images)

---

## Monitoring

### Health endpoint
```bash
curl http://185.194.218.245/api/v1/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Queue dashboard (BullMQ)
Queue status is visible via API logs. No dashboard UI deployed; monitor via:
```bash
docker compose logs api | grep -E "completed|failed|stalled"
```

---

## Environment Variables

Production secrets are stored in `/var/www/security360/.env` (not in git).

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | 32-char minimum — rotate every 90 days |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens |
| `YO_PAYMENTS_API_KEY` | Yo! Payments integration key |
| `SMTP_HOST` / `SMTP_USER` | Email delivery credentials |
| `FRONTEND_URL` | CORS allowed origin |

### Rotating JWT_SECRET

1. Generate new secret: `openssl rand -base64 32`
2. Update `.env` on server
3. Restart API: `docker compose restart api`
4. All existing sessions will be invalidated — users must re-login

---

## CI/CD Pipeline

Pushes to `main` trigger:
1. Lint + type-check
2. Unit + integration tests (with test DB)
3. Build (API + web)
4. Deploy to staging via SSH

Security scans run every Monday at 02:00 UTC via the `security-scan.yml` workflow.

---

## Contacts

| Role | Name | Contact |
|------|------|---------|
| System Admin | Security360 IT | it@security360.co.ug |
| DB Admin | Security360 IT | it@security360.co.ug |
| On-call | Director | director@security360.co.ug |
