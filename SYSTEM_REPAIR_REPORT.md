# System Repair Report

**System:** St. Aloysius' College — School Management System **Repair date:** 1 October 2026 **Input:** `SYSTEM_FORENSIC_AUDIT.md` (findings F-01 … F-41) **Branch:** `repair/forensic-audit-2026-10`, based on `origin/master` at `216fa73` **State:** all changes are in the working tree; nothing is committed or pushed.

Every claim marked **verified** below was demonstrated by an automated test against a real PostgreSQL database, by running the production build, or both. Where something could not be verified, this report says so.

---

## 1. Executive summary

- All three P0 findings are fixed and verified:
  - F-01: privilege escalation through better-auth's admin endpoints.
  - F-02: the migration history could not build a database.
  - F-03: a committed credential was in live use.
- Of the P1 items still present on the current tree, all are fixed except:
  - **email delivery (F-12)**, which is ready in code but needs a mail provider account;
  - **F-13**, which is fixed for its most serious part (the Leave Administrator can now set quotas), while its other API-only features remain.
- The repository now has **114 automated tests** (it had none). All pass, against throwaway databases.
- The original code was tested with the same tests: **12 of 12 key tests failed** there, which proves the defects were real.
- The **production build** was started and tested over HTTP: **13 of 13 checks passed**.
- Lint, typechecks, the production build, migrating an empty database from zero, and the schema drift check all pass.
- Six **new** defects were found and fixed during the repair (§3).

**The system is not yet production-ready.** The remaining blockers are listed in §19.

---

## 2. How the work was done

1. Inspected the repository state. Remote `master` was 5 commits ahead of the audited revision. It was fast-forwarded; the one uncommitted file (`admin-users-content.tsx`) was not touched by those commits and was kept.
2. Created the branch `repair/forensic-audit-2026-10`.
3. For each finding: re-read the current code, reproduced the defect, fixed it, wrote a regression test, ran the test against the original code to prove it fails there, then ran it against the fix.
4. Every database test runs on a scratch database (`test_<random>`, `migrate_check_<n>`, …) created on the local PostgreSQL 17 server and dropped afterwards. **The existing databases were never modified**, apart from the credential rotation in §8.

---

## 3. New issues discovered during the repair

| ID | Issue | Fix |
| --- | --- | --- |
| NEW-F-01 | Upstream migration `0008` ran `DROP TABLE … CASCADE` on the loan and custody-request tables. That destroyed loan history, and it could never upgrade a database holding any (the old ledger actions violated its new CHECK). | 0008 now stops while any loan is still open, archives closed history to `archived_0008_*`, and keeps `borrowed`/`returned` legal as historical ledger actions. |
| NEW-F-02 | The protection against banning or re-roling seeded accounts **never worked**. The administrator could ban the Principal's account. better-auth calls `databaseHooks.user.update` with only the changed fields: no user id, no request context. | Protection moved into the endpoint guard, which can see the target account. The dead hook was replaced by one that works with the data it actually receives. |
| NEW-F-03 | `seed:full` ran `TRUNCATE … CASCADE` on every table, accounts included, with no confirmation and no production guard. | It now requires `CONFIRM_RESET_DATABASE=<database name>` and refuses when `NODE_ENV=production`. |
| NEW-F-04 | Both seed scripts wrote bad data. They used an unpadded date (`2024-01-6`, which sorts after `2024-01-09` as text), and their date helper mixed local and UTC time. | Dates are now zero-padded and computed in UTC, with a calendar check. This was caught by the new `leave_request_date_order` CHECK. |
| NEW-F-05 | better-auth swallows mail-send errors, so with no mail transport configured, users were told a code had been sent (HTTP 200) when nothing was sent. | The code-sending endpoints now return 503 when no transport is configured. |
| NEW-F-06 | Both seeds created inventory whose stock counts disagreed with the ledger. The demo seed wrote no ledger rows at all; the full seed wrote disposal ledger rows without changing the stock count. | Both now write correct ledger rows. A reconciliation check runs in the tests. |

**Audit findings that were outdated or wrong on the current tree:**

- The 4 `react(purity)` lint errors (F-37) had already been fixed upstream.
- Custody `decide` (F-13) and the student loan picker (F-23) are not needed: upstream removed peer custody requests and dated loans.
- The leadership positions screen (F-13) now exists upstream.
- Most of the upload fix (F-05) was already done upstream: images re-encoded to WebP, a private MinIO bucket, presigned reads.
- `develop` had already been merged.

---

## 4. Change register

