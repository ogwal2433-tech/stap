# Contributing to Security360

## 1. Branch Naming

Branches must follow the pattern `<type>/STORY-ID-short-description`:

```
feature/AUTH-004-rbac-middleware
fix/AUTH-001-refresh-cookie-path
chore/INF-002-github-actions-ci
db/INF-003-prisma-schema-init
```

Allowed types: `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `db`, `ci`.

---

## 2. Commit Message Format

```
<type>(<scope>): <short description>
```

**Allowed types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `db`

**Examples:**

```
feat(auth): add TOTP two-factor authentication
fix(api): resolve refresh token rotation race condition
db(schema): add 2FA fields to users table
ci(github): add PR title validation workflow
chore(deps): upgrade bullmq to v5.7
```

Rules:
- Use the imperative mood ("add", not "adds" or "added")
- Keep the subject line under 72 characters
- Reference the story ID in the body when relevant: `Closes AUTH-004`

---

## 3. Pull Request Process

1. Open your PR **against `develop`** (never directly to `main`)
2. **1 approval** required before merging
3. All CI jobs must be green (lint, type-check, test, build)
4. PR title must follow the commit message format above (enforced by CI)
5. Squash-merge into `develop`; `develop` is merged to `main` at release time

---

## 4. Definition of Done

A story is done when **all** of the following are true:

- [ ] Code written and self-reviewed
- [ ] TypeScript compiles with zero errors (`pnpm type-check`)
- [ ] Lint passes with zero warnings (`pnpm lint`)
- [ ] Unit/integration tests written and passing (`pnpm --filter api test`)
- [ ] New API endpoints documented with example curl calls in the PR description
- [ ] PR opened against `develop` and approved by at least one team member
- [ ] CI pipeline green on the PR branch

---

## 5. Running the Project Locally

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/stap-security.git
cd stap-security
pnpm install

# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your local DB and Redis URLs, JWT secrets, etc.

# Generate Prisma client
pnpm --filter api db:generate

# Run migrations
pnpm --filter api db:migrate

# Seed the database
pnpm --filter api db:seed
```

### Running in Development

```bash
pnpm dev
# API → http://localhost:3001
# Web → http://localhost:5173
```

---

## 6. Running Tests

```bash
# Run all API tests once
pnpm --filter api test

# Watch mode (re-runs on file change)
pnpm --filter api test:watch

# With coverage report
pnpm --filter api test:coverage

# Run shared package unit tests (roles utility etc.)
pnpm --filter @security360/shared test
```

CI runs tests against a real PostgreSQL and Redis instance (see `.github/workflows/ci.yml`).  
Do **not** mock the database in integration tests — the CI services spin up real Postgres and Redis containers.

---

## 7. Role Descriptions & Access Matrix

| Role                  | Finance | HR  | Guard Write | Deployments | Attendance | Inventory | Reports |
|-----------------------|---------|-----|-------------|-------------|------------|-----------|---------|
| DIRECTOR              | ✅ Full | ✅  | ✅          | ✅          | ✅         | ✅        | ✅      |
| ASSISTANT_MANAGER     | ✅*     | ✅  | ✅          | View        | ✅         | —         | ✅      |
| ADMINISTRATOR         | —       | —   | —           | View        | Create/Update | ✅     | —       |
| OPERATIONS_SUPERVISOR | —       | —   | View        | ✅ Full     | ✅         | —         | —       |
| FIELD_SUPERVISOR      | —       | —   | View (site) | View        | Mark (site)| —         | —       |
| TRAINER               | —       | —   | View (training) | —       | —          | —         | —       |
| ACCOUNTS_OFFICER      | ✅ Full | —   | —           | —           | —          | —         | ✅      |
| MARKETING             | —       | —   | —           | —           | —          | —         | —       |
| GUARD                 | —       | —   | Own only    | —           | Own view   | —         | —       |
| CLIENT                | Own inv.| —   | Own guards  | —           | —          | —         | —       |

\* ASSISTANT_MANAGER cannot approve Yo! Payments disbursements (Director only).

### Backend enforcement

Use the middleware from `apps/api/src/middleware/rbac.ts`:

```typescript
import { authenticate } from '../middleware/authenticate';
import { requireRole, requireMinimumRole } from '../middleware/rbac';
import { ROLES, FINANCE_ROLES } from '@security360/shared';

// Exact role list
router.get('/payroll', authenticate, requireRole(...FINANCE_ROLES), handler);

// Hierarchy threshold (any role at or above ACCOUNTS_OFFICER)
router.get('/invoices', authenticate, requireMinimumRole(ROLES.ACCOUNTS_OFFICER), handler);
```

### Frontend enforcement

Use `RoleGuard` for conditional UI rendering:

```tsx
import RoleGuard from '@/components/RoleGuard';
import { ROLES, FINANCE_ROLES } from '@security360/shared';

<RoleGuard allowedRoles={FINANCE_ROLES}>
  <PayrollButton />
</RoleGuard>
```

Use `allowedRoles` on `ProtectedRoute` for route-level protection:

```tsx
<Route element={<ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]} />}>
  <Route path="/payroll" element={<PayrollPage />} />
</Route>
```
