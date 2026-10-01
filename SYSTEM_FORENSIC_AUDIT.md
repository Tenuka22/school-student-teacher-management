# SYSTEM FORENSIC AUDIT REPORT

**System:** St. Aloysius' College — School Management System (`Tenuka22/school-student-teacher-management`)
**Audited revision:** local `master` at `1f2c705` ("Small changes") + one uncommitted file (`apps/web/src/components/admin/admin-users-content.tsx`)
**Audit date:** 1 October 2026
**Method:** static reading of the repository, plus targeted runtime verification against a throwaway PostgreSQL database that was created and dropped for this audit. The existing databases were not modified.

---

## How to read this report

Every material claim carries an evidence grade:

| Grade | Meaning |
|---|---|
| **VERIFIED** | Reproduced by executing code or SQL during this audit, or proven by a direct, unambiguous reading of the code path end to end |
| **STRONGLY INDICATED** | The code path is clear, but it was not executed end to end |
| **LIKELY** | Inferred from configuration, library defaults or partial evidence |
| **UNVERIFIED** | Could not be checked with the available evidence |
| **CONTRADICTED** | A documented claim that the repository disproves |

Severity uses the requested model: **P0** (data loss, security breach, system-wide failure), **P1** (major feature failure, deployment blocker, serious integrity issue), **P2** (partial degradation, performance, maintainability), **P3** (minor issue or debt). Issue IDs (`F-nn`) are defined in §35 and cross-referenced throughout.

### What was actually executed during this audit

| Check | Result |
|---|---|
| Applied migrations `0000`–`0007` statement by statement to an empty scratch database | **`0007` fails at statement #1.** With the 25 failing `DROP`s skipped, the 25 `ADD CONSTRAINT`s also fail ("already exists") |
| Ran `drizzle-kit generate` against a temporary copy of the migrations | "No schema changes" — `schema/*.ts` matches the `0007` snapshot |
| Compared FK names across snapshots | `0006_snapshot.json` records 50 references to `*_staff_id_user_id_fk`; the SQL never created them |
| Provoked a unique violation through drizzle-orm 0.45.3 | Error class `DrizzleQueryError`; message does **not** contain the constraint name; `cause.code = 23505` |
| Ran `calculateLeaveDays` on invalid ISO dates | `2026-02-30` → 1 day; `2026-13-45` → **0 days** |
| `tsc -b` (packages/api) and `tsc --noEmit` (apps/web) | Both exit 0 |
| `bun x ultracite check` | Exit 1: **4 `react(purity)` errors** (real), plus 529 "format" findings caused by local CRLF checkout (`core.autocrlf=true`, no `.gitattributes`) |
| Git ancestry of `develop` | `ce74e4a` **is an ancestor of `master`** (merged in `e62ed14`) |
| Compared `.env.example` with live `apps/web/.env` by SHA-256 only (no values printed) | `ACADEMIC_ADMIN_PASSWORD` is **identical** to the committed example value |

Nothing else was executed. Mutations, exports, uploads, QR scanning, concurrency and the browser UI were analysed from code only (see §34).

---

## 1. Executive Summary

The system is a TanStack Start (React 19 + Vite + Nitro) monolith with an oRPC API, better-auth, Drizzle ORM and PostgreSQL. It is well commented and the **inventory subsystem is engineered to a high standard**: stored counters guarded by database CHECKs, a before/after transaction ledger, `SELECT … FOR UPDATE` row locks and transactions on every multi-row write.

The rest of the system is materially weaker, and several of its strongest claims are false:

1. **Privilege escalation (P0, F-01).** The `principal`, `vicePrincipal` and `academicAdmin` roles hold better-auth's full `adminAc` statement set. The only guard is a `databaseHooks.user.update` hook. `/api/auth/admin/create-user` (role `admin` allowed), `/admin/set-user-password` (any user, including the top admin), `/admin/remove-user` and `/admin/impersonate-user` (any non-`admin` role) are reachable directly and are not covered by that hook. Any of those three seats can mint a new top-level administrator or take over the existing one.
2. **The migration history cannot build a database (P0, F-02, VERIFIED).** `0007_quiet_mother_askani.sql` drops 25 constraints that never existed and re-adds 25 that already exist. `bun run dev`, `bun run dev:web` and any new environment fail. The root cause is a corrupted `0006` snapshot.
3. **A seeded credential is public (P0 in this environment, F-03, VERIFIED).** The live Academic Administrator password equals the value committed in `apps/web/.env.example`. Chained with F-01, anyone who can read the repository and reach this instance can become the top administrator.
4. **Business rules that are documented as enforced are not:**
   - leave quotas can be exceeded (F-07);
   - a teacher-cancelled leave can be approved (F-07);
   - two academic years can be "current" at once (F-09);
   - former leadership keeps leadership privileges after a year switch (F-10);
   - a uniqueness conflict returns HTTP 500 instead of 409 in 11 procedures (F-06, VERIFIED).
5. **Several visible features cannot complete their workflow:**
   - custody requests can be raised but never decided in the UI (F-13);
   - leave quotas, leadership positions and qualifications have no editing UI (F-13);
   - delete-academic-year and delete-staff refuse every normally created record (F-15);
   - email delivery throws in production, so password reset and teacher self-registration cannot work there (F-12).
6. **There are zero automated tests** (F-16), and CI runs only the linter, which currently fails.

**Conclusion:** the system is **not production-ready**. It is close to usable in a closed local setting once the P0 items are fixed, because the architecture is sound and most defects are local and repairable without a rewrite. A rewrite is not recommended.

---

## 2. Current System Situation

| Aspect | Observed state | Grade |
|---|---|---|
| Branch | Local `master` = `origin/master` as last fetched (`1f2c705`). A dry-run fetch shows remote `master` has moved to `28327c2` (contents not inspected) | VERIFIED |
| Uncommitted work | Duplicate React key fix in `admin-users-content.tsx`; untracked `TECHNICAL_REPORT.md` | VERIFIED |
| `develop` branch | Already merged into `master` (`e62ed14 "Merge develop: resolve conflicts (functional=ours, UI=theirs)…"`). `develop` is 0 ahead, 39 behind | VERIFIED; **contradicts** TECHNICAL_REPORT §1/§3/§6 #6 |
| Local DB | `school-student-teacher-management-v2`, built by `drizzle-kit push --force` (per TECHNICAL_REPORT), so it reflects `schema/*.ts`, not the migration history | LIKELY (reported, not re-inspected) |
| Build / types | `tsc` passes for api and web | VERIFIED |
| Lint | Fails (4 real errors) | VERIFIED |
| Tests | None exist | VERIFIED |

---

## 3. Architecture Map

```text
Browser (React 19, TanStack Router/Query, shadcn/base-ui)
   │  same-origin fetch, cookies (better-auth, prefix "school-student-teacher-management")
   ▼
TanStack Start server (Vite dev / Nitro node-server in prod, port 3001)
   ├─ /api/auth/*        → better-auth handler (email+password, username, emailOTP,
   │                        admin plugin, multiSession(5), tanstackStartCookies)
   ├─ /api/rpc/*         → oRPC RPCHandler (StrictGetMethodPlugin on by default)
   ├─ /api/rpc/api-reference/* → oRPC OpenAPIHandler + reference UI (zod converter)
   ├─ /api/files/upload  → hand-written multipart handler → writes to apps/web/public/uploads/inventory
   ├─ /sitemap.xml
   ├─ SSR route loaders  → in-process oRPC client (createRouterClient) — no HTTP hop
   └─ Nitro scheduled task "accounts:purge-unverified" (04:10 daily)
   │
   ▼
packages/api   (oRPC procedures: staff/*, marking/*, inventory/*; guard tiers in src/index.ts)
packages/auth  (better-auth config, roles, permissions, bootstrap of 5 seeded seats, OTP throttle)
packages/db    (Drizzle schema, valibot schemas, constants, migrations 0000–0007)
packages/ui    (shadcn components, globals.css)
   │  node-postgres Pool (drizzle(DATABASE_URL) → default pg pool, max 10)
   ▼
PostgreSQL 18 (docker-compose, host port 3000)
```

**Authentication flow:** better-auth sessions in the `session` table → `auth.api.getSession(headers)` in `apps/web/src/context.ts` → `Context.session` → oRPC middleware.

**Authorization flow:** `requireRole(...)` tiers compare `session.user.role` to a hard-coded list (`packages/api/src/index.ts`). `requirePermission(resource, action)` bypasses `admin|principal|vicePrincipal` and asks better-auth's `userHasPermission` for every other role. Row-level scoping is done inside handlers.

**Startup side effects** (`apps/web/src/services.server.ts`, top-level `await`):
- `ensureBootstrapUsers` creates the 5 seeded accounts, their staff rows and the inventory categories;
- `purgeUnverifiedAccounts` deletes unverified users older than 7 days.

**Real-time:** `inventory.custody.requests.subscribe` uses an in-process `EventPublisher` (`custody-request-events.ts`).

**Not present:** background job queue, cache tier, object storage, structured logging, metrics, tracing, backups, migrations in the deploy path.

---

## 4. Technology Stack

| Layer | Technology (declared) | Notes |
|---|---|---|
| Runtime / package manager | Bun (`packageManager: bun@1.4.0`), Node 24 in Docker runner | Local Bun is **1.3.13**; `bun.lock` is lockfileVersion 2 (VERIFIED) |
| Monorepo | Bun workspaces + Nx 23 | |
| Frontend | React 19.2, TanStack Router 1.170 / Start 1.168 / Query 5 / Table 9, Tailwind 4, base-ui, shadcn | |
| API | oRPC 1.15 (RPC + OpenAPI handlers) | |
| Validation | **valibot** (178 files) and **zod** (declared, 0 imports) | Two libraries; the OpenAPI converter is zod-only (F-41) |
| Auth | better-auth **1.7.5** (pinned) | |
| ORM / DB | drizzle-orm 0.45.3, drizzle-kit 0.31, `pg` 8.23, PostgreSQL 18 | |
| Documents | exceljs 4.4, pdfmake 0.3, qrcode 1.5, qr-scanner (browser) | |
| Env | varlock 1.18 (schema + codegen) | `scripts/seed.ts` uses `dotenv`, which is not declared (F-11) |
| Lint/format | Ultracite 7.12 (oxlint + oxfmt), husky + lint-staged | |
| CI | GitHub Actions: lint only (+ auto-fix push) | |

---

## 5. Module Inventory

Status legend: **OK** works as designed on reading; **PARTIAL** works with defects; **BROKEN** cannot complete its workflow; **API-ONLY** backend exists, no UI.

| Module | Frontend | Backend | Database | Auth guard | Tests | Status |
|---|---|---|---|---|---|---|
| Authentication (login, OTP, multi-session) | login-form, verify, account | better-auth | user/session/account/verification | better-auth | none | PARTIAL: no prod mail transport (F-12) |
| Sign-up / teacher approval | signup-form, teacher-requests | `signupStaff` (public), `approveTeacherRequest` | user + staff | public / academicProcedure | none | PARTIAL (F-12, F-18, F-19) |
| Accounts admin (ban, purge, list) | users-* (server-side table) | `listAccounts`, better-auth admin plugin | user/session | academicProcedure + adminAc | none | **Security defect (F-01)** |
| Roles / permissions | sidebar gating, route guards | `index.ts` tiers, `permissions.ts` | user.role | — | none | PARTIAL (F-01, F-10) |
| Staff / teachers | teachers-page, teacher-form, import | create/update/delete/list staff | staff, staff_position | requireStaffPermission | none | PARTIAL (F-06, F-15) |
| Positions (principal, deputy) | **none** | `assignPosition`, `removePosition` | staff_position | adminProcedure | none | **API-ONLY** (F-13) |
| Qualifications | review panel only | upload/list/approve | teacher_qualification | requireQualificationPermission | none | **BROKEN**: nothing can create a row via UI; `teacher` role has no grant (F-13) |
| Academic years | academic-years-page, switcher | create/set-current/delete/restore | academic_year (+ policy, entitlements, grade_subject_config) | adminOrAcademicProcedure | none | PARTIAL (F-08, F-09, F-15) |
| Curriculum / subjects | read-only lists | listSubjects, listStructureVersions | grade_subject_config (code-defined versions) | academicProcedure | none | OK |
| Classes / homeroom | classes-page, tabs, import | CRUD, assignClassTeacher, seedDefaultClasses | class, class_teacher_assignment_history | requireAssignmentPermission | none | PARTIAL (F-17: non-atomic history) |
| Subject-teacher assignment | inside teacher form | replaceTeacherSubjects | teacher_subject_assignment | requireAssignmentPermission | none | OK (transactional) |
| Timetable | periods-page, teacher timetable | periods/* (subject-first, multi-teacher) | class_period_subject, class_period_teacher | requireAssignmentPermission / academicProcedure | none | OK, with F-06 and F-31 |
| Attendance | attendance register, import | mark, recordArrival, policy, import | teacher_attendance, teacher_period_absence, short_leave_usage, attendance_policy | academicProcedure | none | OK on reading (transactional); F-20, F-22 |
| Leave | teacher apply, leadership review | apply/cancel/recommend/finalize, entitlements | leave_request, leave_entitlement | teacher/protected | none | **PARTIAL, rule violations (F-07)**; quota editing API-only |
| Inventory register | inventory-page (2,003 lines) and many dialogs | ~50 procedures | 16 tables | inventory* tiers | none | OK on reading: strongest module |
| Custody requests | create + list | create/list/**decide**/subscribe | inventory_custody_request | inventory permissions | none | **BROKEN**: no UI calls `decide` (F-13) |
| Item void / unvoid | none | voidItem, unvoidItem | inventory_item | inventoryManager | none | API-ONLY |
| QR labels / scanning | qr-sheet-dialog, scan panels | exportQrSheet, getItemForScan | — | overseer / inventory:read | none | PARTIAL (F-25) |
| Uploads | item photo | `/api/files/upload` | files | role check in route | none | **Security defect (F-05)** |
| Exports | buttons on pages | 6 Excel/PDF + workbook | — | academic / staff:read | none | UNVERIFIED at runtime; `classTeacherHistoryExcel` has no UI |
| Imports (Excel) | teacher/class/attendance import | parseExcel, attendance preview/apply | — | academicProcedure | none | PARTIAL (F-26) |
| Historical data | historical-data page | getHistoricalData | all year-scoped | academicProcedure | none | OK on reading; unbounded (F-24) |
| Marking (students, exams, marks, subject selection) | **none except** a student list in the borrower picker | 18 procedures | 7 tables | student/mark/exam permissions | none | **API-ONLY** (F-13) |
| Dashboards | admin, inventory, principal, deputy, teacher | list queries | — | per tier | none | UNVERIFIED (not visually reviewed) |
| Notifications / email | — | `sendAuthEmail` | — | — | none | **BROKEN in production** (F-12) |

---

## 6. Data Architecture

32 tables across 9 schema files (`packages/db/src/schema`):

- **auth (4):** `user`, `session`, `account`, `verification` — better-auth owned.
- **staff (3):** `staff`, `academic_year`, `staff_position`.
- **academics (3):** `class`, `class_teacher_assignment_history`, `grade_subject_config`.
- **periods (2):** `class_period_subject`, `class_period_teacher`.
- **attendance (4):** `teacher_attendance`, `teacher_period_absence`, `attendance_policy`, `short_leave_usage`.
- **leaves (2):** `leave_request`, `leave_entitlement`.
- **teacher-subjects (1):** `teacher_subject_assignment`.
- **qualifications (3):** `teacher_qualification`, `employment_verification`, `password_rotation_history`.
- **marking (7):** `student`, `student_class_assignment`, `student_admission`, `student_subject_selection`, `exam_type`, `grade_scale`, `subject_mark`.
- **files (1):** `files`.
- **inventory (16):** category, item, item_replacement, unit, issue, issue_unit, borrow, borrow_unit, disposal, disposal_unit, disposal_status_history, custody_history, custody_notice_recipient, custody_request, transaction, audit_log.

Key modelling choices:

- **Identifiers** are `text` UUIDs generated in application code (`crypto.randomUUID()`), branded in TypeScript via valibot.
- **Dates** that are calendar dates (`birth_date`, `start_date`, `leave_request.start_date`, `teacher_attendance.date`) are `text` in `YYYY-MM-DD`. Lexical comparison works for well-formed values, but the database cannot reject `2026-02-30` (F-21, F-31).
- **Timestamps:** all **92** `timestamp` columns are `timestamp without time zone`; 0 use `withTimezone` (VERIFIED, F-20).
- **Enumerations** (`leave_request.status`, `teacher_attendance.status`, `staff.staff_category`, `class_period_subject.day_of_week`, …) are free `text`/`integer` with valibot picklists only. Inventory is the exception, with 53 CHECK constraints.
- **Academic-year scoping:** every year-dependent table has `academic_year_id` with `ON DELETE CASCADE`. Year closure is a soft delete (`academic_year.deleted_at`).
- **Period times** are code-defined (`packages/db/src/periods.ts`), not stored. This is acceptable and documented.

---

## 7. Database Audit

### 7.1 Table-level findings

| Table | Finding | Grade | Issue |
|---|---|---|---|
| `academic_year` | No partial unique index on `is_current = true`; nothing in the DB prevents two current years | VERIFIED | F-09 |
| `academic_year` | `year` is `UNIQUE` including soft-deleted rows, so a closed year blocks re-creating that year (and the resulting violation surfaces as a 500, F-06) | STRONGLY INDICATED | F-08 |
| `staff` | `nic` `NOT NULL UNIQUE` + CHECK `staff_nic_format`; good. A redundant plain index `staff_nic_idx` duplicates the unique index; same for `teacher_service_no` | VERIFIED | F-31 |
| `staff` | `user_id ON DELETE SET NULL`: when an unverified sign-up is purged, the staff row and its NIC remain, permanently blocking that NIC | VERIFIED (code path) | F-18 |
| `leave_request` | No CHECK on `status`, `deputy_status`, `final_status`, `day_part`, `payment_status`, or `start_date <= end_date`; no uniqueness against duplicate submission | VERIFIED | F-07, F-17, F-31 |
| `leave_request` | Three overlapping state columns (`status`, `deputy_status`, `final_status`) plus `finalized_at`: the state machine is enforced only in handlers, and the handlers do not use conditional updates | VERIFIED | F-07, F-17 |
| `teacher_attendance` | Unique `(staff_id, academic_year_id, date)`: good. `status` unconstrained | VERIFIED | F-31 |
| `class_period_subject` | `day_of_week` (1–5) and `period_number` (1–8) have no DB CHECK | VERIFIED | F-31 |
| `class_period_teacher` | No teacher double-booking constraint, by design (combined sessions); detection is application-side (`listPeriodConflicts`) | VERIFIED | — |
| `files` | `user_id ON DELETE CASCADE`: deleting an uploader deletes the file rows, while `inventory_item.image_file_id` is `SET NULL` and the file on disk is never removed | VERIFIED | F-05 |
| `employment_verification`, `password_rotation_history` | Referenced only by `delete-staff.ts` history checks; no writer exists | VERIFIED | F-40 |
| `inventory_*` | Rich CHECK set (`qty >= 0`, `borrowed_qty <= qty`, status/state coherence, dispute ⇒ acknowledged, …), partial unique indexes for open requests and active disposal units | VERIFIED (schema) | — |

### 7.2 Normalization

- **1NF/2NF/3NF** are broadly respected.
- **Intentional, justified denormalization:**
  - `inventory_item.qty` and `borrowed_qty` are stored counters with a ledger (`inventory_transaction` before/after values). This is justified for locking and fast reads, provided the ledger and counters cannot diverge (see §30).
  - `inventory_borrow` stores a borrower snapshot (jsonb), documented as a historical record. Justified.
  - `inventory_audit_log.actor_name` is a snapshot. Justified for audit.
- **Accidental technical debt:**
  - `leave_request` keeps `status` alongside `deputy_status` and `final_status`, where `status` is derivable. Three columns can disagree; no CHECK ties them together (F-31).
  - `short_leave_usage.short_leaves_used` is a stored counter with no ledger, so it cannot be reconciled from source events. UNVERIFIED whether it can drift.

---

## 8. Migration Audit

### 8.1 Fresh database (VERIFIED by execution)

```text
Empty DB → 0000 ok (228 statements) → 0001 ok → 0002 ok → 0003 ok → 0004 ok → 0005 ok → 0006 ok
        → 0007 FAIL statement #1:
          constraint "inventory_audit_log_actor_staff_id_user_id_fk" of relation "inventory_audit_log" does not exist
```

With the 25 `DROP … _user_id_fk` statements skipped, **25 further statements fail**, for example `constraint "inventory_audit_log_actor_staff_id_staff_id_fk" … already exists`. So `0007` is wrong in both halves.