| ID | Issue | Root cause | Fix | Main files | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Principal, Deputy and Academic Admin could create admins, set any password, impersonate and delete accounts | Every role was given better-auth's full `adminAc`; only `user.update` was guarded | Least-privilege permissions; guard on every `/admin/*` call; audit log; `adminRoles`; public sign-up endpoint closed | `auth/src/permissions.ts`, `admin-endpoint-guard.ts`, `index.ts`, `roles.ts` | auth-escalation (15) | FIXED |
| F-02 | A fresh database failed at migration 0007 | Corrupted 0006 snapshot | Snapshot repaired; drops made `IF EXISTS` for both name variants | `0006_snapshot.json`, `0007_*.sql` | verify-migrations, check-schema-drift | FIXED |
| F-03 | Live password equal to the committed example | Example file held real-looking values | Example values blanked; boot refuses weak or published passwords; credential rotated | `.env.example`, `seat-password-policy.ts`, `admin.ts` | seat-password-policy (4), runtime smoke | FIXED |
| F-04 | Comments said seat passwords re-sync on boot | Comments drifted from the code | One policy ("initial password only") plus a rotation script | `roles.ts`, `services.server.ts`, `index.ts`, AGENTS.md | — | FIXED |
| F-05 | Unsafe uploads | Body buffered before the size check; decoded format and pixel count never checked | Length checked first; decoded-format allow-list; 50 MP cap | `apps/web/src/lib/image-upload.ts`, `files.upload.ts` | image-upload (11), runtime smoke | FIXED |
| F-06 | Unique conflicts returned HTTP 500 | Matched on error text, which drizzle 0.45 no longer includes | Read the database error code; base-procedure safety net returns 409/400 | `lib/db-errors.ts`, `api/src/index.ts`, 7 routers | error-handling, academic-integrity, runtime smoke | FIXED |
| F-07 | Leave quota could be exceeded; cancelled requests could be approved | Only approved days counted; no re-check at approval; no locks | Pending days reserved; approval re-checks under a row lock; state guards | `leaves/quota.ts`, `apply-leave.ts`, `leadership-review.ts`, `cancel-leave.ts`, `entitlements.ts` | leave (13) | FIXED |
| F-08 | Creating a year could leave it half-built | Four separate inserts | One transaction; shared `openAcademicYear()`; duplicate year returns 409 | `create-academic-year.ts` | academic-integrity (failure injected) | FIXED |
| F-09 | Two years could be current at once | Nothing in the database prevented it; the switch wasn't atomic | Partial unique index; closed years can't be current; transaction plus advisory lock | `schema/staff.ts`, 0009, `set-current-year.ts` | academic-integrity (race test) | FIXED |
| F-10 | Former leaders kept leadership roles | Reconciliation looked only at people with a position in the new year | One reconciler over the union of leadership roles and position holders; never touches admin or seeded accounts | `set-current-year.ts`, `assign-position.ts`, `remove-position.ts` | academic-integrity | FIXED |
| F-11 | Seed broken and unsafe | Duplicated domain logic | Uses `openAcademicYear`; transactions; production guard; `dotenv` dropped | `scripts/seed.ts` | seed (5) | FIXED |
| F-12 | Email throws in production | No transport existed | Transport layer (console / Resend over HTTP); 503 when not configured | `auth/src/email.ts`, `mail-guard.ts`, `.env.schema` | email (6), runtime smoke | PARTIALLY FIXED (blocked: needs a provider account) |
| F-13 | Workflows with no UI | Backend built ahead of UI | Leave quota editor added | `leave-entitlements-card.tsx`, two leave routes | typecheck, build | PARTIALLY FIXED |
| F-14 | 0007 had no backfill | Generated schema change without a data step | Backfill plus a check that stops with counts | `0007_*.sql` | baseline check on the live DB | FIXED |
| F-15 | Deletes always refused; seeded accounts deletable | Rows the system creates itself counted as history | Auto-created rows excluded; seeded and admin accounts protected | `delete-staff.ts`, `delete-academic-year.ts` | academic-integrity | FIXED |
| F-16 | No tests | — | Integration harness on real PostgreSQL; 114 tests | `packages/*/test`, `apps/web/test` | all | FIXED (no browser end-to-end tests yet) |
| F-17 | Multi-row writes not atomic | No concurrency design outside inventory | Transactions and state-checked updates in 9 procedures | create-staff, signup, teacher-requests, assign-class-teacher, marking ×2, … | signup, academic-integrity, leave | FIXED |
| F-18 | Purged sign-ups left orphan staff rows holding the NIC | Delete cascade direction | Purge deletes the applicant's staff row in the same transaction | `auth/src/admin.ts` | signup | FIXED |
| F-19 | Public sign-up abusable | Outside better-auth's protections | Rate limit (5 per address / 60 overall per hour); 12-character minimum | `signup.ts`, `rate-limit.ts`, `primitives.ts`, signup form | signup (6) | PARTIALLY FIXED |
| F-20 | UTC or server-local "today" | No time-zone policy | `schoolToday()` in Asia/Colombo; `TZ=UTC` pinned | `db/src/dates.ts`, `inventory-calculations.ts`, `get-policy.ts`, dashboard | dates (3 boundary tests) | PARTIALLY FIXED |
| F-21 | Invalid dates accepted | Format-only validation | Real calendar check everywhere; day counting throws on bad dates | `db/src/dates.ts`, `primitives.ts`, `constants/leave.ts` | dates (20), leave | FIXED |
| F-22 | Closed years writable through the API | Rule enforced only by the route guard | Database trigger raises `YR001`, mapped to 409 | 0010 | academic-integrity | FIXED |
| F-23 | Student loan picker | Feature removed upstream | — | — | — | NOT REQUIRED |
| F-24 | Unbounded list endpoints | — | — | — | — | NOT FIXED |
| F-25 | QR export unbounded; origin taken from the client | Missing bounds | 500 items / 2,000 labels; server-configured origin | `export-qr-sheet.ts` | export-import-bounds | FIXED |
| F-26 | Excel zip bomb | Row cap applied after unpacking | Central-directory check before unpacking | `lib/zip-guard.ts`, `excel-import.ts` | export-import-bounds (real 60 MB bomb) | FIXED |
| F-27 | State held in process memory | Single-instance design | Documented | `docs/operations.md` | — | NOT FIXED (documented) |
| F-28 | Unsafe deploy | Template leftovers | Migrate on start; loopback-only ports; `TZ`; backup runbook; dead secret mount removed | `Dockerfile`, `docker-compose.yml`, `scripts/migrate.mjs` | `migrate.mjs` run twice under Node | PARTIALLY FIXED (Docker unverified) |
| F-29 | CI ran lint only and auto-pushed fixes | — | Lint, migrations from zero, drift, tests on PostgreSQL 18, build; no auto-push; read-only permissions | `.github/workflows/ci.yml` | reproduced locally | FIXED (not yet run on GitHub) |
| F-30 | Documentation said false things | — | AGENTS.md corrected; `docs/operations.md` added | AGENTS.md | — | FIXED |
| F-31 | No database CHECKs | Validation only in valibot | Leave and timetable CHECKs | 0009, `leaves.ts`, `periods.ts` | leave (raw-insert test) | FIXED |
| F-32 | History tables cascade-delete | — | Race closed with row locks; cascades kept | `delete-staff.ts` | academic-integrity | PARTIALLY FIXED |
| F-33 | Bun version mismatch | — | `.bun-version`; CI pinned to 1.4.0 | `.bun-version`, `ci.yml` | `npx bun@1.4.0 install --frozen-lockfile` | FIXED (local Bun is still 1.3.13) |
| F-34 | Raw errors with personal data in logs | No logging design | Structured JSON lines; request id; database code only | `lib/log.ts`, `rpc/$.ts` | error-handling, runtime smoke | FIXED |
| F-35 | N+1 queries; pool starvation | Row-at-a-time code | Set-based attendance write; sequential checks in one transaction | `leadership-review.ts`, delete-* | leave | FIXED |
| F-36 | Uncommitted React key fix | — | Kept in the working tree | — | — | NOT COMMITTED |
| F-37 | `react(purity)` lint errors | — | Already fixed upstream | — | — | NOT REQUIRED |
| F-38 | Stale tree | — | Pulled to current `master` | — | — | FIXED |
| F-39 | Oversized components | — | `InventoryTable` brought under the size limit | `inventory-table.tsx` | lint | PARTIALLY FIXED |
| F-40 | Dead code; new connection pool per purge run | — | Pool leak fixed; removing `@orpc/zod` **declined** | `purge-unverified.ts` | — | PARTIALLY FIXED |
| F-41 | API reference had empty schemas and was public | Wrong converter | Valibot converter; not served in production | `rpc/$.ts`, `lib/openapi.ts` | runtime smoke | FIXED |
| NEW-F-01…06 | See §3 |  |  |  | see §3 | FIXED |

