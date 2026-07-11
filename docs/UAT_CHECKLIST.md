# STAP Security — UAT Sign-Off Checklist

**Version:** 1.0  
**Sprint:** 5 (Testing & Documentation)  
**Environment:** Staging — http://185.194.218.245  
**Test Credentials:** See seed users (password: `12345678`)

---

## Instructions

For each item:
- **Pass** — feature works exactly as described
- **Fail** — describe the issue in the Notes column
- **N/A** — not applicable for this session

Sign off at the bottom when all items pass (or agreed deferred items are documented).

---

## 1. Authentication

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 1.1 | Login with valid director credentials | Dashboard loads, role badge shows DIRECTOR | | |
| 1.2 | Login with wrong password | Error message "Invalid credentials" | | |
| 1.3 | Login with GUARD account | Redirected to dashboard with limited sidebar | | |
| 1.4 | Login with CLIENT account | Redirected to /portal | | |
| 1.5 | Navigate to protected page without login | Redirected to /login | | |
| 1.6 | Sign out | Session cleared, redirected to /login | | |

## 2. Guard Management

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 2.1 | Create new guard with all fields | Guard created, guard detail page loads | | |
| 2.2 | Create guard with duplicate National ID | Error "already registered" | | |
| 2.3 | Search guards by name | Filtered list returns | | |
| 2.4 | View guard detail — Personal tab | All personal info visible | | |
| 2.5 | View guard detail — Issued Items tab | Outstanding items listed | | |
| 2.6 | Suspend a guard (with reason) | Status changes to SUSPENDED, disciplinary record created | | |
| 2.7 | Upload a document for a guard | Document appears in Documents tab | | |
| 2.8 | Bulk import via Excel | Guards imported, errors shown inline | | |
| 2.9 | Generate letter (e.g. Appointment Letter) | Letter preview with correct placeholders | | |

## 3. Attendance

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 3.1 | View today's deployment sheet | All deployed guards listed per site | | |
| 3.2 | Mark guard as PRESENT with time-in | Record saved, toast confirms | | |
| 3.3 | Mark guard as ABSENT | Absence recorded | | |
| 3.4 | Field supervisor submits check-in | Check-in recorded with timestamp | | |
| 3.5 | Create roster for a site | Guards assigned, shifts set | | |

## 4. Client Management

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 4.1 | Create new client | Client record created | | |
| 4.2 | Add site to client | Site appears in Clients tab | | |
| 4.3 | Add contract (3 guards @ UGX 800,000) | Monthly value = UGX 2,400,000 shown | | |
| 4.4 | Report incident at a site | Incident recorded | | |
| 4.5 | Client portal — overview loads | Guard count, invoice total, open complaints | | |
| 4.6 | Client submits complaint via portal | Complaint appears in /complaints | | |

## 5. Finance

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 5.1 | Create invoice (3 guards × UGX 800,000) | Subtotal UGX 2,400,000, invoice number STAP/INV/YYYY/XXXX | | |
| 5.2 | Record full payment (BANK) | Invoice status → PAID, badge green | | |
| 5.3 | Record partial payment | Invoice status stays PENDING | | |
| 5.4 | AR Aging report | Invoices bucketed correctly (current / 1-30 / 31-60 / 61-90 / 90+) | | |
| 5.5 | Calculate payroll (current month) | Payroll run created in DRAFT | | |
| 5.6 | Calculate payroll again (same month) | Error "already run for this period" | | |
| 5.7 | Approve payroll run | Status → APPROVED, payslips queued | | |
| 5.8 | Create guard deduction | Deduction appears in guard profile | | |
| 5.9 | Cashbook — add income entry | Entry listed with running balance | | |

## 6. HR Module

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 6.1 | Add applicant (Walk-in source) | Appears in APPLICATION_RECEIVED column | | |
| 6.2 | Advance applicant to SCREENING | Stage column updates | | |
| 6.3 | Reject applicant | Moved to REJECTED column | | |
| 6.4 | Schedule training session | Session appears in Training tab | | |
| 6.5 | Record training results (pass/fail) | Results saved per attendee | | |
| 6.6 | Submit leave request for guard | Request appears in Leave tab | | |
| 6.7 | Approve leave request | Status → APPROVED, balance updated | | |
| 6.8 | Edit letter template (HTML editor) | Changes saved, preview updates | | |

## 7. Inventory

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 7.1 | Create inventory item (UNIFORM) | Item code STAP-INV-XXXX generated | | |
| 7.2 | Issue 2 items to a guard | Stock decremented by 2 | | |
| 7.3 | Return item (RETURNED action) | Stock incremented, transaction recorded | | |
| 7.4 | Mark item as LOST | Deduction created for guard, stock unchanged | | |
| 7.5 | Stock adjustment (+10 units) | Stock increases, STOCK_IN transaction created | | |
| 7.6 | Low Stock tab shows items below threshold | Items highlighted in red | | |

## 8. Settings

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 8.1 | Director views all settings groups | GENERAL / PAYROLL / BILLING / SECURITY / NOTIFICATIONS | | |
| 8.2 | Change NSSF_RATE setting | Value saved, toast confirms | | |
| 8.3 | Create new user (TRAINER role) | Welcome email queued, user appears in Users tab | | |
| 8.4 | Reset user password | Password reset, existing sessions invalidated | | |
| 8.5 | Deactivate a user (not self) | User status → INACTIVE | | |
| 8.6 | ASSISTANT_MANAGER cannot access Settings | Redirected to /unauthorised | | |

## 9. Notifications

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 9.1 | Bell badge shows unread count | Count matches unread notifications | | |
| 9.2 | Mark single notification as read | Badge count decrements | | |
| 9.3 | Mark all as read | Badge disappears | | |

## 10. Complaints

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 10.1 | Director assigns complaint | Status → IN_PROGRESS | | |
| 10.2 | Ops supervisor resolves with resolution text | Status → RESOLVED | | |
| 10.3 | Client notification created on resolution | Notification visible in portal | | |

## 11. Reports

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 11.1 | Director dashboard loads all KPI cards | Guard count, revenue, attendance rate | | |
| 11.2 | Guard performance report | Data for selected month | | |
| 11.3 | Finance summary report | Revenue, payroll, AR totals | | |

## 12. Role-Based Access Control

| # | Test Case | Expected | Result | Notes |
|---|-----------|----------|--------|-------|
| 12.1 | GUARD cannot access /guards list | 403 or redirect | | |
| 12.2 | CLIENT cannot access /finance | 403 or redirect | | |
| 12.3 | ACCOUNTS_OFFICER cannot approve payroll | 403 | | |
| 12.4 | FIELD_SUPERVISOR can access /checkin | 200 | | |
| 12.5 | TRAINER can access /hr | 200 | | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Director / Product Owner | | | |
| Operations Lead | | | |
| Finance Lead | | | |
| IT / QA Lead | | | |

**Deferred items (acceptable for go-live):**

1. 
2. 
3. 

**Go-live authorisation:** ☐ Approved  ☐ Conditional (deferred items above)  ☐ Rejected

Notes:
