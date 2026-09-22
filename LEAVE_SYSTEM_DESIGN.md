# Leave, Staff Identity & Attendance Policy — System Design

> Status: **Approved design** (Sept 2026). This document is the source of truth for the redesigned staff leave workflow, self-service sign-up, dynamic leave quotas and the automatic late-arrival policy. Implementation tracks this spec; update the doc when behaviour changes.

---

## 1. Overview

Three subsystems, one data model:

1. **Staff identity & sign-up** — teachers _and_ office staff. No hand-picked usernames; identity is the **NIC (unique index)**, the login username is **auto-generated**.
2. **Leave management** — staff apply for leave by type; the **Deputy Principal recommends**, the **Principal approves**; quotas are **dynamic per academic year** (stored in the database, never hard-coded).
3. **Attendance policy** — automatic late-arrival handling: before the cut-off the teacher is present; after it, a **short leave** (limited per month) or a **half day** is recorded. Policy numbers live in the DB and change per year without code edits.

---

## 2. Staff categories & hierarchy

| Category | Positions (per academic year, `staff_position`) | Powers |
| --- | --- | --- |
| `teacher` | `teacher`, `sectionalHead`, `headOfDepartment` | Apply for leave, view own record |
| `officeStaff` | office roles | Apply for leave, view own record |
| Leadership | `vicePrincipal` / `assistantPrincipal` (**Deputy Principal**) | **Recommend** (or reject) leave requests |
| Leadership | `principal` | **Approve / reject** leave requests (final) |

- `staff` table gains a **`staffCategory`** column: `"teacher" | "officeStaff"`.
- Authority is **derived from `staff_position` for the current academic year** — no new better-auth roles are introduced. An admin user still exists for setup/bootstrap.
- The Deputy Principal's act is a **recommendation**; the request is only **finalised** when the Principal has acted.

### Approval chain state machine

```
pending            → deputy recommended  → approved (final)
pending            → deputy recommended  → rejected (final)
pending            → deputy rejected     → rejected (final)   # principal sees it, can still overturn → approved
pending            → (deputy has not acted yet; principal may act early = implicit skip)
```

Stored per request:

- `deputyStatus`: `pending | recommended | rejected`, `deputyStaffId`, `deputyActedAt`
- `finalStatus`: `pending | approved | rejected`, `principalStaffId`, `principalActedAt`
- `finalizedAt` — set when the Principal acts; from then on the request is **locked**.
- Owner may `cancel` while not yet finalised.

---

## 3. Leave quotas — dynamic, per year, in the database

**Never hard-coded.** A new table `leave_entitlement`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK |  |
| `academicYearId` | text FK → academic_year | cascade on delete |
| `leaveType` | text | `medical`, `annual`, `casual`, `maternity`, `duty`, `other` |
| `maxDays` | numeric | e.g. `21` medical + `20` other = **41 total** (2026 default seed) |
| `minDays` | numeric | floor used for validation/warnings (default 0) |
| unique |  | `(academicYearId, leaveType)` |

- Seed procedure: creating an academic year inserts one row per leave type with the **defaults for that year, editable afterwards** (e.g. next year 46 or 47 total — just edit `maxDays` in the DB/admin UI, **zero code changes**).
- Consumption: `leave_balance` is **derived**, never stored as an absolute: `used = SUM(approved days for staff+year+type)`, `remaining = maxDays − used`. Historical years keep their own entitlement rows, so past data is never corrupted.

---

## 4. Staff identity & sign-up

### Identity rules

- **NIC is the unique index** on `staff` (already `unique`; now the canonical identity).
- **The NIC itself is the username** (lowercased, so `991234567V` and `991234567v` are the same account). Nothing is generated, nothing to remember — one NIC, one person, one account (the unique index enforces this). Sign-in stays username + password.
- Email is **provided by the staff member at sign-up** (their own address).

### Sign-up flows (two pages)

1. **Staff sign-up** (`/signup`) — self-service: name, NIC, email, phone, category (`teacher` / `officeStaff`). Creates `user` (role `teacher`) + `staff` row linked via `staff.user_id`, password set at sign-up. Pending admin verification of employment details is a UI concern, not a blocker.
2. **Leadership/admin sign-up** (`/signup/admin`) — for **Deputy Principals and the Principal**. Requires an **invitation/setup code** from env (`LEADERSHIP_SETUP_CODE`) so it cannot be used by randos; creates the account with leadership position access.

Both flows reuse `createStaffCredential` in `packages/auth` with the **NIC as the username**; duplicate NICs are rejected with a clear error (unique index backstop).

---

## 5. Attendance — automatic late-arrival policy

### Policy storage (dynamic, per year)

Table `attendance_policy` — **one row per academic year**:

| Column | Type | Default (2026) |
| --- | --- | --- |
| `arrivalCutoffTime` | text `HH:MM` | `07:30` — school start cut-off |
| `shortLeavesPerMonth` | integer | `2` |
| `halfDaysPerMonth` | integer | `2` (short-leave pool exhausted ⇒ half day) |
| `halfDaysPerFullDay` | numeric | `2` (1 full leave day = 2 half days; 21 days = 42 half days) |

Changing the policy edits the row for that year — **history is untouched** because consumption is recorded in separate usage rows, not by mutating the policy.

### Usage records (append-only, so history never corrupts)

Table `short_leave_usage` — one row per (staff, year-month) **created on demand**:

| Column | Type |
| --- | --- |
| `staffId`, `academicYearId`, `yearMonth` (`YYYY-MM`) |  |
| `shortLeavesUsed` | integer, increments only |
| `halfDaysUsed` | numeric, increments by 0.5 |
| unique | `(staffId, yearMonth)` |

`current = usage row`, `maximum = policy row for that year` — the "min/max/current" pattern the policy requires, with usage never rewritten (only incremented).

### Automatic marking rule (server-side, in the attendance marking procedure)

Given arrival time `T` and cut-off `C` (from that year's policy):

1. `T ≤ C` → mark **present** (full day).
2. `C < T` and short leaves used that month `< shortLeavesPerMonth` → auto-record a **short leave** (increment `shortLeavesUsed`) and mark present-with-note.
3. `C < T` and the monthly short-leave pool is exhausted → record a **half day** (increment `halfDaysUsed` by 0.5). Deduction from leave entitlement uses `halfDaysUsed / halfDaysPerFullDay` full-day equivalents.
4. Everything is recorded with the **policy values of that academic year**, so changing next year's numbers can never rewrite this year's records.

---

## 6. Data model changes (delta)

```text
packages/db/src/schema/staff.ts        + staffCategory ("teacher" | "officeStaff")
packages/db/src/schema/leaves.ts       + leaveEntitlement (per year × type, maxDays)
                                       ~ leaveRequest: two-step approval columns
                                       + leaveBalanceProcedure (derived, no table)
packages/db/src/schema/attendance.ts   + attendancePolicy (per year)
                                       + shortLeaveUsage (per staff × month)
packages/auth/src/admin.ts             ~ username auto-generation helpers
packages/api/src/routers/staff/        + signup flows, entitlement CRUD,
                                         leadership review chain procedures
apps/web/src/routes/                   + /signup, /signup/admin pages
```

---

## 7. Open decisions (defaults chosen; flagged for the user)

1. **Quota split** — 2026 seeded as **medical 21 + other categories 20 each** (41 total across medical+annual). Exact per-type numbers editable in `leave_entitlement`.
2. **Deputy reject ⇒ final?** — default: deputy rejection rejects, but the Principal can still overturn (approve) afterwards.
3. **Late-but-present grace** — none by default (a second past 07:30 is already a short leave), as specified.