---

## 5. Files changed

**Modified (69):**

```
.github/workflows/ci.yml                          AGENTS.md
apps/web/.env.example                             apps/web/.env.schema
apps/web/Dockerfile                               apps/web/tsconfig.json
apps/web/server/tasks/accounts/purge-unverified.ts
apps/web/src/components/admin/admin-users-content.tsx   (pre-existing uncommitted fix)
apps/web/src/components/signup/signup-form.tsx    apps/web/src/components/signup/signup-schema.ts
apps/web/src/components/staff/inventory/inventory-dashboard.tsx
apps/web/src/components/staff/inventory/inventory-table.tsx
apps/web/src/components/staff/leave-management/leave-request-format.ts
apps/web/src/context.ts                           apps/web/src/services.server.ts
apps/web/src/routes/_auth/admin/$year/staff/leaves.tsx
apps/web/src/routes/_auth/leave-admin/$year/staff/leaves.tsx
apps/web/src/routes/api/files.upload.ts           apps/web/src/routes/api/rpc/$.ts
docker-compose.yml                                package.json
packages/api/src/context.ts                       packages/api/src/index.ts
packages/api/src/lib/excel-import.ts
packages/api/src/routers/inventory/{create-issue,create-item,export-qr-sheet,finalize-disposal,inventory-calculations}.ts
packages/api/src/routers/marking/{assign-student-to-class,set-subject-selection}.ts
packages/api/src/routers/staff/{assign-class-teacher,assign-position,create-academic-year,create-staff,
  delete-academic-year,delete-staff,remove-position,set-current-year,signup,teacher-requests,update-staff}.ts
packages/api/src/routers/staff/attendance/get-policy.ts
packages/api/src/routers/staff/leaves/{apply-leave,cancel-leave,entitlements,leadership-review}.ts
packages/api/src/routers/staff/periods/{assign-teacher-to-period-subject,create-class-period-subject}.ts
packages/auth/src/{admin,email,index,permissions,roles}.ts
packages/db/src/constants/{inventory,leave}.ts
packages/db/src/migrations/{0007_quiet_mother_askani,0008_organic_daimon_hellstrom}.sql
packages/db/src/migrations/meta/{0006_snapshot,0008_snapshot,_journal}.json
packages/db/src/schema/{auth,inventory,leaves,periods,primitives,staff}.ts
scripts/seed.ts                                   scripts/seed-comprehensive.ts
```

**New (39):**

```
.bun-version  .gitattributes  docs/operations.md  SYSTEM_REPAIR_REPORT.md
apps/web/src/lib/image-upload.ts
apps/web/src/components/staff/leave-management/leave-entitlements-card.tsx
packages/api/src/lib/{db-errors,inventory-reconciliation,log,openapi,rate-limit,zip-guard}.ts
packages/api/src/routers/staff/leaves/quota.ts
packages/auth/src/{admin-endpoint-guard,mail-guard,seat-password-policy}.ts
packages/db/src/dates.ts
packages/db/src/migrations/{0009_harden_invariants,0010_closed_year_read_only}.sql
packages/db/src/migrations/meta/{0009,0010}_snapshot.json
scripts/{baseline-existing-db,check-schema-drift,reconcile-inventory,rotate-seat-password,
  runtime-smoke,verify-migrations}.ts
scripts/migrate.mjs
packages/api/test/support/harness.ts
packages/api/test/{academic-integrity,auth-escalation,error-handling,export-import-bounds,
  inventory-reconciliation,leave,seed,signup}.test.ts
packages/auth/test/{email,seat-password-policy}.test.ts
packages/db/test/dates.test.ts
apps/web/test/image-upload.test.ts
```

**Changed outside the repository (not committed):**

- `apps/web/.env`:
  - `ACADEMIC_ADMIN_PASSWORD` rotated to a new random value (never printed);
  - `LEAVE_ADMIN_PASSWORD` / `LEAVE_ADMIN_NAME` and the six `MINIO_*` local-development values added, because the current code requires them.
  - The previous file is backed up at `C:\tmp\env-backup\web.env.2026-10-01`.
- Live dev database: the `academic-admin` password hash was replaced and its 3 sessions revoked.

---

## 6. Database changes

| Object | Change | Migration |
| --- | --- | --- |
| `account_audit_log` | New table: actor, role, action, target, outcome, detail. The user ids are deliberately not foreign keys, so the record survives deletion of either account. | 0009 |
| `academic_year_single_current` | Partial unique index: at most one current year | 0009 |
| `academic_year_current_not_deleted` | CHECK: a closed year can't be current | 0009 |
| `leave_request_*_check` (6) | CHECKs on status, deputy status, final status, day part, payment status, type | 0009 |
| `leave_request_date_order` | CHECK `start_date <= end_date` | 0009 |
| `leave_request_staff_year_idx` | Composite index for the quota and overlap queries | 0009 |
| `class_period_subject_day_range` / `_period_range` | CHECKs: day 1–5, period 1–8 | 0009 |
| `assert_academic_year_writable()` + triggers on 16 tables | A closed year is read-only (`YR001`) | 0010 |
| `inventory_transaction_action_check` | Still allows legacy `borrowed`/`returned` | 0008 (edited) |

All schema changes are reflected in `schema/*.ts`, and `drizzle-kit generate` reports no drift.

## 7. Migration changes

- **0006 snapshot:** 25 foreign-key records that pointed at `user(id)` (from a reverted branch) were corrected to `staff(id)`, copied from the 0005 snapshot.
- **0007:**
  - every constraint drop is now `IF EXISTS` for both name variants;
  - the seeded seats' NICs (`000000000001`–`6`) are backfilled;
  - inventory items with no owner or holder are assigned to the Inventory Administrator;
  - a NULL or malformed NIC on a real person stops the migration with a count.
- **0008:** stops while loans are open; archives closed history; keeps legacy ledger actions legal.
- **0009 / 0010:** new; see §6. Both start with checks that stop and change nothing.
- **Why editing applied migrations is safe:** drizzle's migrator only compares the last recorded `created_at`, so a database that has already applied a migration never re-reads it. This was confirmed in `drizzle-orm/pg-core/dialect.js`.
- **New tools:**
  - `scripts/verify-migrations.ts`: builds an empty database from zero.
  - `scripts/check-schema-drift.ts`: fails on schema/snapshot drift. It was confirmed to fail on a stale snapshot, so it isn't a vacuous gate.
  - `scripts/migrate.mjs`: runs migrations when the container starts.
  - `scripts/baseline-existing-db.ts`: for databases built with `push`, which have no migration ledger.