**Root cause (VERIFIED):** `meta/0006_snapshot.json` contains 50 references to `*_staff_id_user_id_fk` (25 FKs pointing at `user(id)`), while the SQL of `0000`–`0006` created those FKs against `staff(id)`. `0005_snapshot.json` and `0007_snapshot.json` contain no `user_id_fk` names. The `0006` snapshot was generated from a working tree in which the inventory staff columns referenced `user.id` (the reverted `6f6e38b` change named in 0007's own comment). `0007` was then generated by diffing against that false snapshot. The SQL was hand-extended (data remap, assertion block, `IF EXISTS` on `staff_nic_format`) but never executed against an empty database.

**Five Whys:**

```text
dev:web fails
↓ db:migrate fails
↓ 0007 drops constraints that do not exist and re-adds ones that do
↓ 0007 was generated against 0006_snapshot.json, which describes a schema the SQL never produced
↓ the snapshot was produced on a branch with a later-reverted schema, and merged without regenerating
↓ there is no CI job that builds a database from 0000 → latest and diffs it against schema/*.ts
```

### 8.2 Existing database upgrade (STRONGLY INDICATED)

`0007` also contains:

- `ALTER TABLE "staff" ALTER COLUMN "nic" SET NOT NULL`
- `ALTER TABLE "inventory_item" ALTER COLUMN "manager_staff_id" SET NOT NULL`
- `ALTER TABLE "inventory_item" ALTER COLUMN "custodian_staff_id" SET NOT NULL`
- a new `staff_nic_format` CHECK

**None of these has a backfill.**

- Any database with a staff row whose NIC is NULL, or an inventory item with no manager or custodian, fails at those statements.
- Any database with a NIC in the "three seeded rows were carrying 10-digit values" state that AGENTS.md describes fails at the CHECK.
- AGENTS.md states: *"rows created before the column became NOT NULL are backfilled by migration `0007`"*. **CONTRADICTED**: 0007 contains no UPDATE of `staff.nic`, `manager_staff_id` or `custodian_staff_id`.

### 8.3 Other migration observations

| Item | Observation | Grade |
|---|---|---|
| `0006` | `DROP TABLE "class_period_assignment" CASCADE`: destructive, and there is no data migration into the new `class_period_subject`/`class_period_teacher` pair. Any timetable in an upgraded DB is lost | VERIFIED (SQL) |
| `0006` vs AGENTS.md | AGENTS.md still describes `class_period_assignment` as the core timetable table and cites `0002_eager_kinsey_walden.sql` / `0004_silly_punisher.sql`, which do not exist | CONTRADICTED |
| Transactions | drizzle-kit applies each migration in a transaction (LIKELY, library behaviour). The `0007` comment relies on this for rollback | LIKELY |
| Idempotency | Only `staff_nic_format` uses `IF EXISTS`; all other DDL is non-idempotent | VERIFIED |
| Data vs schema migration | `0007` mixes a 25-column data remap with DDL in one file | VERIFIED |
| History rewrite | TECHNICAL_REPORT reports the history was regenerated (11 → 8 files); existing DBs have ledger rows for files that no longer exist | LIKELY (reported) |
| `db:push` hazard | AGENTS.md documents that `drizzle-kit push` proposes truncating `grade_subject_config` (326 rows) | Documented; not re-run |
| Deploy path | The Dockerfile never runs migrations; root `dev`/`dev:web` run `db:migrate` before start | VERIFIED |
| `DATABASE_URL` for drizzle-kit | `packages/db/.env.schema` imports `NODE_ENV, DATABASE_*` from `apps/web` and `drizzle.config.ts` uses `varlock/auto-load`. TECHNICAL_REPORT §4.2/§6 #4 claims the package has no source | **CONTRADICTED** (configuration exists). Whether it resolves at runtime is UNVERIFIED |

---

## 9. Seed / Initialization Audit

Two initialization paths exist, and they disagree.

**A. Boot-time bootstrap** (`packages/auth/src/admin.ts`, called from `services.server.ts`):

- Creates 5 seeded users, credential accounts, an `officeStaff` row each (with placeholder NICs `000000000001`–`5`) and the default inventory categories.
- Uses `Promise.all` over 5 independent `ensureBootstrapAccount` calls, with no transaction.
- **Does not re-sync passwords for existing users.** It inserts a credential account only when none exists (`admin.ts:416`). The code comment at `services.server.ts` ("their credentials stay in sync with the environment"), `roles.ts` ("Their password is re-synced from server env on every boot") and AGENTS.md ("re-syncs them on boot") are all **CONTRADICTED** (F-04).
- If a seeded *user* is deleted (possible via F-01 / F-15), the next boot creates a new user and then inserts `seed-staff-<username>` with `onConflictDoNothing({ target: staff.userId })`. The surviving staff row would make the insert conflict on the primary key / NIC instead, which is not covered by that target, so **boot would throw**. This only applies if the staff row survived; `deleteStaff` deletes both. STRONGLY INDICATED (F-15).
- Runs `purgeUnverifiedAccounts` at every boot (and daily via Nitro task).

**B. `scripts/seed.ts`:**

| Scenario | Outcome | Grade |
|---|---|---|
| Fresh DB → seed | Inserts academic year (no policy, entitlements, curriculum, `structure_version_key`) with `isCurrent: true`, then categories, demo teachers, then **fails** on `inventory_item` insert (no `manager_staff_id`, now NOT NULL) | VERIFIED (code + TECHNICAL_REPORT observation) |
| Seed → seed again | Year skipped (exists); teachers skipped by NIC; still fails at equipment | STRONGLY INDICATED |
| Partial failure | Leaves a "current" year that breaks attendance and leave pages (`PRECONDITION_FAILED: Attendance policy is not configured`) | VERIFIED (reported runtime error matches code) |
| Existing DB with a current year → seed for a new calendar year | Inserts a second `isCurrent: true` year without clearing the first | VERIFIED (code) |
| Environment safety | No guard against `NODE_ENV=production`; creates accounts with hard-coded password `teacher-2026-demo` | VERIFIED |
| Dependencies | `import { config } from "dotenv"` but `dotenv` is not declared in any `package.json` (resolves transitively, v16.4.7) | VERIFIED |
| Transactions | None | VERIFIED |

**Root cause:** the seed duplicates domain logic (`createAcademicYear`) instead of calling it, and nothing exercises the seed in CI, so schema changes (`manager_staff_id` NOT NULL) break it silently.

---

## 10. Data Structures Audit

| Location | Structure | Purpose | Complexity | Assessment |
|---|---|---|---|---|
| `list-period-conflicts.ts` | `Map<string, Row[]>` keyed `staffId-day-period` | Group assignments by teacher-slot | O(n) build, O(1) avg lookup | **Appropriate.** Linear in assignments for one year (≈ classes × 40 slots × teachers) |
| `teacher-requests.ts` | `Map<userId, Session[]>`, `Map<userId, Staff>` | Join sessions/staff to requesters | O(n + m) | Appropriate |
| `set-current-year.ts` (`reconcilePositionDerivedRoles`) | `Map<userId, expected>` | Derive roles from positions | O(p) | Structure fine; **logic incomplete** (F-10) |
| `otp-throttle.ts` | Module-level `Map<string, SendRecord>` | Send backoff | O(1) | Entries are only deleted when re-read after TTL, so the map grows with unique addresses for the process lifetime (bounded in practice by sign-ups). Per-process only (F-27) |
| `custody-request-events.ts` | oRPC `EventPublisher` | Live custody notifications | O(subscribers) | Per-process only; events are lost across instances or restarts (F-27) |
| `borrower-picker.tsx` | Full student roll array, linear scan per debounced keystroke | Client-side search | O(N) per keystroke, O(N) memory | Adequate for N ≈ 3,000. Over-fetches the whole roll on every open (F-24) |
| `recordApprovedLeaveAttendance` | `Array.from({length: days})` then per-date query | Expand leave to attendance | O(d) queries | **N+1**: 3–4 statements per working day inside one transaction (F-35) |
| `delete-staff.ts` / `delete-academic-year.ts` | `Promise.all` of 19 / 15 probe queries | Dependency checks | 19/15 round trips, each up to a pool connection | With the default pg pool (max 10) one call can occupy the whole pool (F-35) |
| `inventory-calculations.ts` | Pure functions over counters | Availability arithmetic | O(1) | Appropriate |

No inappropriate data structure was found that would matter at school scale. The issues are query shape (N+1 and fan-out), not in-memory structures.

---

## 11. Algorithm Audit

**Algorithm: teacher double-booking detection** (`listPeriodConflicts`)
- **Input:** all `class_period_teacher ⨝ class_period_subject` rows for a year. **Output:** ids of unmarked overlapping rows.
- **Correctness:** groups by (staff, day, period) and reports unmarked rows in any group of 2 or more. One known limitation: a group where all rows are marked `isCombinedSession` is never reported, even when the classes are unrelated. This is by design.
- **Time:** O(n). **Space:** O(n). **Worst case:** same. **Deterministic:** yes (Map insertion order).
- **Failure:** detection only; writes are not blocked (documented). **Risk:** low.

**Algorithm: working-day leave count** (`countWorkingDays`, `calculateLeaveDays`)
- **Input:** two `YYYY-MM-DD` strings and a day part. **Output:** number of weekdays (0.5 for a same-day half-day).
- **Correctness:** excludes Saturday/Sunday only (no public or school holidays), so holidays consume leave. **Invalid dates are not rejected** (VERIFIED): `2026-02-30` → 1 (rolls into March), `2026-13-45` → 0 (`NaN` length → empty array).
- **Time:** O(days). **Space:** O(days), allocating an array of `Date` per call. Called once per consumed request in `applyLeave`, so O(Σ days).
- **Risk:** **P1** via quota bypass (F-07, F-21).

**Algorithm: leave quota check** (`applyLeave`)
- **Correctness:** counts only `status = "approved"`, ignores `pending`/`recommended`, and is not repeated at `finalizeLeave`. **Incorrect** for the documented rule "quota is enforced at applyLeave" (F-07).
- **Concurrency:** check-then-insert with no lock or constraint (F-17).

**Algorithm: role reconciliation** (`reconcilePositionDerivedRoles`)
- **Input:** positions of the newly current year. **Output:** role updates.
- **Correctness:** only users *with a position in the new year* are considered. A user who was principal last year and has no position this year is never demoted. **Incorrect** (F-10).

**Algorithm: OTP exponential backoff** (`otp-throttle.ts`)
- `cooldown = 30s × 2^(count-1)`, capped at 300s. Correct and terminating. Per-process (F-27).

**Algorithm: inventory availability and custody** (`inventory-calculations.ts`, `inventory-database.ts`)
- Counter arithmetic under `FOR UPDATE`; DB CHECKs as the last line of defence. Appears correct on reading. Not executed.

**Timetable generation:** there is **no generation algorithm**. Timetables are entered manually slot by slot. No search or constraint solver exists, so there is nothing to analyse for exponential complexity.

---

## 12. Algorithm Complexity Analysis

| Area | Complexity | Concern |
|---|---|---|
| Conflict scan | O(n) | none |
| Leave quota | O(r · d) where r = approved requests of that type, d = days each | negligible at school scale |
| Leave approval → attendance | **O(d) sequential DB statements** in one transaction | maternity (84+84 days ⇒ ~120 working days) ⇒ ~400 statements while holding row locks (F-35) |
| `deleteStaff` | 19 parallel probes | pool saturation (F-35) |
| `historical-data`, `listStudents`, `listLeaveRequests`, `listClasses`, … | O(rows) unbounded | grows with years retained (F-24) |
| Student picker filter | O(N) per keystroke, debounced | fine at N ≈ 3k |
| QR sheet | O(Σ copies) QR renders, **unbounded item count** | CPU/memory exhaustion by an authenticated overseer (F-25) |
| Excel import | O(file) parse, **unbounded decompressed size** before the 5,000-row cap | memory exhaustion (F-26) |

No O(n²) or worse algorithms were found in the code reviewed.

---

## 13. Query Performance Audit

- **Pagination:**
  - Server-side paging exists in `listStaff`, `listAccounts`, `listIssues` and `listCustodyHistory`.
  - Inventory list endpoints use a `limit` (default 100, max 500) with no offset or cursor, so results beyond the cap are unreachable rather than paged (`list-transactions.ts:50-51`).
  - About 40 other list procedures have no limit (F-24).
- **Indexes:**
  - Year-scoped tables have single-column `academic_year_id` indexes.
  - There are no composite indexes for the common `(academic_year_id, staff_id)` filters on `leave_request` and `teacher_attendance`. The latter is covered by its unique index's leading column `staff_id`.
  - `leave_request` filters by `(staff_id, academic_year_id, type, payment_status, status)` in `applyLeave` and is served only by `leave_request_staff_idx`. Fine for per-teacher row counts.
- **N+1 patterns:** `recordApprovedLeaveAttendance` (per date) and `delete-*` probes (F-35).
- **Over-fetching:**
  - `marking.listStudents` returns the full roll with no input.
  - `createAcademicYear` selects all academic years to find the most recent, without `LIMIT 1`.
- **Connection pool:** `drizzle(DATABASE_URL)` creates a default `pg.Pool` (max 10). The Nitro purge task creates a new pool per run and never closes it (F-40).

No `EXPLAIN` plans were captured; actual query plans are UNVERIFIED.

---

## 14. Transaction & Consistency Audit

**Transactional (good):**
- every inventory write (25+ procedures);
- `markAttendance`, `recordArrival`, `applyAttendanceImport`;
- `finalizeLeave`;
- `replaceTeacherSubjects`, `updateStaff`;
- the final delete in `deleteStaff`.

**Non-transactional multi-write operations:**

| Procedure | Writes | What a mid-way failure leaves | Issue |
|---|---|---|---|
| `createAcademicYear` | year → grade_subject_config → leave_entitlement → attendance_policy | A year with missing curriculum, entitlements or policy. Attendance and leave review then fail with `PRECONDITION_FAILED` (the exact symptom in TECHNICAL_REPORT §5.2) | F-08 |
| `setCurrentYear` | clear all `is_current` → set one → reconcile roles | Zero current years (all pages that need one fail) or two current years under concurrency; roles half-reconciled | F-09 |
| `createStaff` | staff → staff_position → user → account → staff.user_id | Compensating deletes instead of a transaction; a crash between steps leaves an orphan staff row holding the NIC, or an orphan user holding the username | F-17 |
| `signupStaff` (public) | user → account → staff | Staff insert failure leaves an orphan login holding the NIC-username | F-17, F-18 |
| `createStaffCredential` | user → account | User without credentials | F-17 |
| `assignPosition` / `removePosition` | position → user.role | Position without role or role without position | F-10 |
| `approveTeacherRequest` | staff.employment_status → user.role | Active staff still blocked as requester | F-17 |
| `assignClassTeacher` | class → history | Homeroom changed without an audit row (or the reverse) | F-17 |
| `set-subject-selection`, `assign-student-to-class` | 2 writes each | Inconsistent student state | F-17 |
| `ensureBootstrapAccount` | user → account → staff | Seat without staff row | F-17 |

---

## 15. Concurrency Audit

| Scenario | Behaviour | Grade |
|---|---|---|
| Two administrators switch year simultaneously | Both clear, both set: **two current years** (no DB constraint) | STRONGLY INDICATED (F-09) |
| Teacher double-clicks "Apply leave" | Both pass the overlap check before either inserts: **duplicate requests** | STRONGLY INDICATED (F-17) |
| Principal double-submits approval | `finalizeLeave` reads without `FOR UPDATE` and updates without `WHERE finalized_at IS NULL`. Both transactions proceed. The attendance insert or `teacher_period_absence` unique key then either produces a 500 or a double write | STRONGLY INDICATED (F-17) |
| Deputy recommends while teacher cancels | Both read `pending`; last writer wins; a cancelled request can become `recommended` | STRONGLY INDICATED (F-17) |
| Several pending leaves approved independently | Quota never re-checked: over-entitlement | VERIFIED (code) (F-07) |
| Concurrent inventory moves on one item | Serialized by `FOR UPDATE` on the item; unique indexes as backstop | STRONGLY INDICATED (correct) |
| Concurrent issue of the same unit | Unique-violation path exists but uses message matching, so it returns **500**, not the intended 409 | VERIFIED (F-06) |
| Concurrent attendance marking | Transaction plus unique `(staff, year, date)`; a racing insert yields a unique violation (500) rather than a merge | LIKELY |
| Delete staff while a leave is inserted | Probe-then-delete with no lock: `leave_request.staff_id ON DELETE CASCADE` silently deletes the new leave | STRONGLY INDICATED (F-32) |

No optimistic locking or version columns exist anywhere. No idempotency keys exist.

---

## 16. Business Logic Audit

| Rule | Implementation | DB enforced | Backend | Frontend | Tests | Status |
|---|---|---|---|---|---|---|
| One current academic year | `setCurrentYear` | **No** | partial (non-atomic) | switcher | none | **Violable** (F-09) |
| Closed years are read-only | route guard `loadAcademicYearRoute` | No | **No** | yes | none | **UI-only** (F-22) |
| Leave quota per type/payment/year | `applyLeave` | No | approved-only, not at approval | yes | none | **Violable** (F-07) |
| Leave dates inside the year, end ≥ start | `applyLeave` | No | yes (lexical; invalid dates accepted) | yes | none | Partial (F-21) |
| No overlapping leave | `applyLeave` | No | check-then-insert | — | none | Racy (F-17) |
| Maternity not for male staff | `applyLeave` | No | yes (`gender === "male"` only; NULL gender allowed) | yes | none | OK, by design |
| Deputy recommends → Principal approves | `leadership-review.ts` | No | yes, with override reason for bypass | yes | none | Partial: can approve a cancelled request (F-07) |
| Leadership role follows position | `assignPosition` / `removePosition` / reconcile | No | incomplete | **no UI** | none | **Broken** (F-10, F-13) |
| Only teacher/user role changes via admin plugin | `databaseHooks.user.update` | No | update only | — | none | **Bypassable** (F-01) |
| Seeded seats cannot be banned or re-roled | same hook | No | update only | yes | none | Delete/password/create not covered (F-01, F-15) |
| NIC format | valibot `nicSchema` + DB CHECK | **Yes** | yes | yes | none | **OK** (duplicated deliberately) |
| Teacher double-booking | `listPeriodConflicts` (detect only) | No (by design) | detection | yes | none | OK as documented |
| Stock never negative, borrowed ≤ qty | CHECKs + locks | **Yes** | yes | yes | none | **OK** |
| Teacher enters marks only for own homeroom class | `assertCanEnterMarkForAssignment` | No | yes | **no UI** | none | API-only |
| Unverified accounts expire after 7 days | purge | No | yes | — | none | Leaves orphan staff rows (F-18) |

---

## 17. Authentication Audit

| Control | State | Grade |
|---|---|---|
| Password hashing | better-auth default (scrypt) | LIKELY (library default) |
| Session storage | DB `session` table; multiSession, max 5 per browser | VERIFIED (config) |
| Cookie flags | better-auth defaults: HttpOnly; `SameSite=Lax`; `Secure` when base URL is https | LIKELY (library defaults; not observed on the wire) |
| CSRF | better-auth origin check (`trustedOrigins`); oRPC `StrictGetMethodPlugin` on (default `true`, VERIFIED in `@orpc/server` fetch adapter); mutations are POST with SameSite=Lax cookies | LIKELY adequate |
| Brute force | better-auth rate limiter is on in production by default with in-memory storage, so it is per process. The custom `signupStaff` is an oRPC procedure and **not** covered (F-19) | LIKELY |
| OTP | 6 digits, 10-minute expiry, hashed storage, 3 attempts, per-IP rate limit, per-address backoff | VERIFIED (config) |
| Email delivery | **Throws in production** (`email.ts:60`): verification, password reset and email change cannot work | VERIFIED (F-12) |
| Seeded credentials | Fixed usernames; passwords from env **only at first creation** (F-04); one equals the committed example (F-03) | VERIFIED |
| Initial staff password | `${randomUUID()}Aa1!` returned in the API response and shown once; account is `emailVerified: true` with no forced change | VERIFIED; P2 (F-19) |
| Password policy | `signupStaff` minLength 8; `strongPasswordSchema` (12+, classes) exists but is used only in `teacher-validation.ts` | VERIFIED (F-19) |
| Session invalidation on ban | better-auth admin plugin revokes sessions on ban | LIKELY |
| Session fixation | handled by better-auth (new token on sign-in) | LIKELY |

---

## 18. Authorization Audit

### 18.1 Role → capability map (from code)

| Role | Tiers admitted | better-auth statements | Notable |
|---|---|---|---|
| `admin` | all | adminAc + all app resources | top seat |
| `principal`, `vicePrincipal` | admin, academic, teacher, overseer | **adminAc** + staff/assignment/qualification/file/inventory incl. take/manageOwn | bypass `requirePermission` |
| `academicAdmin` | academic, adminOrAcademic | **adminAc** + staff/assignment/qualification | not in `ADMIN_ROLES` |
| `inventoryAdmin` | overseer, manager | inventory (no take/manageOwn) | upload route allowed |
| `teacher` | teacher | student:read, mark:*, exam:read, assignment:read, inventory:read/acknowledge | **no `qualification`** |
| `teacher-requester`, `user` | — | qualification create/read | |

### 18.2 Conceptual attack results

| Attack | Result | Grade |
|---|---|---|
| Unauthenticated → protected procedure | `UNAUTHORIZED` | VERIFIED (middleware) |
| Unauthenticated → `signupStaff` | Allowed by design; creates accounts with no rate limit (F-19) | VERIFIED |
| Teacher → admin procedures | Role tiers refuse | VERIFIED (code) |
| Teacher → another teacher's leave | `cancelLeave` checks `staffId` ownership | VERIFIED |
| Teacher → own qualifications | **Refused**: role lacks `qualification` | VERIFIED (F-13) |
| Inventory Admin → academic procedures | Refused by tiers | VERIFIED |
| Inventory Admin → student roll (needed for loans) | **Refused** (`student:read` missing), breaking the student borrower picker | VERIFIED (code) (F-23) |
| Inventory Admin → admin session | Via stored XSS in uploads | STRONGLY INDICATED (F-05) |
| Academic Admin → inventory | Refused | VERIFIED |
| **Academic Admin / Principal / Deputy → create a new `admin` user** | `POST /api/auth/admin/create-user {role:"admin"}`: permission `user:create` + `user:set-role` held; `admin` is a configured role; **no `user.create` hook** | **STRONGLY INDICATED** (library source read: `routes.mjs:133-200`) (F-01) |
| **… → reset the top admin's password** | `POST /api/auth/admin/set-user-password {userId:<admin>}`: `user:set-password` held; no target-role check; no hook on account update | **STRONGLY INDICATED** (`routes.mjs:802-830`) (F-01) |
| **… → impersonate Principal/Deputy/any non-`admin`** | `adminRoles` defaults to `["admin"]`; only those are protected | STRONGLY INDICATED (`routes.mjs:585-592`) (F-01) |
| **… → delete the admin login** | `remove-user` (`user:delete`), or `staff.deleteStaff` on `seed-staff-admin` (no history rows) | STRONGLY INDICATED (F-01, F-15) |
| Vice Principal → make anyone Principal | `assignPosition` (adminProcedure) sets role `principal` | VERIFIED (code), probably intended |
| Year-scoped writes to a closed or soft-deleted year | Accepted by API | VERIFIED (code) (F-22) |
| Any signed-in account (incl. unverified `user`) → `attendance.getPolicy(any year)` | Allowed (`protectedProcedure`) | VERIFIED (low sensitivity) |

**False confidence:** `permissions.ts:187-195` states that the `adminAc` grant "buys account administration and nothing else", because the role-transition hook refuses every role change except to `teacher`/`user` and seeded accounts are protected. The hook is attached to `user.update` only, so creation-with-role, password set, deletion and impersonation are outside it.

---

## 19. Security Audit

| Attack surface | Entry point | Missing control | Impact | Evidence | Recommended control | Verification |
|---|---|---|---|---|---|---|
| Account administration | `/api/auth/admin/*` | Role scoping on create/set-password/remove/impersonate | Full takeover (F-01) | `permissions.ts:94,122,140,210`; `index.ts:177-235` (update hook only) | Give non-admin seats only `user:[list,get,ban]`, `session:[list,revoke]`; add `databaseHooks.user.create.before` refusing non-`teacher`/`user` roles; add `adminRoles: ["admin","principal","vicePrincipal","academicAdmin","inventoryAdmin"]` | Integration test per endpoint × role |
| File upload | `/api/files/upload` | Extension bound to verified type; content sniffing; `nosniff`; separate origin | Stored XSS → admin session (F-05) | `files.upload.ts:43,78,96` | Derive extension from an allow-listed MIME map; verify magic bytes; serve via a handler with `Content-Type` from DB, `X-Content-Type-Options: nosniff`, `Content-Disposition` | Upload `x.html` with `image/png`; expect rejection |
| Secrets | `apps/web/.env.example` | Placeholders only | Credential disclosure (F-03) | Hash comparison (this audit) | Replace example values with empty strings; rotate the Academic Admin password; refuse boot if a seeded password equals the example | Boot check test |
| Public sign-up | `staff.signupStaff` | Rate limit, CAPTCHA, enumeration resistance, NIC ownership proof | Spam accounts, CPU via hashing, NIC squatting, NIC/email enumeration (F-18, F-19) | `signup.ts` | Rate-limit by IP; generic conflict messages; NIC claim requires admin match | Load test; enumeration test |
| Excel import | `staff.imports.parseExcel` | Decompressed-size limit | Memory exhaustion (F-26) | `parse-excel.ts`, `excel-import.ts:77-78` | Inspect zip entry sizes before `xlsx.load`; stream reader | Zip-bomb fixture |
| QR export | `inventory.items.exportQrSheet` | Item count bound; origin validation | CPU exhaustion; QR labels that point to an attacker host (F-25) | `export-qr-sheet.ts:205-250` | `maxLength` on `items`, total-copies cap; derive origin from `BETTER_AUTH_URL` | Unit test |
| API reference | `/api/rpc/api-reference` | Auth | Procedure enumeration (low; schemas likely empty, F-41) | `rpc/$.ts` | Disable in production or require admin | — |
| Logging | `onError → console.error(error)` | Redaction | `DrizzleQueryError` messages include SQL params (names, NIC, phone, email) in logs (F-34) | `rpc/$.ts` | Structured logger with redaction; log `cause.code` | Log review |
| Infrastructure | `docker-compose.yml` | Strong DB password; non-public port | DB published on host port 3000 with default password `password` (F-28) | compose file | Require `POSTGRES_PASSWORD`; bind to 127.0.0.1 | — |
| SQL injection | Drizzle query builder throughout; `sql\`1 = 1\`` is static | — | None found | grep | — | — |
| XSS (render) | No `dangerouslySetInnerHTML`; no unsafe `target=_blank` | — | None found | grep | — | — |
| Dependency CVEs | — | `bun audit` not run | UNVERIFIED | — | Add an audit step to CI | — |

---

## 20. API Audit

- **Shape:** ~190 procedures across `staff` (incl. leaves, periods, attendance, exports, imports), `marking` and `inventory`. Inputs are validated by valibot on every procedure reviewed. Outputs are hand-mapped DTOs (dates as ISO strings).
- **Error semantics:**
  - Domain errors use `ORPCError` with sensible codes (`NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `FORBIDDEN`).
  - **11 sites** map unique violations by `error.message.includes(<constraint>)`, which never matches drizzle 0.45's `DrizzleQueryError` (VERIFIED). These conflicts become **500 INTERNAL_SERVER_ERROR**: `create-staff.ts:98,103`, `update-staff.ts:123,129-130`, `create-class-period-subject.ts:71`, `assign-teacher-to-period-subject.ts:91`, `create-item.ts:328,452`, `create-issue.ts:315`, `finalize-disposal.ts:193`. The correct pattern already exists in `create-borrow.ts:85-110` (`isUniqueViolation` checks `cause.code === "23505"`) (F-06).
  - Duplicate academic year, duplicate class name and duplicate position insert have no mapping at all → 500.
- **Idempotency:** none. Retries of non-idempotent POSTs duplicate work (leave requests, sign-ups).
- **Rate limiting:** none at the oRPC layer.
- **Dead/undocumented endpoints (no UI caller, VERIFIED by grep):**
  - staff: `assignPosition`, `removePosition`, `upsertLeaveEntitlement`, `listLeaveEntitlements`, `seedLeaveEntitlements` (×2), `uploadQualification`, `getStaff`, `listGrades`, `listPositions`, `listClassTeacherHistory`, `exports.classTeacherHistoryExcel`;
  - periods: `listUnassignedSlots`, `listPeriodConfig`;
  - attendance: `getTeacherAttendance`, `listTeacherAttendanceRange`;
  - inventory: `custody.requests.decide`, `items.void`, `items.unvoid`, `custody.takeable.listTakeableItems`, `borrows.punctualityScore`;
  - marking: 17 of 18 procedures.
- **Duplicate registration:** `seedLeaveEntitlements` is mounted both at `staff.seedLeaveEntitlements` and `staff.leaves.seedLeaveEntitlements`.

---

## 21. Frontend Architecture Audit

- **Routing:** file-based, role-scoped workspaces with a `$year` path segment. Guards live in route `beforeLoad` (role) and `loadAcademicYearRoute` (year). Navigation only offers links each seat's procedures accept.
- **Data:** TanStack Query via `@orpc/tanstack-query`; SSR loaders use an in-process router client. Global `QueryCache.onError` shows a toast with retry. `staleTime` 60s. 34 `invalidateQueries`, 0 optimistic updates.
- **State:** list state in the URL for accounts, teachers, leave, historical data and timetables (consistent with AGENTS.md). Inventory filters are component state (documented).
- **Size and cohesion:** 10 files exceed 1,000 lines, e.g. `inventory-page.tsx` 2,003; `use-attendance-page.ts` 1,845; `item-form-fields.tsx` 1,450; `loans-ledger.tsx` 1,426; `stock-in-dialog.tsx` 1,236; `ledger-views.tsx` 1,208; `my-equipment.tsx` 1,178. These are god-component and god-hook candidates (F-39).
- **Error handling:** no `errorComponent` and no `ErrorBoundary` anywhere in `apps/web/src` (VERIFIED), so render errors fall back to the router default.
- **Accessibility:** 472 `aria-*` usages and labelled fields via `FieldGroup`/`Field`. Not tested with axe, keyboard-only or a screen reader (UNVERIFIED).
- **Duplicate React key:** fixed locally, uncommitted.
- **Comment drift:** `borrower-picker.tsx:560` claims the `teacher` role holds `inventory: ["read","take","manageOwn"]`; `permissions.ts` grants `["read","acknowledge"]` (CONTRADICTED).

---

## 22. Backend Architecture Audit

- **Layering:** handlers talk to Drizzle directly. There is no service or repository layer outside inventory (`inventory-database.ts` is a shared helper module). Business rules sit inside handlers, which is why the same rule is written twice (e.g. date validation in attendance vs leave; constraint mapping in `create-borrow` vs 11 other files).
- **Context:** `createContext` is called **twice** for any `/api/rpc/api-reference` request (once for RPC, once for OpenAPI), costing two session lookups (minor).
- **Startup coupling:** `services.server.ts` performs DB writes at module load (top-level `await`). A DB outage at boot crashes the server, and any request path importing `services.server` triggers bootstrap.
- **Process-local state:** OTP throttle, better-auth rate limiter (memory), custody `EventPublisher`. All break under horizontal scaling (F-27).

---

## 23. Performance Audit

- **Frontend:** bundle size, hydration and rendering cost were **not measured** (UNVERIFIED). Large route modules (2,000+ lines) and whole-roll fetches are the visible risks. Unused dependencies are shipped as declared deps but are tree-shaken if never imported (LIKELY).
- **Backend:** the N+1 in leave approval; fan-out probes in deletes; synchronous PDF/Excel/QR generation in the request thread (exceljs/pdfmake/qrcode are CPU-bound and block the event loop).
- **Database:** see §13. No plans captured.

---

## 24. Scalability Audit

Order-of-magnitude reasoning only; no benchmarks were run.

| Users | Expected behaviour | Limiting factor |
|---|---|---|
| 10–100 | Fine | — |
| 500 (all staff + office) | Fine for reads. Exports and QR sheets can stall the single Node process for seconds | CPU-bound generation on the request path |
| 1,000–5,000 (if students or parents were ever given accounts) | Pool of 10 connections; unbounded lists; in-memory rate limits | pg pool, unbounded queries, single process |
| 10,000 | Requires multiple instances, which breaks OTP throttle, rate limiting and live custody events, and the local-disk uploads | Process-local state (F-27), local uploads (F-05/F-28) |

At its realistic scale (one school: ~150–250 staff, ~3,000 students) the architecture is adequate once the unbounded endpoints are capped.

---

## 25. Testing Audit

**There are no test files in the repository** (`find -name "*.test.*" -o -name "*.spec.*"` returns nothing outside `node_modules`). `jsdom` and `@testing-library/react` are installed but unused. CI runs only `ultracite check`.

| Module | Unit | Integration | API | E2E | Security | Edge cases | Status |
|---|---|---|---|---|---|---|---|
| All modules | 0 | 0 | 0 | 0 | 0 | 0 | **Untested** |

The only behavioural evidence available is the Playwright page-load crawl described in TECHNICAL_REPORT §5. That shows routes render. It does not show that mutations, authorization, transactions, exports or uploads work (see §67 of the brief).

---

## 26. Error Handling Audit

- **Swallowed or mis-classified:** unique violations → 500 (F-06). `parseExcel` echoes raw library error text to the client (low risk).
- **Logged:** `console.error(error)` only, with no request id, user id or redaction (F-34).
- **Production email** throws by design, which is correct, but the user-facing flows have no alternative path (F-12).
- **Frontend:** global toast on query errors; no route error boundaries.
- **Boot:** `ensureBootstrapUsers` failure aborts the server (top-level await), which is desirable for misconfiguration but turns a single bad seeded row into an outage (F-15).

---

## 27. Reliability Audit

For each critical workflow, "what happens if it fails halfway?" (details in §14):

- **Create academic year:** partial year; manual SQL repair needed (as done in TECHNICAL_REPORT §5.2).
- **Switch year:** zero or two current years; role drift.
- **Create staff / sign-up:** orphan staff or user rows blocking a NIC.
- **Approve leave:** transactional, so safe, but racy under double submit.
- **Inventory movements:** transactional and locked, so safe.
- **Boot bootstrap:** five parallel non-transactional seat creations; a mid-way failure leaves a seat without a staff row, which the next boot repairs.

There are **no backups, no restore procedure and no runbook** in the repository (UNVERIFIED whether any exist outside it).

---

## 28. Observability Audit

| Capability | Present |
|---|---|
| Structured logs / request IDs | No |
| Error IDs returned to users | No |
| Domain audit log | **Inventory only** (`inventory_audit_log`, `inventory_transaction`, custody history); homeroom history (`class_teacher_assignment_history`) |
| Audit of account administration (role changes, password sets, bans, impersonation) | **No** |
| Audit of leave decisions | Partially (actor and time columns on the row; no history of changes) |
| Metrics, tracing, health endpoint | Docker healthcheck hits `/` only |
| DB slow-query logging | Not configured in repo |

Missing: an audit trail for the exact operations F-01 exploits.

---

## 29. DevOps / Deployment Audit

| Item | Finding | Grade |
|---|---|---|
| CI | Lint only; no `tsc`, build, migrations-from-scratch, seed or tests | VERIFIED (F-29) |
| CI status | `ultracite check` currently fails on 4 `react(purity)` errors (`academic-year-bootstrap.tsx:54`, `academic-year-switcher.tsx:241`, `academic-years-page.tsx:296`, `use-attendance-page.ts:763`) | VERIFIED |
| CI auto-fix | Push job with `contents: write` runs `bun run fix` and **pushes commits to any branch**, including `master`, on every push | VERIFIED (F-29) |
| Docker build | Mounts a `server_env` secret for a non-existent `apps/server`; copies the whole builder tree (including dev dependencies) into the runner | VERIFIED |
| Migrations on deploy | None | VERIFIED (F-28) |
| Uploads in production | Written to `apps/web/public/uploads` at runtime. Nitro's node-server serves `.output/public`, built at build time, so runtime files are likely **not served**; there is also no volume, so files are lost on redeploy | STRONGLY INDICATED (F-28) |
| Postgres | `postgres:18`, host port 3000, default password `password` | VERIFIED |
| Backups | None defined | VERIFIED (in repo) |
| Bun version | Local 1.3.13 vs `packageManager` 1.4.0; lockfile v2 needs the newer Bun | VERIFIED |
| Line endings | `core.autocrlf=true`, no `.gitattributes` → spurious format failures on Windows | VERIFIED |

---

## 30. Git / Branch Audit

- **`develop` is fully merged** into `master` (`e62ed14`), so there is nothing left to integrate from it. The TECHNICAL_REPORT statements "Integration with master: Not done" and "develop conflicts with master in 51 files" are **CONTRADICTED**. Its §2.5 caveat still stands (signed-in pages not visually reviewed).
- **Remote `master` is ahead** of local (`28327c2`, per dry-run fetch). Its content was not inspected. Pull before acting on this report, since some findings may already be addressed there.
- **`origin/all-changes-2026-09-21`** is fully contained in `master` (0 ahead, 60 behind) and can be deleted after confirmation.
- **Uncommitted:** the React key fix (`admin-users-content.tsx`). It is correct; commit it.
- **Migration history** was rewritten in the past (TECHNICAL_REPORT), and the `0006` snapshot came from a reverted schema state (§8). The migration folder is the riskiest artefact in the repository.
- Do **not** force-push: nothing in the history requires it.

---

## 31. Dependency Audit

| Finding | Evidence | Severity |
|---|---|---|
| `dotenv` used by `scripts/seed.ts` but undeclared (phantom dependency) | `node_modules/dotenv` 16.4.7 present transitively | P2 |
| Declared but never imported: `@fontsource-variable/{figtree,inter,roboto}`, `cmdk`, `next-themes`, `@tanstack/react-form`, `web-vitals`, `zod` (root + web + api + auth), `@orpc/valibot` | grep over `apps/web/src` and `packages/*/src`: 0 references | P3 |
| `cn` declared `^0.3.0` in web and `^0.2.5` in ui; hoisted copy is 0.2.6 | `node_modules/cn/package.json` | P3 |
| OpenAPI reference uses `ZodToJsonSchemaConverter` while every schema is valibot: the reference is LIKELY schema-less | `rpc/$.ts` | P3 |
| `better-auth` pinned to 1.7.5 (good); `nitro` on a dated beta `3.0.260903-beta` | `apps/web/package.json` | P2 (beta runtime in production) |
| `pdfmake` 0.3 with hand-typed printer and a resolver workaround for an upstream regression | `lib/export.ts` comments | P3 |
| Vulnerability scan | not run | UNVERIFIED |

---

## 32. Code Quality Audit

- **Strengths:** consistent naming; exhaustive explanatory comments; branded IDs; valibot schemas derived from Drizzle tables; careful inventory transaction design.
- **Duplication:**
  - constraint-violation detection (12 sites, 2 patterns);
  - date validation (`assertCalendarDate` vs regex-only `isoDateSchema`);
  - role lists repeated in `index.ts` (`ADMIN_ROLES`), `roles.ts`, `upload-qualification.ts`, `list-qualifications.ts`, `teacher-requests.ts` (`APPROVER_ROLES`), `files.upload.ts` (`isAllowedRole`), and `INVENTORY_SELF_SERVICE_ROLES` (self-declared hazard in `roles.ts`).
- **Comment drift:** comments assert guarantees the code does not provide (password re-sync, `adminAc` "nothing else", teacher inventory grants, backfill). Comments are treated as documentation, so drift here is a correctness risk, not a style issue.
- **Dead code:** `createPeriodConfig` stub; unused tables; 30+ unreachable procedures (§20).
- **Lint:** 4 `react(purity)` errors (`new Date()` during render).

---

## 33. Technical Debt Audit

| Debt | Class | Reason |
|---|---|---|
| Migration history inconsistent with snapshots | **Critical** | Blocks every new environment; can corrupt an upgrade |
| Authorization defined by library defaults (`adminAc`) | **Critical** | Silent privilege grants |
| No tests | **High** | Every finding in this report would have been caught by a basic integration test |
| Non-atomic multi-writes in the staff/academic domain | **High** | Partial state already observed in practice |
| Docs and comments asserting false guarantees | **High** | Misleads maintainers (and this audit's brief) |
| API-only modules (marking, positions, quotas) | Medium | Dead weight plus untested attack surface |
| God components / hooks | Medium | Maintainability |
| Unbounded list endpoints | Medium | Future performance |
| Unused deps / tables | Low | Hygiene |

---

## 34. Unknown / Unverified Areas

Not verified, and not to be treated as healthy:

1. **Every mutation at runtime.** No procedure was invoked. Behaviour is inferred from code.
2. **better-auth cookie attributes** on the wire (Secure / HttpOnly / SameSite) and rate-limit behaviour in production mode.
3. **The F-01 exploit chain end to end.** The library source and the app configuration were read, but no request was sent. Confirm with an integration test before and after the fix.
4. **Excel/PDF exports, QR sheet rendering, QR scanning, file upload** in a browser or production build.
5. **Whether uploads are served in a production build** (Nitro `public` handling).
6. **The contents of remote `master` `28327c2`.**
7. **The state of the local `-v2` database** (built by `push`; not inspected), and whether the old database has data worth migrating.
8. **Query plans and real dataset sizes.**
9. **Accessibility** (axe, keyboard, screen reader, zoom).
10. **Signed-in visual typography** (carried over from TECHNICAL_REPORT §2.5).
11. **Dependency vulnerabilities** (`bun audit` / OSV not run).
12. **Whether the repository is public.** This determines whether F-03 is a live exposure.
13. **Backups, hosting, TLS termination and production configuration.** Nothing in the repository describes them.
14. **Whether drizzle's migrator re-applies an edited, already-recorded migration** (it tracks by `created_at`; LIKELY it does not). This matters for the F-02 fix strategy.
15. **Inventory counter ↔ ledger reconciliation.** There is no job that proves `qty` equals the sum of the ledger. Consistency is argued from locks, not checked.

---

## 35. Complete Issue Register

| ID | Category | Location | Issue | Evidence | Impact | Sev. | Root cause | Recommended fix |
|---|---|---|---|---|---|---|---|---|
| F-01 | SECURITY, ARCHITECTURE | `packages/auth/src/permissions.ts:94,122,140,210`; `packages/auth/src/index.ts:177-235` | principal/vicePrincipal/academicAdmin hold full `adminAc` (`user:create, set-role, set-password, delete, impersonate, set-email, update`, `session:*`); only `user.update` is hooked | better-auth `routes.mjs:133-200` (create-user), `802-830` (set-user-password), `585-592` (impersonation guard = `adminRoles`, default `["admin"]`) | Mint admin users, reset the admin password, impersonate leadership, delete accounts | **P0** | Authorization delegated to library defaults; hook covers one verb | Narrow statements to what the users page needs; add `user.create`/`delete` hooks and an account-update hook protecting seeded/admin targets; set `adminRoles` to every privileged role; audit-log admin-plugin calls |
| F-02 | DATABASE, DEVOPS | `packages/db/src/migrations/0007_quiet_mother_askani.sql`, `meta/0006_snapshot.json` | Fresh install fails; 25 drops + 25 adds invalid | Executed on scratch DB (this audit) | No new environment, CI DB or production deploy can be built from migrations | **P0** | Snapshot generated from a reverted schema; no migrate-from-zero check | Rewrite 0007 with `DROP CONSTRAINT IF EXISTS` for both name variants before `ADD`; correct the 0006 snapshot; add a CI job: empty DB → migrate → `drizzle-kit generate` must report no changes |
| F-03 | SECURITY, CONFIGURATION | `apps/web/.env.example` | Live `ACADEMIC_ADMIN_PASSWORD` equals the committed example | SHA-256 comparison (this audit) | Anyone reading the repo can sign in as Academic Admin; with F-01, as admin | **P0** (this env) | Example file holds real-looking values; no boot-time check | Blank all secret values in `.env.example`; rotate now; refuse boot when a seeded password equals the example or is shorter than 12 chars |
| F-04 | SECURITY, DOCUMENTATION | `packages/auth/src/admin.ts:383-440`; comments in `services.server.ts`, `roles.ts`; AGENTS.md | Seeded passwords are not re-synced on boot | Code path | Rotating env passwords has no effect; a compromised seat stays compromised | **P1** | Comment and implementation diverged | Decide the policy: either update the hash on boot when it differs, or document that env sets the initial password only; fix all three comments |
| F-05 | SECURITY, RELIABILITY | `apps/web/src/routes/api/files.upload.ts:43,78,96` | Extension from client filename; MIME is client-declared; files served same-origin from `public/` | Code path | Stored XSS from the inventoryAdmin seat into admin sessions; uploads likely unserved in production and lost on redeploy | **P1** | Hand-rolled upload with static-dir storage | MIME→extension allow-map; magic-byte check; store outside the web root and serve via a handler with explicit headers; persistent volume or object storage; delete orphan files |
| F-06 | BUG, ERROR HANDLING | 11 sites (§20) | `error.message.includes(constraint)` never matches `DrizzleQueryError` | Executed: message lacks name; `cause.code=23505` | Duplicate NIC/service no./slot/teacher/SKU/unit → HTTP 500 and a misleading UI | **P1** | Library upgrade changed error shape; pattern copied | Extract `create-borrow.ts`'s `isUniqueViolation` into a shared helper that also returns `cause.constraint`; replace all 11 sites |
| F-07 | BUSINESS LOGIC, DATA INTEGRITY | `leaves/apply-leave.ts:169`; `leaves/leadership-review.ts:346-370`; `db/constants/leave.ts:69-104` | Quota counts only approved; not re-checked on approval; cancelled requests approvable with override; invalid dates count 0 days | Code path; date math executed | Leave entitlement exceeded; payroll/HR records wrong | **P1** | Rule split across two procedures; no state-machine guard | Count pending + recommended + approved in `applyLeave`; re-check inside `finalizeLeave` with `FOR UPDATE`; refuse finalize unless status ∈ {pending, recommended}; validate real calendar dates (reuse `assertCalendarDate`) |
| F-08 | DATA INTEGRITY, RELIABILITY | `staff/create-academic-year.ts:89-145` | Four inserts without a transaction; duplicate year → 500; `mostRecent` includes soft-deleted years | Code path; the partial state was observed (TECHNICAL_REPORT §5.2) | Year without policy/entitlements/curriculum breaks attendance and leave | **P1** | No transaction | Wrap in `db.transaction`; map 23505 to CONFLICT; filter `deleted_at IS NULL` for defaults |
| F-09 | DATA INTEGRITY, CONCURRENCY | `staff/set-current-year.ts:139-150`; `scripts/seed.ts:70`; schema | Two current years possible; soft-deleted year can be made current | Code path | Every "current year" query (`.limit(1)`) picks arbitrarily: leave, attendance, staff creation hit the wrong year | **P1** | No DB invariant; non-atomic switch | Partial unique index `ON academic_year (is_current) WHERE is_current`; switch in one transaction; refuse `deleted_at IS NOT NULL` |
| F-10 | SECURITY, BUSINESS LOGIC | `set-current-year.ts:22-120`; `assign-position.ts`; `remove-position.ts:67` | Users without a position in the new year keep leadership roles; `removePosition` sets officeStaff to `teacher`; `assignPosition` can rewrite an `admin` user's role | Code path | Former principals/deputies keep `adminAc` (see F-01) | **P1** | Reconciliation iterates positions, not users | Reconcile over all users whose role is position-derived; never touch `admin`/seeded; use category-aware fallback; transaction |
| F-11 | RELIABILITY, DEVOPS | `scripts/seed.ts` | Fails on `manager_staff_id`; bypasses `createAcademicYear`; second current year; undeclared `dotenv`; hard-coded demo passwords; no prod guard | Code path; failure reported | Broken onboarding; risk of demo accounts in production | **P1** | Seed duplicates domain logic; not run in CI | Call the shared year-creation function; set manager/custodian; refuse in production; declare `dotenv` or use varlock; run in CI |
| F-12 | RELIABILITY, BUSINESS LOGIC | `packages/auth/src/email.ts:60` | No mail transport in production; sends throw | Code path | Password reset, email verification and change-email impossible in production; teacher self-registration cannot complete (approval requires a verified email) | **P1** (prod blocker) | Integration never built | Integrate SMTP/transactional mail; until then hide the flows in production and document admin-issued accounts |
| F-13 | BUG, UX | §20 dead-endpoint list | Custody requests never decidable in UI; quotas, positions, qualifications, void/unvoid, marking unreachable; `teacher` role has no `qualification` grant | grep: 0 web references | Features appear present but cannot complete | **P1** (custody, positions) / P2 (others) | Backend built ahead of UI; no workflow tests | Build or remove: custody `decide` UI for the custodian; positions UI; quota editor; grant `qualification:create/read` to `teacher` or drop the feature |
| F-14 | DATABASE, MIGRATION | `0007` lines 151-153, 178-179 | `SET NOT NULL` and CHECK without backfill; AGENTS.md claims a backfill | SQL | Upgrades of existing DBs fail | **P1** | Generated DDL not paired with data migration | Add explicit backfill/validation steps (or a pre-flight query that reports offending rows); correct AGENTS.md |
| F-15 | BUG, SECURITY | `delete-academic-year.ts:56,58`; `create-staff.ts:126`; `delete-staff.ts` | Year delete always refused (entitlements/policy always exist); staff delete always refused for staff created with a current year; seeded staff rows (and their logins) are deletable | Code path | Two delete buttons that never succeed; the admin login is deletable by any `staff:delete` holder | **P1** | Dependency lists ignore rows the system itself creates | Exclude auto-created rows from the refusal (delete them in the same transaction); forbid deleting seeded staff rows |
| F-16 | TESTING | repository-wide | Zero tests; CI lint only | `find` | No regression protection; all findings here undetected | **P1** | Test infrastructure never adopted | See §41 |
| F-17 | CONCURRENCY, DATA INTEGRITY | `apply-leave.ts`, `leadership-review.ts` (recommend/finalize), `cancel-leave.ts`, `create-staff.ts`, `signup.ts`, `assign-class-teacher.ts`, `teacher-requests.ts` | Check-then-act without locks or conditional updates; compensating deletes instead of transactions | Code path | Duplicates, lost updates, orphans | P2 | No concurrency design outside inventory | Conditional `UPDATE … WHERE status = $expected RETURNING`; transactions; client-side submit disabling as UX only |
| F-18 | DATA INTEGRITY, SECURITY | `admin.ts` purge; `staff.user_id ON DELETE SET NULL`; `signup.ts` | Purged sign-ups leave staff rows holding the NIC; anyone can claim any NIC at sign-up | Code path | The real person cannot register, and admin `createStaff` collides (500 via F-06) | P2 | NIC claimed before identity is established | Purge the linked staff row when it has no other history; require admin matching of NIC on approval |
| F-19 | SECURITY | `signup.ts` | No rate limit; min password 8; NIC/email enumeration; initial staff password returned and never forced to change | Code path | Abuse, weak credentials | P2 | Custom endpoint outside better-auth protections | Rate-limit; reuse `strongPasswordSchema`; generic messages; force password change on first sign-in |
| F-20 | DATA INTEGRITY | 92 `timestamp` columns; `inventory-calculations.ts:192`; `get-policy.ts:43` | No time zone; UTC "today" vs Asia/Colombo; server-local month | grep | Overdue/due dates off by one between 00:00–05:30 local; month boundary errors; shifts if the server TZ changes | P2 | No time policy | `timestamptz` for instants; compute school dates in `Asia/Colombo` explicitly |
| F-21 | DATA INTEGRITY | `db/schema/primitives.ts` `isoDateSchema`; leave | Format-only date validation | Executed | Invalid dates stored; quota math wrong | P2 (part of F-07) | Duplicate validators | Single calendar-validating schema used everywhere |
| F-22 | SECURITY, BUSINESS LOGIC | year-scoped write procedures | Closed/soft-deleted years writable via API | Code path | Historical records editable | P2 | Rule only in route guard | Shared `assertYearWritable(academicYearId)` in every year-scoped mutation |
| F-23 | BUG, AUTHORIZATION | `borrower-picker.tsx:617`; `marking/list-students.ts:70` | Student picker requires `student:read`, which `inventoryAdmin` lacks | Code path | Inventory Admin cannot lend to students | P2 | Cross-module dependency on a marking permission | A dedicated, minimal borrower-search procedure on the inventory tier, paginated |
| F-24 | PERFORMANCE | ~40 list procedures (§13) | Unbounded results; capped lists without paging | grep | Slow pages and large payloads as years accumulate | P2 | Pagination only where retro-fitted | Apply the accounts-list pattern (server paging + URL state) to the large lists |
| F-25 | SECURITY, PERFORMANCE | `export-qr-sheet.ts:205-250` | Unbounded `items`; client-supplied `origin` embedded in labels | Code path | CPU exhaustion; QR labels pointing elsewhere | P2 | Missing bounds | Cap items/total copies; origin from server config |
| F-26 | SECURITY, PERFORMANCE | `lib/excel-import.ts:77-78` | Decompressed size unbounded before the row cap | Code path | Memory exhaustion by an academic-tier user | P2 | Trusting compressed size | Check zip entry sizes first |
| F-27 | SCALABILITY | `otp-throttle.ts`, better-auth memory rate limit, `custody-request-events.ts` | Process-local state | Code | Cannot scale horizontally safely | P2 | Single-instance assumption | DB/Redis-backed limiter and pub/sub when scaling; document single-instance until then |
| F-28 | DEVOPS | `apps/web/Dockerfile`, `docker-compose.yml` | No migrations on deploy; non-existent `apps/server` secret; uploads ephemeral; DB default password and published port; no backups | Files | Unreproducible, insecure deploy | P2 | Template residue | Migration step; volume for uploads; mandatory DB password; bind DB to localhost; backup job |
| F-29 | DEVOPS, TESTING | `.github/workflows/ci.yml` | Lint only; failing; bot pushes to every branch | File; lint run | Broken code merges; surprise commits on `master` | P2 | Minimal CI | Add tsc, build, migrate-from-zero, tests; auto-fix only on PR branches |
| F-30 | DOCUMENTATION | AGENTS.md, TECHNICAL_REPORT.md, code comments | Multiple false statements (§64) | This report | Maintainers act on false premises | P2 | Docs not checked against code | Correct the listed statements; treat comments that assert guarantees as code |
| F-31 | DATABASE | `leaves.ts`, `attendance.ts`, `periods.ts`, `staff.ts` | No CHECKs on status/day/period/date order; redundant indexes; three-way leave status | Schema | Invalid states are representable | P2 | Validation only in valibot | Add CHECK constraints via migration (after data validation) |
| F-32 | DATA INTEGRITY | FK `ON DELETE CASCADE` from `staff`/`academic_year` into history tables | Hard deletes destroy history; protection is app-level and racy | Schema + `delete-staff.ts` | Silent loss of leave/attendance history | P2 | Cascade chosen for convenience | `RESTRICT` on history FKs; soft-delete staff (employment status) |
| F-33 | DEVOPS | `package.json`, `bun.lock` | Bun 1.4.0 required, 1.3.13 installed locally | Versions | Non-reproducible installs | P3 | No enforcement | `bun upgrade`; CI already pins 1.4.0 |
| F-34 | SECURITY, OBSERVABILITY | `apps/web/src/routes/api/rpc/$.ts` | Raw errors (with SQL params / PII) logged; no request ids | Code | PII in logs; weak diagnosability | P2 | No logging design | Structured logger with redaction and correlation ids |
| F-35 | PERFORMANCE | `leadership-review.ts:59-140`; `delete-staff.ts`; `delete-academic-year.ts` | N+1 per leave day; 15–19 parallel probes vs pool of 10 | Code | Long locks; pool starvation | P2 | Row-at-a-time code | Set-based upsert for date range; single `EXISTS` union query for probes |
| F-36 | BUG | `apps/web/src/components/admin/admin-users-content.tsx` | Duplicate React key fix uncommitted | `git diff` | Warning in console | P3 | — | Commit |
| F-37 | CODE QUALITY | 4 files (§29) | `react(purity)` lint errors | Lint run | CI red | P3 | `new Date()` in render | Compute in effect/memo with explicit clock or pass from loader |
| F-38 | GIT | remote `master` ahead; stale branch | `28327c2` unpulled; `all-changes-2026-09-21` merged | Git | Auditing a stale tree | P3 | — | Pull; delete merged branch |
| F-39 | CODE QUALITY | 10 files > 1,000 lines | God components/hooks | wc | Maintainability | P3 | Feature growth without extraction | Extract per-tab/per-dialog modules when next touched |
| F-40 | CODE QUALITY | `employment_verification`, `password_rotation_history`, `createPeriodConfig`, unused deps, purge task pool | Dead code/tables; new pg pool per task run | grep | Noise; small leak | P3 | — | Remove or implement; reuse the shared `db` in the task |
| F-41 | DOCUMENTATION | `rpc/$.ts` | OpenAPI reference uses the zod converter for valibot schemas | Code | Reference likely schema-less, and public | P3 | Template residue | Use `@orpc/valibot` converter or disable the reference in production |

---

## 36. Root Cause Analysis

Four systemic causes explain almost every finding.

1. **No executable verification loop.** There are no tests, CI does not build a database, and no seed runs anywhere. → F-02, F-06, F-07, F-11, F-14, F-15, F-16 went unnoticed.

   ```text
   Conflict returns 500 → message matching → drizzle changed error shape on upgrade
   → nothing exercised a duplicate insert after the upgrade → no tests
   ```

2. **Guarantees written in prose instead of enforced in code or schema.** Comments and AGENTS.md assert password re-sync, `adminAc` "nothing else", backfills, "quota enforced" and "one current year". The database holds few of the invariants the documentation describes. → F-01, F-04, F-07, F-09, F-14, F-30, F-31.

3. **Uneven engineering standards between modules.** Inventory has transactions, locks, CHECKs and audit tables; staff, academic and leave code was written row-at-a-time without them. The patterns exist in-repo but were not generalised into shared helpers. → F-06, F-08, F-09, F-17, F-35.

4. **Backend built ahead of workflows.** Procedures exist without a UI or an end-to-end path, so their permissions and edge cases were never exercised. → F-13, F-23, plus untested attack surface in marking.

---

## 37. Critical Findings

1. **F-01:** privilege escalation via better-auth admin endpoints (P0).
2. **F-02:** migrations cannot build a database (P0, VERIFIED).
3. **F-03:** committed credential in use (P0 for this environment, VERIFIED).
4. **F-05:** stored XSS through uploads (P1).
5. **F-07 / F-09 / F-10:** leave quota, current year and leadership roles are violable (P1).

---

## 38. Production Blockers

Must be resolved before any real deployment:

- F-01, F-02, F-03, F-04, F-05
- F-06 (user-facing 500s on routine duplicates)
- F-07, F-08, F-09, F-10
- F-12 (mail)
- F-13 (custody decide, positions)
- F-14 (upgrade path)
- F-15 (seeded logins deletable)
- F-16 (minimum test net for the fixes)
- F-28 (migrations in deploy, persistent uploads, DB password, backups)

---

## 39. Recommended Remediation Plan

### Phase 0 — Emergency (days)

1. **Rotate** the Academic Administrator password (and any seeded password that was ever shared); blank `.env.example` secrets (F-03). Determine whether the repository is public.
2. **Close F-01:**
   - narrow `principal`/`vicePrincipal`/`academicAdmin` user statements to `list, get, ban`, sessions `list, revoke`;
   - add `databaseHooks.user.create.before` (refuse roles other than `teacher`/`user`/`teacher-requester` unless the caller is `admin`) and a guard for `delete`;
   - set `adminRoles` to all privileged roles;
   - add an `account.update` guard or wrap `set-user-password`.
3. **Fix F-02:** correct `0006_snapshot.json`; rewrite `0007` with `DROP CONSTRAINT IF EXISTS` for both `_user_id_fk` and `_staff_id_fk` names before `ADD`, plus explicit backfills (F-14); verify on an empty DB and on a copy of an existing DB.
4. **Fix F-05:** server-derived extension + magic bytes + `nosniff`; move storage out of `public/`.

### Phase 1 — Production blockers (1–2 weeks)

5. Shared `isUniqueViolation`/`constraintName` helper; replace 11 sites (F-06).
6. Transactions for `createAcademicYear`, `setCurrentYear`, `createStaff`, `signupStaff`, `assignPosition`/`removePosition`, `approveTeacherRequest`, `assignClassTeacher` (F-08, F-09, F-17).
7. Partial unique index on `academic_year(is_current) WHERE is_current` (F-09).
8. Leave: count pending/recommended; re-check in `finalizeLeave` under `FOR UPDATE`; status-guarded conditional updates; calendar date validation (F-07, F-21).
9. Role reconciliation over all position-derived users (F-10).
10. Fix delete semantics and protect seeded rows (F-15).
11. Mail transport (F-12).
12. UI for custody `decide` and positions, or remove the request feature (F-13).
13. Seed rewrite on top of shared domain functions (F-11).
14. Deployment: migrate step, upload volume, DB password, backups (F-28).

### Phase 2 — Reliability (2–4 weeks)

15. Integration test harness against a disposable Postgres (§41); CI: tsc + build + migrate-from-zero + drift check + tests (F-16, F-29).
16. Year writability guard in all year-scoped mutations (F-22).
17. Structured logging with redaction and request ids; audit log for account administration (F-34, §28).
18. Time-zone policy: `timestamptz`, `Asia/Colombo` date helpers (F-20).
19. Restrict history FKs to `RESTRICT`; soft-delete staff (F-32).

### Phase 3 — Performance

20. Set-based leave-to-attendance write; consolidated dependency probes (F-35).
21. Pagination for large lists; dedicated borrower search (F-23, F-24).
22. Bounds on QR export and Excel import (F-25, F-26).

### Phase 4 — Architecture

23. Shared role-list module used by API, auth and web (remove the 6 copies).
24. Service-layer extraction for the staff/academic domain using inventory's patterns.
25. DB CHECK constraints for enums and ranges (F-31).
26. Decide the fate of the marking module (build the UI or remove it).

### Phase 5 — Enhancement

27. Split god components (F-39); remove unused deps and tables (F-40); OpenAPI converter (F-41); documentation correction (F-30).

### Fix strategy for P0/P1 items

**F-01 — Account-administration privilege escalation**
- **Root cause:** `...adminAc.statements` grants every user-management verb; the protective hook covers `user.update` only.
- **Affected files:** `packages/auth/src/permissions.ts`, `packages/auth/src/index.ts`.
- **Affected tables:** `user`, `account`, `session`.
- **Affected APIs:** `/api/auth/admin/{create-user, set-user-password, remove-user, impersonate-user, set-role, update-user, ban-user}`.
- **Affected users:** principal, vicePrincipal, academicAdmin (attackers); everyone (victims).
- **Risk of fix:** the users page may lose a button that relied on a removed verb. Check `authClient.admin.*` usage in `use-admin-users.ts`.
- **Solution:** least-privilege statements; create/delete hooks; `adminRoles` covering all privileged roles; audit rows for admin-plugin calls.
- **Migration:** none.
- **Testing:** for each of the 5 seeded roles × each admin endpoint, assert allow/deny.
- **Rollback:** revert the permissions file. No data change is involved.

**F-02 / F-14 — Migrations**
- **Root cause:** corrupted `0006` snapshot; no backfill.
- **Affected files:** `0007_quiet_mother_askani.sql`, `meta/0006_snapshot.json`, `meta/0007_snapshot.json`.
- **Affected tables:** 11 inventory tables, `staff`.
- **Risk of fix:** editing an applied migration. Because drizzle's migrator tracks by `created_at` (LIKELY), DBs that already recorded 0007 will not re-run it, and fresh DBs will run the fixed version. Confirm this before relying on it, or add `0008` instead and make `0007` a no-op guarded with `IF EXISTS`.
- **Testing:** empty DB → migrate → `drizzle-kit generate` reports no changes; copy of the dev DB → migrate succeeds; pre-flight query lists rows violating the new NOT NULL/CHECK.
- **Rollback:** restore from the pre-migration snapshot or backup. This is mandatory before running on any real DB.

**F-03 / F-04 — Credentials**
- **Solution:** rotate; blank example values; boot check; decide and implement the sync policy.
- **Migration:** none.
- **Rollback:** not applicable.

**F-05 — Uploads**
- **Solution:** allow-list map `{image/png: .png, …}`; validate the file signature; store under a non-public directory; `GET /api/files/:id` serving `Content-Type` from DB with `nosniff` and `Content-Disposition: inline`.
- **Migration:** rewrite `files.key` values from `/uploads/inventory/x` to `/api/files/<id>` (data-only).
- **Testing:** HTML/SVG polyglot rejected; valid images served; non-inventory roles refused.
- **Rollback:** keep the old path readable until data is migrated.

**F-06 — Constraint mapping**
- **Solution:** one helper returning `{code, constraint}` from `error` or `error.cause`.
- **Testing:** one test per mapped constraint expecting `CONFLICT`.
- **Rollback:** trivial.

**F-07 / F-21 — Leave**
- **Migration (optional):** CHECK `start_date <= end_date` and status enums, after validating existing rows.
- **Testing:**
  - two pending requests exceeding quota → second refused;
  - approval exceeding quota → refused;
  - cancelled → finalize refused;
  - `2026-02-30` → 400;
  - double-submit → one row.
- **Rollback:** code revert. If CHECKs were added, drop them.

**F-08 / F-09 — Academic years**
- **Migration:** partial unique index. Pre-flight: `SELECT count(*) FROM academic_year WHERE is_current` must be ≤ 1; repair first if not.
- **Testing:**
  - concurrent `setCurrentYear` → exactly one current;
  - failure injection in `createAcademicYear` → no year row;
  - deleted year → cannot be made current.
- **Rollback:** drop the index.

**F-10 — Role reconciliation**
- **Testing:** principal in year A without a position in year B → after switching to B, role is `teacher` or `user`; seeded and admin accounts are untouched.
- **Rollback:** code revert; roles can be re-derived by running the reconciliation for the current year.

**F-11 — Seed**
- **Solution:** reuse the year-creation function; managers/custodians set; production refusal.
- **Testing:** CI runs seed twice on an empty DB.

**F-12 — Mail**
- **Solution:** provider integration behind `sendAuthEmail`.
- **Testing:** contract test with a fake transport; production smoke test.

**F-13 — Unreachable workflows**
- **Solution:** decide per feature (build or remove).
- **Testing:** E2E for custody request → decide.

**F-15 — Deletes**
- **Solution:**
  - delete auto-created entitlements/policy/curriculum with the year inside one transaction when nothing else exists;
  - ignore the auto-created `teacher` position;
  - refuse deleting `seed-staff-*`.
- **Testing:** create → delete succeeds; seeded → refused.

**F-16 — Tests:** see §41.

---

## 40. Target Architecture

Change only where the evidence requires it.

| Concern | Current | Target |
|---|---|---|
| Frontend | TanStack Start, role workspaces | Keep. Add route error boundaries; split god components when touched |
| API | oRPC procedures with inline logic | Keep oRPC. Introduce a thin domain/service layer for staff/academic/leave mirroring `inventory-database.ts` (transactions, locks, shared error mapping) |
| Business logic | Split between handlers and comments | Invariants in the DB (CHECK, partial unique, RESTRICT) plus conditional updates |
| Database | Text dates, timestamp without tz, few CHECKs | `timestamptz` for instants, validated `date` (or CHECKed text) for calendar dates, CHECK enums |
| Authentication | better-auth | Keep; add mail transport; force first-login password change for issued accounts |
| Authorization | Role lists + `adminAc` | Single role-capability module; least-privilege admin-plugin statements; hooks on create/delete/password |
| Caching | TanStack Query only | Sufficient |
| Background jobs | Nitro scheduled task | Sufficient; move export/QR generation off the request path only if measured as a problem |
| Storage | `public/` directory | Non-public volume or object storage behind an authenticated handler |
| Logging / monitoring | `console` | Structured logs, request ids, account-admin audit log, health endpoint touching the DB |
| Testing | none | Integration tests against real Postgres + a small E2E set (§41) |
| Deployment | Docker without migrations | Migrate-then-start; DB backups; secrets from a secret store |

---

## 41. Verification & Testing Plan

**Harness:** Bun test runner (or Vitest) with a disposable PostgreSQL per run (`CREATE DATABASE test_<uuid>` → migrate → test → drop), exactly as this audit's `verify.mjs` did. Call procedures through `createRouterClient(appRouter, { context })` with synthetic sessions per role, so authorization is exercised without HTTP.

**CI pipeline (in order):**
1. `bun install --frozen-lockfile`
2. `ultracite check`
3. `tsc` (api, web)
4. migrate from zero
5. `drizzle-kit generate` must report "No schema changes"
6. seed twice
7. integration tests
8. `vite build`

**Minimum test inventory (one per finding):**

| Area | Tests |
|---|---|
| Authorization | role × procedure-tier matrix; role × better-auth admin endpoint matrix (F-01); seeded seat protection (F-15) |
| Migrations | empty-DB build; drift check; upgrade from a fixture DB containing NULL NIC / missing manager (F-02, F-14) |
| Academic year | atomic create; single current under parallel switch; deleted year cannot be current; delete of an empty year succeeds (F-08, F-09, F-15) |
| Leave | quota with pending; approve-time re-check; cancelled not approvable; invalid date; double submit (F-07, F-17, F-21) |
| Staff | duplicate NIC → 409; duplicate service number → 409; purge then re-register (F-06, F-18) |
| Positions | year switch demotes former leadership (F-10) |
| Uploads | polyglot rejection; served headers (F-05) |
| Inventory | concurrent issue of one unit → one success, one 409 (F-06); counter = ledger reconciliation property test |
| Time | leave and borrow dates at 23:30 and 04:30 Asia/Colombo (F-20) |
| E2E (Playwright) | login per role; apply → recommend → approve leave; custody request → decide; create year → switch |

---

## 42. Final Engineering Assessment

### A. What is the system's current technical condition?

It is a well-structured, heavily documented monolith with one strong module (inventory) and a weaker remainder. It type-checks and renders, but it **cannot be deployed from its own migrations** (F-02, VERIFIED), it **grants account-administration powers that allow privilege escalation** (F-01), and **several documented business rules are not enforced** (F-07, F-09, F-10). There are no tests to show otherwise. Condition: **development-grade, not production-ready, recoverable without a rewrite.**

### B. What are the most dangerous issues?

1. **F-01 (P0):** escalation to top admin via `/api/auth/admin/create-user` and `/set-user-password`.
2. **F-02 (P0, VERIFIED):** `0007` fails on any fresh database.
3. **F-03 (P0 here, VERIFIED):** live seeded password equals the committed example.
4. **F-05 (P1):** stored XSS through uploads.
5. **F-07 / F-09 / F-10 (P1):** leave quota bypass, two current years, stale leadership roles.

### C. What can cause data corruption?

- Non-atomic `createAcademicYear` (partial year), `setCurrentYear` (0 or 2 current years), `createStaff`/`signupStaff` (orphans).
- Leave approvals beyond entitlement; approval of cancelled requests; invalid dates stored as text.
- Race windows in leave recommend/finalize/cancel (lost updates).
- Cascading hard deletes from `staff`/`academic_year` into history after a racy app-level check.
- `0006`'s `DROP TABLE class_period_assignment CASCADE` with no data carry-over.
- Applying `0007` to an existing DB without backfill.

### D. What can cause a production outage?

- Inability to build the schema from migrations (F-02).
- A boot-time bootstrap failure (top-level await) after a seeded user is deleted (F-15).
- Two current academic years leading to wrong-year writes.
- Pool starvation from parallel probes and N+1 under load (F-35).
- Memory or CPU exhaustion from unbounded QR export or Excel import (F-25, F-26).
- Production email throwing on every OTP flow (F-12).

### E. What can cause security compromise?

- F-01 (admin-plugin verbs).
- F-03 (committed credential).
- F-04 (password rotation ineffective).
- F-05 (stored XSS).
- F-10 (stale leadership roles keep F-01 powers).
- F-19 (unthrottled public sign-up, enumeration, NIC squatting).
- F-22 (closed years writable).
- F-28 (DB exposed with default password).
- F-34 (PII in logs).

### F. Which algorithms are potentially inefficient?

- Leave → attendance expansion: O(d) sequential statements in one transaction (≈400 for a full maternity leave).
- Delete probes: 15–19 concurrent queries per call against a pool of 10.
- Whole-roll student fetch with O(N) client filtering.
- Unbounded QR rendering: O(Σ copies) with no cap on items.

All others reviewed are O(n) or better.

### G. Which data structures are inappropriate?

None is inappropriate at school scale. The concerns are **process-local** structures (OTP `Map`, in-memory rate limiter, `EventPublisher`) that are correct for one process and wrong for more than one (F-27), plus an OTP map that is never actively evicted.

### H. What database design problems exist?

- `academic_year` lacks a single-current invariant.
- `leave_request` has three overlapping status columns with no CHECKs and no date-order CHECK.
- Text calendar dates without validity checks.
- 92 timestamps without time zone.
- Integer day/period columns without range CHECKs.
- Cascade deletes into historical tables (`leave_request`, `teacher_attendance`, `class_period_teacher` from `staff`; everything from `academic_year`).
- `staff.user_id SET NULL` leaving NIC-holding orphans.
- Redundant indexes on unique columns.
- Two unused tables.

### I. Which migrations are unsafe?

- **`0007`:** fails on a fresh DB (VERIFIED); `SET NOT NULL` and a CHECK without backfill on existing DBs; ON DELETE behaviour differs between push-built and migration-built databases.
- **`0006`:** drops the old timetable table with `CASCADE` and no data migration; its snapshot is wrong.

### J. Which business workflows are incomplete?

- Custody request → decision (no UI).
- Leadership position assignment (no UI).
- Leave-quota editing (no UI).
- Qualifications (no creator; teachers lack the grant).
- Item void/unvoid (no UI).
- Marking: students, exams, marks, subject selection (no UI).
- Student loans by the Inventory Admin (permission gap).
- Email-dependent flows in production.
- Delete academic year / delete staff (always refused).

### K. What is currently unverified?

Everything in §34. In particular: runtime behaviour of all mutations, the F-01 exploit end to end, exports/uploads/QR in a production build, cookie attributes, query plans, accessibility, dependency CVEs, the contents of remote `master` `28327c2`, repository visibility, and hosting/backup arrangements.

### L. What must be fixed before production?

The §38 list: F-01–F-10, F-12–F-16 and F-28.

### M. What can safely wait?

These can wait until after launch because none of them causes data loss, a breach or a hard failure at a single school's scale:

- performance items (F-24, F-35) — current data volumes are small;
- horizontal-scaling constraints (F-27) — one instance is sufficient for a school;
- god-component refactors (F-39), unused dependencies and tables (F-40), the OpenAPI converter (F-41);
- the timestamp-with-time-zone migration (F-20) — only if the server TZ is pinned and the UTC-date bug is fixed in code.

### N. What should the engineering team do next?

1. `git pull` to the current remote `master` and re-check F-01, F-02 and F-06 against it.
2. Rotate credentials and blank `.env.example` (F-03).
3. Patch the auth permissions and hooks (F-01). Write the role × endpoint test first.
4. Repair `0006_snapshot.json` / `0007` and add the migrate-from-zero + drift CI job (F-02, F-14).
5. Harden uploads (F-05).
6. Land the shared unique-violation helper (F-06).
7. Make academic-year, staff and leave writes transactional and status-guarded; add the single-current index (F-07–F-10, F-17).
8. Fix the seed and run it in CI (F-11).
9. Decide build-or-remove for each API-only workflow (F-13); fix the delete semantics (F-15).
10. Integrate mail or formally disable email flows in production (F-12).
11. Prepare deployment: migrations, upload storage, DB credentials, backups (F-28).
12. Correct AGENTS.md and TECHNICAL_REPORT.md (F-30), then continue with Phases 2–5.

---

### Appendix A — Documentation claims checked (§64 cross-module consistency)

| Claim | Source | Verdict |
|---|---|---|
| Seeded passwords are re-synced on boot | AGENTS.md, `services.server.ts`, `roles.ts` | **CONTRADICTED** (`admin.ts:416`) |
| `0007` backfills pre-NOT-NULL rows | AGENTS.md | **CONTRADICTED** |
| `class_period_assignment` is the core timetable table; migrations `0002_eager_kinsey_walden`, `0004_silly_punisher` | AGENTS.md | **CONTRADICTED** (dropped in `0006`; files do not exist) |
| `subject-assignment` has a `UI.md` | AGENTS.md (UI Component Pattern) | **CONTRADICTED** (the same document's folder list says the folder does not exist) |
| Leave quota is enforced at `applyLeave` | AGENTS.md | **Partially true**: only against approved days; not at approval |
| Only `admin/$year/staff/historical-data` passes `allowAnyYear` | AGENTS.md | **CONTRADICTED**: `academic-admin/$year/staff/historical-data.tsx` also does (consistent with the route list elsewhere in the same file) |
| `adminAc` "buys account administration and nothing else" | `permissions.ts:187` | **CONTRADICTED** (F-01) |
| Teacher role holds `inventory: read, take, manageOwn` | `borrower-picker.tsx:560` | **CONTRADICTED** |
| `develop` not integrated; 51 conflicting files | TECHNICAL_REPORT §1, §3, §6 #6 | **CONTRADICTED** (merged in `e62ed14`) |
| `packages/db` has no `DATABASE_URL` source | TECHNICAL_REPORT §4.2, §6 #4 | **CONTRADICTED** (`packages/db/.env.schema` imports it) |
| Migration fails on `inventory_audit_log_actor_staff_id_user_id_fk` | TECHNICAL_REPORT §4.2 #3, §6 #1 | **VERIFIED**, and the defect is wider: all 25 drops and 25 re-adds fail |
| Seed fails on `inventory_item` NOT NULL | TECHNICAL_REPORT §4.2 #4 | **VERIFIED** (`manager_staff_id`) |
| Bun lockfile needs a newer Bun | TECHNICAL_REPORT §4.2 #6 | **VERIFIED** (1.3.13 vs 1.4.0) |
| `ACADEMIC_ADMIN_PASSWORD` is a placeholder | TECHNICAL_REPORT §4.1 | **VERIFIED**, and it is the committed value (F-03) |
| Page loads clean in all five workspaces | TECHNICAL_REPORT §5.2 | Not re-run; shows rendering only (§25) |

### Appendix B — Audit artefacts (outside the repository)

- `C:\tmp\audit-migrate\verify.mjs`: migration replay and drizzle error probe (creates and drops `audit_scratch_<timestamp>`).
- `C:\tmp\audit-migrate\dates.ts`: leave-day calculation probe.
- `C:\tmp\audit-drift\`: temporary migration copy used for the drift check.
- `C:\tmp\audit-migrate\tsc-*.txt`, `lint.txt`: type-check and lint output.