---

## 8. Security changes

- **Permissions:** better-auth's admin plugin grants are cut to `user: list, get, ban` and `session: list, revoke`, on `admin` and `academicAdmin` only. Principal and Deputy hold none.
- **`adminEndpointGuard`:**
  - refuses `create-user`, `set-user-password`, `remove-user`, `impersonate-user`, `set-role` and `update-user` for everyone;
  - lets only `admin` act on privileged or seeded accounts;
  - stops anyone banning or changing a seeded account;
  - audits every decision.
- **Credentials:** `.env.example` holds no secrets. Boot refuses passwords shorter than 12 characters or matching any of the 6 values ever committed (stored as SHA-256 hashes only). The leaked credential was rotated.
- **Uploads:** `Content-Length` is checked before parsing; the decoded format must be on the allow-list; a 50 MP pixel bound; images are always re-encoded.
- **Public sign-up:** rate limited, 12-character minimum, atomic.
- **QR labels:** they use the server's own origin, not one supplied by the caller.
- **Excel import:** zip-bomb check before unpacking.
- **Logs:** no SQL and no parameters; database code and constraint name only.
- **API reference:** not served in production.
- **Infrastructure:** PostgreSQL and MinIO are published on 127.0.0.1 only; the CI workflow has `contents: read`, and the bot that auto-pushed commits is removed.

## 9. Authentication changes

- `emailAndPassword.disableSignUp: true`. Self-registration is the app's own `signupStaff`.
- `databaseHooks.user.create` refuses any role other than `user`. `user.delete` refuses seeded or privileged accounts. `user.update` refuses role writes other than `teacher`/`user`.
- `mailAvailabilityGuard` returns 503 on the four code-sending endpoints when no mail transport is configured.
- Seat passwords are initial-only; `scripts/rotate-seat-password.ts` rotates one and revokes its sessions.

## 10. Authorization changes

| Seat | better-auth admin plugin | Can act on privileged/seeded accounts |
| --- | --- | --- |
| admin | list, get, ban; session list, revoke | yes, but can never ban or change a seeded seat |
| academicAdmin | list, get, ban; session list, revoke | no |
| principal, vicePrincipal | none (were: full `adminAc`) | no |
| every other role | none | no |

Year-scoped writes to a closed year are refused by the database, whichever procedure is called.

## 11. Business logic changes

- **Leave:**
  - Filing reserves days: pending, recommended and approved all count.
  - Approval re-checks against approved days.
  - The teacher's row is locked `FOR UPDATE` while applying and approving.
  - Only `pending`/`recommended` requests can be decided.
  - Recommend and cancel are conditional on the request's current state.
  - Weekend-only requests are refused.
  - The balance now reports `pendingDays`, and `remainingDays` is the figure the server checks.
- **Academic years:** atomic creation; transactional switching under an advisory lock; one role reconciler; a closed year can't be made current.
- **Deletes:** the auto-created `teacher` position no longer counts as history; seeded and administrative staff can't be deleted.
- **Staff creation and approval:** atomic; a duplicate login returns 409 instead of 500.
- **Homeroom assignment:** refuses if the homeroom changed while you were editing (stale predecessor).

## 12. Algorithms used in the repair

Each algorithm below is in the code today. "Why" is the defect it answers. _n_, _d_, _r_ and _e_ are defined per row.

### 12.1 Summary of changes to existing algorithms

| Area | Before | After |
| --- | --- | --- |
| Leave → attendance | about 4 statements per working day (about 480 for 120 days), `Promise.all` on one connection | at most 5 statements in total |
| Delete checks | 15–19 parallel queries on a 10-connection pool, then an unlocked delete | sequential queries in one locked transaction; stops at the first hit |
| Role reconciliation | one update per person, over position holders only | one `UPDATE … WHERE id IN` per role, over everyone affected |
| Working days | built a date array; `NaN` gave 0 days | validates first, then one loop |
| Inventory reconciliation | none | Σ(`qty_after` − `qty_before`) per item, independent of row order |

### 12.2 Algorithm catalogue

| # | Algorithm | Where | Why | Complexity |
| --- | --- | --- | --- | --- |
| A1 | **Calendar-date validation by UTC round trip**: parse `YYYY-MM-DD` at UTC midnight and require `toISOString()` to give back the same string | `packages/db/src/dates.ts` → `isCalendarDate`, `assertCalendarDate` | JavaScript's `Date` silently rolls `2026-02-30` into March, and `2026-13-45` becomes `NaN`. A format regex can't catch either. The round trip rejects any date that doesn't exist, leap years included, with no hand-written month table (F-21). | O(1) |
| A2 | **Working-day enumeration**: step one day at a time in UTC from start to end, skipping Saturday and Sunday | `packages/db/src/constants/leave.ts` → `listWorkingDates`, `countWorkingDays` | Leave is measured in working days. Stepping in UTC means no daylight-saving or local-time shift. Dates are validated first, so an invalid date throws instead of counting as 0 or 1 day. | O(_d_) time and space, _d_ = calendar days in the range |
| A3 | **Quota check by summation**: add up the working days of every request in the reserving statuses, then compare with the entitlement | `packages/api/src/routers/staff/leaves/quota.ts` → `sumLeaveDays`, `assertWithinQuota` | The quota must count pending days too, or several pending requests each see the same untouched balance (F-07). A sum over the person's own requests is exact and needs no stored counter that could drift. | O(_r_·_d_), _r_ = that person's requests of one type in one year (single digits in practice) |
| A4 | **Set-based batch write** in place of a per-row loop (fixes an N+1 pattern): one `SELECT … WHERE date IN (…)` finds existing rows, one `UPDATE … WHERE id IN (…)` and one `DELETE` refresh them, and one multi-row `INSERT` each adds the missing days and the period absences | `packages/api/src/routers/staff/leaves/leadership-review.ts` → `recordApprovedLeaveAttendance` | The old code ran 3–4 statements per working day while holding a row lock, about 480 for a maternity leave (F-35). Now at most 5 statements, whatever the length. | O(_d_) rows, O(1) statements |
| A5 | **Partition by membership**: split the leave dates into "already in the register" and "new" with a `Set` lookup | same function (`recordedDates`) | Decides UPDATE or INSERT per date without a query per date. | O(_d_) |
| A6 | **Precedence selection** (pick the maximum by rank): when a person holds several positions, keep the most senior | `packages/api/src/routers/staff/set-current-year.ts` → `senior()` with `LEADERSHIP_PRECEDENCE` | Principal outranks Deputy. The rank is the index in a fixed array, so the rule is stated once. | O(1) per comparison, O(_p_) over a person's positions |
| A7 | **Group-by, then one update per group**: collect user ids by target role, then one `UPDATE … WHERE id IN (…)` per role | `set-current-year.ts` → `reconcilePositionDerivedRoles` | A per-person loop issued one statement each. Grouping needs at most four statements (one per role) for any number of people (F-10). | O(_n_) to group; at most 4 statements |
| A8 | **Union candidate selection**: reconcile "everyone holding a leadership role" ∪ "everyone with a position this year" | `reconcilePositionDerivedRoles` (SQL `OR … IN (subquery)`) | The old candidate set was only this year's position holders, so a former Principal with no position was never looked at and kept the role (F-10). | One query; O(_n_) rows |
| A9 | **Fixed-window rate limiting with lazy sweep**: per key, a counter and a reset time; counting starts again when the window expires; expired keys are swept only when the map exceeds 10,000 entries | `packages/api/src/lib/rate-limit.ts` → `createFixedWindowLimiter`; used by `signupStaff` | Limits the public sign-up per address (5 per 10 min) and globally (60 per hour); the global key bounds abuse even with a forged `X-Forwarded-For` (F-19). Fixed windows are the simplest scheme that bounds volume; the lazy sweep bounds memory without a timer. | `hit`: O(1) amortised; sweep: O(_k_), rare |
| A10 | **Hash-based denylist**: SHA-256 the candidate password and look the digest up in a set of digests of every value ever published | `packages/auth/src/seat-password-policy.ts` → `seatPasswordProblem` | Refuses the leaked example passwords at boot without republishing them in source code (F-03). | O(_L_) hash + O(1) lookup |
| A11 | **Bounded cause-chain walk**: follow `error.cause` up to 5 levels until an object with a 5-character SQLSTATE `code` appears | `packages/api/src/lib/db-errors.ts` → `pgErrorOf` | drizzle 0.45 puts the PostgreSQL error one level down. Matching on the message never worked (F-06). The depth bound guards against a cyclic cause chain. | O(1) (≤ 5 steps) |
| A12 | **Backward scan for the ZIP end-of-central-directory record**, then a **forward walk of the central directory** summing declared uncompressed sizes, stopping early when the total passes the limit | `packages/api/src/lib/zip-guard.ts` → `findEndOfCentralDirectory`, `zipProblem` | An `.xlsx` is a zip. The import's row cap only applied after `exceljs` had unpacked everything, so a 1 MB zip could expand to gigabytes (F-26). The central directory lists every entry's size without inflating anything. | Scan: O(min(file, 65,557)); walk: O(_e_) entries, ≤ 1,000 |
| A13 | **Header-before-decode check**: read the image header (format, width, height), check the allow-list and megapixel bound, and only then decode and re-encode | `apps/web/src/lib/image-upload.ts` → `normaliseUploadedImage` | Checks are done on metadata, before any pixel is decoded. The decoder's own pixel limit stays as a second guard (F-05, §21a). | Header: O(1); decode: O(pixels), bounded at 50 MP |
| A14 | **Order-independent ledger reconciliation**: per item, `stored qty = Σ(qty_after − qty_before)` over its ledger, as one `GROUP BY … HAVING` | `packages/api/src/lib/inventory-reconciliation.ts` → `findLedgerMismatches`; `scripts/reconcile-inventory.ts` | Ledger rows have no strict order (`created_at` is the transaction's start time, shared by its rows), so a "replay in order" check is impossible. Every item's ledger opens at `qty_before = 0`, so the sum of changes must equal the counter whatever the order (§11). | O(_n_) over ledger rows, one query |
| A15 | **Catalog diff by set difference**: list every column, constraint and index of two databases as text facts, and report A∖B and B∖A | `scripts/baseline-existing-db.ts` | Decides, without guessing, whether a database built with `push` is exactly what migrations 0000..N produce, before recording them as applied. | O(_n_) to build each set; O(_n_) difference |
| A16 | **Content hashing for the migration ledger**: SHA-256 of each migration file's bytes, as drizzle records it | `scripts/baseline-existing-db.ts` | Ledger rows written by the baseline are identical to the ones drizzle's migrator would have written. | O(file size) |
| A17 | **Short-circuit sequential probing**: run the "does anything still reference this?" queries one at a time inside a locked transaction, and stop at the first hit | `delete-staff.ts`, `delete-academic-year.ts` | 15–19 parallel probes used to compete for a 10-connection pool. One transaction holds one connection, so sequential is the correct shape. The first hit is enough to refuse (F-35). | ≤ 19 indexed lookups, usually fewer |
| A18 | **Header-only validation of the `Content-Length` request header** before reading the body | `image-upload.ts` → `checkDeclaredLength` | The body was fully buffered before the 8 MB check. Checking the declared length first bounds memory. | O(1) |
| A19 | **Algebraic leave balance**: `remaining = max − used − pending`, clamped at 0 | `entitlements.ts` → `getMyLeaveBalance` | The balance a teacher sees is the number the server enforces at `applyLeave`. | O(_r_) |

### 12.3 Concurrency-control algorithms

| # | Technique | Where | Why |
| --- | --- | --- | --- |
| C1 | **Pessimistic row lock** (`SELECT … FOR UPDATE`) on the row that owns the invariant | the teacher's `staff` row (`quota.ts` → `lockStaffForLeave`), the leave row (`finalizeLeave`), the `class` row (`assign-class-teacher.ts`), the `student` row (two marking procedures), the deleted `staff` / `academic_year` row | Check-then-act races: two requests for the last quota day, a double-submitted approval, two homeroom reassignments, a leave filed during a staff delete (F-07, F-17, F-32). Inserts referencing a locked row take `FOR KEY SHARE` and wait too. |
| C2 | **Compare-and-set (conditional update)**: `UPDATE … WHERE id = $1 AND status = 'pending' … RETURNING`; no row back means someone else got there first | `recommendLeave`, `cancelLeave`, `approveTeacherRequest` | An optimistic check for state transitions: no lock held while a person decides, and a stale write is refused, not overwritten. |
| C3 | **Advisory transaction lock** (`pg_advisory_xact_lock`) on a fixed key | `setCurrentYear` | Year switching touches every year's `is_current` flag. A single named lock queues concurrent switches instead of letting them interleave (F-09). |
| C4 | **Database constraint as the last line of defence**: partial unique index, CHECKs, a trigger | `academic_year_single_current`, `leave_request_*_check`, `assert_academic_year_writable` (migrations 0009, 0010) | Application checks can be bypassed (a script, a hand-run `UPDATE`, a future bug); the database can't. |
| C5 | **Lock ordering**: approval takes the leave row, then the staff row; applying takes only the staff row and inserts a new leave row | `leadership-review.ts`, `apply-leave.ts` | No two code paths take the same two locks in opposite order, so they can't deadlock. |
| C6 | **All-or-nothing transactions** | `openAcademicYear`, `createStaff`, `signupStaff`, `assignPosition`, `removePosition`, `approveTeacherRequest`, purge | A failure in step 3 rolls back steps 1–2 instead of leaving half-created state (F-08, F-17, F-18). |

## 13. Data structures used in the repair

### 13.1 In-memory structures

| # | Structure | Where | Holds | Why this structure |
| --- | --- | --- | --- | --- |
| D1 | `Set<string>` of SHA-256 digests | `seat-password-policy.ts` → `PUBLISHED_PASSWORD_HASHES` | digests of every password value ever committed | O(1) membership; stores digests, not the secrets. |
| D2 | `Set<string>` of endpoint paths | `admin-endpoint-guard.ts` → `UNGRANTED_PATHS`, `SEAT_LOCKED_PATHS`, `READ_ONLY_PATHS`; `mail-guard.ts` → `MAIL_SENDING_PATHS` | the better-auth paths in each policy class | Exact-match O(1) classification. An explicit list replaced prefix matching, which would have blocked `/sign-in/email-otp` (it signs in _with_ a code). |
| D3 | `Set<string>` allow-lists | `image-upload.ts` → `ALLOWED_DECLARED_TYPES`, `ALLOWED_DECODED_FORMATS` | 4 MIME types; 4 decoded formats | O(1) membership; the decoded set is the one that actually matters (SVG is decodable but refused). |
| D4 | `Map<string, Window>` (`{ count, resetsAt }`) | `rate-limit.ts` → `createFixedWindowLimiter` | one counter per client address, plus a global key | O(1) get/update per request. A `Map` iterates in insertion order and supports deletion during the sweep. |
| D5 | `Map<string, LeadershipRole \| null>` | `set-current-year.ts` → `leadershipByStaffId` | each candidate's most senior leadership role this year | O(1) update while folding several positions per person (A6). |
| D6 | `Map<string, string[]>` | `set-current-year.ts` → `userIdsByRole` | target role → user ids that need it | The grouping behind A7: one update per key. |
| D7 | `Set<string>` of ISO dates | `leadership-review.ts` → `recordedDates` | dates already in the attendance register | O(1) "insert or update?" per date (A5). |
| D8 | `Map<string, number>` ×2 | `entitlements.ts` → `usedByEntitlement`, `pendingByEntitlement` | days per `type:paymentStatus` key | One pass over a person's requests fills both totals (A19). |
| D9 | `readonly` tuples (`as const`) | `quota.ts` → `RESERVING_STATUSES`, `DECIDABLE_STATUSES`; `LEADERSHIP_PRECEDENCE`; `PRIVILEGED_ROLES`; `LEGACY_INVENTORY_TRANSACTION_ACTIONS` | fixed vocabularies | Each rule stated once; TypeScript derives the literal types, so a typo is a compile error. The index of `LEADERSHIP_PRECEDENCE` is the rank (A6). |
| D10 | Array of lazy query builders | `delete-staff.ts` → `probes`; `delete-academic-year.ts` → `DEPENDENT_TABLES` | the dependency checks, unexecuted | drizzle builders run only when awaited, so the array is a list of pending checks run in order with an early exit (A17). |
| D11 | `string[]` of ISO dates | `listWorkingDates` return value | the working days of a leave | Feeds `IN (…)` and the batch insert directly (A4). |
| D12 | `DataView` over a `Uint8Array` | `zip-guard.ts` | the uploaded workbook's raw bytes | Little-endian reads of ZIP header fields at fixed offsets, with no copying and no inflating (A12). |
| D13 | `Set<string>` of catalog facts | `baseline-existing-db.ts` → `catalogOf` | one text line per column, constraint and index | Set difference gives "missing" and "extra" in O(_n_) (A15). |
| D14 | Discriminated union `{ ok: true; webp } \| { ok: false; status; message }` | `image-upload.ts` → `ImageUploadResult` | an upload's outcome | The type system forces callers to handle refusal before touching the bytes. |
| D15 | Constant object of regex literals | `apps/web/test/image-upload.test.ts` → `REFUSED_BY` | one pattern per guard | Each test asserts which guard refused (§21a). |

### 13.2 Database structures

| # | Structure | Where | Why |
| --- | --- | --- | --- |
| S1 | **Partial unique B-tree index** `ON academic_year(is_current) WHERE is_current` | migration 0009 | Allows any number of `false` rows and exactly one `true`: "at most one current year" as an index, which no race can bypass (F-09). |
| S2 | **Composite B-tree index** `leave_request(staff_id, academic_year_id)` | migration 0009 | Serves the quota and overlap queries, which filter on exactly this pair (A3). |
| S3 | **CHECK constraints** (enumerations and ranges) | `leave_request_*_check`, `leave_request_date_order`, `class_period_subject_*_range`, `academic_year_current_not_deleted` | Make invalid states unrepresentable whichever code writes the row (F-31). They caught the seed's unpadded dates (NEW-F-04). |
| S4 | **Row trigger + PL/pgSQL function** `assert_academic_year_writable()` on 16 tables | migration 0010 | One rule ("a closed year is read-only") enforced for every write path, instead of one check in each of 20 procedures (F-22). |
| S5 | **Append-only audit table** `account_audit_log`, indexed on `created_at` and `target_user_id`, user ids deliberately **not** foreign keys | migration 0009 | A record of account administration that survives deletion of either account (F-01). |
| S6 | **Archive tables** `archived_0008_*`, created with `CREATE TABLE … AS` | migration 0008 | Keeps closed loan history as plain data, with no foreign keys to block later deletes (NEW-F-01). |

### 13.3 Pre-existing structures kept unchanged

- **`Map` grouping in `listPeriodConflicts`** for teacher double-booking: O(_n_), as the audit found; left as is.
- **Inventory's stored counters plus before/after ledger, under `FOR UPDATE`**: the strongest existing design in the codebase. It was not weakened; it is now _verified_ by A14.
- **In-memory OTP throttle and event publisher**: still per process (F-27). Together with D4 they limit deployment to a single instance, which is documented in `docs/operations.md`.

### 13.4 Alternatives considered and rejected

| Considered | Rejected because |
| --- | --- |
| Replaying the inventory ledger in time order | `created_at` is shared by rows of one transaction, so the order isn't well defined; the order-independent sum (A14) is exact. |
| A unique index on teacher + day + period for double-booking | Combined sessions are legitimate overlaps; detection stays in code, as AGENTS.md documents. |
| A sliding-window or token-bucket limiter | More state per key for no benefit at sign-up volumes; a fixed window bounds abuse adequately. |
| A per-procedure "is this year closed?" check | 20 places to remember, with any omission silently reopening the hole; one trigger (S4) can't be forgotten. |
| Matching database errors by message text | It never worked after the drizzle 0.45 upgrade; the SQLSTATE `code` is the stable contract (A11). |
| Holding the leave state machine in one stored "status" field with an application lock | The conditional update (C2) needs no lock while a person decides, and still refuses stale writes. |

## 14. Performance changes

- The set-based leave write and sequential delete checks remove pool starvation.
- QR sheets and Excel imports are bounded.
- New composite index on `leave_request (staff_id, academic_year_id)`.
- **Not done:** pagination for about 40 list endpoints (F-24).

---

## 15. Tests added

| Suite | Tests | What it proves |
| --- | --: | --- |
| `api/test/auth-escalation` | 15 | F-01 over real HTTP; NEW-F-02; NEW-F-05; audit log; sign-up closed; legitimate ban/unban still works |
| `api/test/leave` | 13 | quota reservation, two real races, approval re-check, cancelled can't be approved, double approval writes attendance once, F-21, database CHECKs |
| `api/test/academic-integrity` | 18 | F-06, F-08 (injected failure), F-09 race, F-10, F-15, F-22 |
| `api/test/signup` | 6 | password floor, per-address and global limits, F-18, concurrent duplicate NIC |
| `api/test/seed` | 5 | demo seed run twice; production refusal; reset guard; full seed under the new constraints; both seeds reconcile |
| `api/test/inventory-reconciliation` | 2 | five concurrent stock-ins plus a stock-out reconcile; a drifted counter is detected |
| `api/test/error-handling` | 3 | database code read from the cause; the NIC is in the raw error but not in the log |
| `api/test/export-import-bounds` | 7 | real workbook passes; 60 MB zip bomb refused; QR bounds |
| `web/test/image-upload` | 11 | HTML, SVG and an executable labelled as images; wrong MIME; oversize; decompression bomb |
| `db/test/dates` | 23 | leap years, month and year boundaries, invalid dates, Colombo time boundaries |
| `auth/test/email` | 6 | transport selection, provider errors surfaced |
| `auth/test/seat-password-policy` | 4 | length, published values, the value never appears in the message |
| **Total** | **114** |  |

**How the harness works** (`packages/api/test/support/harness.ts`): each test file gets its own database, built by drizzle's real migrator, with a real `createAuth`, the five seeded seats, real cookie sign-in, and the real oRPC router.

## 16. Tests executed

| Gate | Command | Result |
| --- | --- | --- |
| Unit + integration | `bun run test:local` | **114 pass / 0 fail** |
| Empty database → latest | `bun run db:verify-migrations` | 11 migrations applied |
| Schema drift | `bun run db:check-drift` | no drift (also confirmed to fail on a stale snapshot) |
| Types: api, auth, db | `tsc -b packages/api` | exit 0 (also confirmed to catch a planted error) |
| Types: web | `tsc --noEmit` | exit 0 |
| Production build | `vite build` | exit 0 |
| Lint | `oxlint packages apps scripts` | exit 0 |
| Format | `oxfmt --check` on an LF copy of the tree | only the two untracked audit `.md` files fail |
| Install | `npx bun@1.4.0 install --frozen-lockfile` | OK; `bun.lock` byte-identical |
| Runtime | production build on port 3007 + `scripts/runtime-smoke.ts` | **13 / 13** |
| Live DB baseline | `baseline-existing-db.ts --through 0007` | exact match (read-only) |
| Live DB pre-checks for 0008–0010 | read-only counts | all pass |
| Inventory reconciliation (live DB) | `reconcile-inventory.ts` | passes, but the live DB has 0 items, so this proves nothing |

## 17. Before/after evidence

**Before.** My fix files were temporarily stashed so the original code was in place (with the repaired migrations, since the original ones can't build a database). These tests then **failed on the original code**:

- academic admin creating an admin;
- setting the admin's password;
- the third request over the quota;
- the two-request race;
- a double-click filing twice;
- approving a cancelled request;
- `2026-02-30` accepted;
- a former Principal keeping the role;
- the admin demoted to `vicePrincipal` after being given a position;
- a freshly created staff member who couldn't be deleted;
- the seeded admin's staff row being deletable;
- a duplicate NIC returning 500.

The original upload pipeline also **accepted** an SVG labelled as PNG and a 292 KB file decoding to 100 MP.

**After.** All pass, plus the 13 runtime checks.

**A failure in my own evidence, caught and corrected.** The first runtime run "passed" F-01 and F-12 for the wrong reason: better-auth's origin check refused the requests before the code under test ran. The server log showed this. The script was fixed to send the trusted origin, and the re-run was confirmed by the `account_audit_log` rows and zero origin errors.

---

## 18. Remaining risk register

| Risk | Severity | Note |
| --- | --- | --- |
| No mail provider (F-12) | P1 (production blocker) | Choose a provider; set `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM`. A provider failing after configuration is only logged. |
| Live dev database not upgraded | P1 for that environment | Back it up, then run the three commands in `docs/operations.md`. All pre-checks pass. |
| CI never run on GitHub | P2 | Its steps were reproduced locally; the first push will confirm. |
| Docker image and MinIO not exercised | P2 | Not available in this environment. |
| Unbounded list endpoints (F-24) | P2 | Fine at one school's scale today; grows with retained years. |
| Cascade deletes on history tables (F-32) | P2 | The race is closed; the cascades themselves remain. |
| Sign-up enumeration; no forced first-password change (F-19) | P2 | Both need product decisions and UI. |
| `timestamp` without time zone (F-20) | P2 | Mitigated by `TZ=UTC` and Colombo-time date helpers. |
| Per-process state (F-27) | P2 | Single-instance deployments only. |
| API-only features (F-13): qualification uploads, void/unvoid, marking | P2 | Build the UI or remove the procedures. |
| No browser end-to-end tests | P3 |  |
| `@orpc/zod` unused | P3 | Removal declined in this session. |
| Local Bun is 1.3.13 | P3 | `bun upgrade`, or use `npx bun@1.4.0`. |

## 19. Unverified areas

- The GitHub Actions run.
- The Docker image build and start.
- Uploads to MinIO and presigned reads.
- Accessibility.
- A dependency vulnerability scan.
- Production TLS, hosting and backup execution. Backups are documented, not scheduled.

## 20. Production readiness

| Gate | Item | Status |
| --- | --- | --- |
| **A. Security** | P0 security issues fixed | ✅ |
|  | Secrets rotated | ✅ (local; rotate any other deployment the same way) |
|  | Privileged endpoints protected | ✅ |
|  | Upload security fixed | ✅ |
| **B. Database** | Fresh migration works | ✅ |
|  | Seed works and is repeatable | ✅ |
|  | Schema drift verified | ✅ |
| **C. Business logic** | Critical invariants enforced | ✅ |
|  | Transactions verified | ✅ |
|  | Concurrency verified | ✅ |
| **D. Testing** | Critical, integration, authorization and migration tests | ✅ (no browser end-to-end tests) |
| **E. Build** | Typecheck, lint, production build | ✅ |
| **F. Runtime** | Authentication, authorization, workflows and error handling verified on the production build | ✅ (MinIO and Docker ⚠) |

**Status: NOT PRODUCTION-READY.** Before go-live:

1. Configure a mail provider.
2. Confirm CI is green on GitHub.
3. Back up the target database, then upgrade it (`docs/operations.md`).
4. Schedule backups for the database and the MinIO bucket.
5. Smoke-test the Docker image with MinIO.

---

## 21. Verification matrix (P0/P1)

| Requirement | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Academic admin can't create an admin | auth-escalation + live HTTP | 403, no user created | 403 + audit row | ✅ |
| Admin's password can't be taken over | auth-escalation | 403; old password works, new one doesn't | as expected | ✅ |
| Seeded seat can't be banned | auth-escalation | 403 even for admin | 403 | ✅ |
| Empty database migrates | verify-migrations | all applied | 11 applied | ✅ |
| No schema drift | check-schema-drift | clean | clean | ✅ |
| Leaked password can't sign in | live HTTP | 401 | 401 | ✅ |
| Weak or published seat password refused at boot | seat-password-policy | throws, naming only the variable | as expected | ✅ |
| Duplicate NIC | academic-integrity + live HTTP | 409, no SQL in body | 409 | ✅ |
| Quota over-subscription | leave | refused | PRECONDITION_FAILED | ✅ |
| Last day requested twice at once | leave | 1 OK, 1 refused | as expected | ✅ |
| Cancelled request approved | leave | 409 | 409 | ✅ |
| Invalid calendar date | leave + dates | 400 / RangeError | as expected | ✅ |
| Two simultaneous year switches | academic-integrity | exactly 1 current | 1 | ✅ |
| Half-created year after a failure | academic-integrity | no rows left | none | ✅ |
| Former Principal demoted | academic-integrity | `teacher` | `teacher` | ✅ |
| Write to a closed year | academic-integrity | 409 / `YR001` | as expected | ✅ |
| Freshly created staff deletable | academic-integrity | OK | OK | ✅ |
| Seed run twice | seed | no change | no change | ✅ |
| SVG or bomb uploaded as an image | image-upload + live HTTP | 400 | 400 | ✅ |
| Production mail with no transport | auth-escalation + live HTTP | 503 | 503 | ✅ |
| Personal data kept out of logs | error-handling | NIC absent from the log line | absent | ✅ |
| Inventory counters match the ledger | inventory-reconciliation | no mismatches | none | ✅ |

---

## 21a. Correction after review: `image-upload.test.ts`

A review of `apps/web/test/image-upload.test.ts` found two defects in the F-05 tests. All 11 tests passed, but some proved less than their names said.

1. **The "executable" payload was not an executable.** It was built with `TextEncoder` from the string `"MZ\u0090\u0000…"`. UTF-8 encodes U+0090 as `c2 90`, so the test sent `4d5a c290 …` instead of a DOS/PE header (`4d5a 9000 0300 …`). It now uses a byte array of a real header (`PE_HEADER`).
2. **The refusal tests asserted only `status: 400`.** Three different guards return 400, so a test could pass because a different guard refused first. Each test now also asserts the message of the guard it is about (`refusedBy(status, REFUSED_BY.<guard>)`).

**What the stronger test exposed in the code.** Once the decompression-bomb test asserted the pixel guard's own message, it failed. `sharp` applies `limitInputPixels` to `metadata()` as well as to decoding. So:

- the explicit megapixel check was unreachable;
- a genuine oversized photo was reported as "could not be read as an image".

`normaliseUploadedImage` now reads the header without the limit (no pixels are decoded) and refuses with "That image is over 50 megapixels; resize it before uploading". `limitInputPixels` stays on the decoding pipeline as a backstop.

**Result:** image-upload 11/11 pass, and each refusal is now proven to come from the guard named in the test. Lint and the web typecheck are clean.

## 21b. Correction after review: test files were not typechecked

The editor flagged `import … from "bun:test"` (line 9 of `image-upload.test.ts`, and the same line in every test file): Bun's type definitions were not installed, and the base tsconfig pins `"types": ["node"]`.

- `@types/bun@1.4.2` added as a root devDependency with the pinned Bun 1.4.0. The lockfile change is exactly `@types/bun` and `bun-types`, and `bun install --frozen-lockfile` passes.
- Each test folder (`packages/{api,auth,db}/test`, `apps/web/test`) has a `tsconfig.json` that adds `bun` types.
- New script `bun run check-types:tests`, also run in CI.

Typechecking the tests for the first time found **15 real type errors**, all in test code: leave requests omitted `paymentStatus`/`reason`, which the procedure's input contract requires (the server tolerated it at runtime); a staff fixture widened `staffCategory` to `string`; and a session read a field better-auth's inferred type omits. All are fixed: 0 errors in all four folders, and 114/114 tests still pass.

## 22. Next steps

1. Review the diff, then commit on `repair/forensic-audit-2026-10` and open a pull request. CI will run every gate.
2. Back up the dev database. Then run:
   ```sh
   bun --env-file=apps/web/.env scripts/baseline-existing-db.ts --through 0007 --apply
   bun run db:migrate
   ```
3. Choose a mail provider and set the three `MAIL_*` / `RESEND_*` variables.
4. Schedule `pg_dump` and MinIO backups (`docs/operations.md`).
5. Work through §18, in order of severity.
