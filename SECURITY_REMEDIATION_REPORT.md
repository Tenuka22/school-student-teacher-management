# Security Remediation Report

**Project:** St. Aloysius' College — School Management System **Branch:** `repair/forensic-audit-2026-10` (uncommitted working tree) **Date:** 2 October 2026 **Baseline:** the post-repair security assessment (Z1, Z2, A1, H1, M11 high; Z3, D1, LOG1, BODY, A3/S6, D2, INFRA1, INFRA2 medium; I1, F1, A2, DEP1, CI1, P1 low).

This report does not claim the system is secure. It states which controls were verified, which vulnerabilities were remediated, and which risks remain.

---

## 1. Executive summary

All five high findings are fixed and covered by regression tests. Each test was also run against the original code and failed there, so the tests detect the defects they target. Nine of the thirteen medium and low findings are fixed. Two new vulnerabilities turned up in the second-pass review and were fixed: a user could rename their own login, and the academic desk could carry leadership positions into a new year. Two new operational defects were also found (§16).

|                    | Before   | After              |
| ------------------ | -------- | ------------------ |
| Automated tests    | 114 pass | 170 pass, 0 fail   |
| New security tests | —        | 56, across 7 files |

## 2. Findings remediated

| ID | Change | Regression evidence |
| --- | --- | --- |
| **Z1** | `updateStaff` refuses any caller but `admin` when the target is a seeded seat or holds a privileged login (`staffProtectionOf`, shared with `deleteStaff`). Nobody may change a seeded seat's NIC. The login is renamed only when the NIC actually changes; previously **any** save, including admin editing a phone number, renamed a seat's fixed username to its placeholder NIC and locked it out. | `security-remediation.test.ts` › Z1 (9 tests, including raw HTTP) |
| **Z1 (alt path, new)** | better-auth `/update-user` let any signed-in user, including seeded seats, rename their own username (= NIC). Fixed with `username({ immutableUsername: true })`. | › "renaming your own login" (2) |
| **Z2** | `assertMayManagePosition`: leadership positions (`principal`, `vicePrincipal`, `assistantPrincipal`) may be assigned or removed only by `admin` or `principal`. `academicAdmin` keeps teaching and sectional positions. | › Z2 (6), including the **full attack chain**: create → capture password → assign Deputy (refused, client and HTTP) → sign in → role is `teacher` → `listLeaveRequests`, `deleteStaff` refused, `isDeputy` false |
| **Z2 (alt path, new)** | `portTeachersFromPreviousYear` (academic desk) copied leadership positions into a new year. It now skips them for non-admin/principal callers and reports `skippedLeadership`; the dialog says so. | › "carrying positions into a new year" |
| **A1** | `revokeSessionsOnPasswordReset: true`. A `before` hook forces `revokeOtherSessions: true` on `/change-password`, overriding the client, including an explicit `false`. | › A1 (3): change kills the other session and issues a fresh one; reset kills all; old password fails, new works |
| **A2** | Server `minPasswordLength` = `ACCOUNT_PASSWORD_MIN_LENGTH` (12), the same as sign-up; it was better-auth's default of 8 on change and reset. Dialog text and `minLength` use the constant. | › A2 (11-character password → 400) |
| **H1** | Nitro middleware adds CSP, HSTS (production + `https` origin only), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy and COOP. Static assets get the environment-independent set through `routeRules`. | `security-headers.test.ts` (4); live production build (§7) |
| **M11** | 0011 adds `data` as NULLable, refuses with a count while any row lacks bytes or has a size mismatch, then sets NOT NULL and drops `key`. All-or-nothing. New `scripts/backfill-file-bytes.ts` copies from the old MinIO bucket and never deletes or overwrites. | `migration-0011.test.ts` (8) |
| **Z3** | `recommendLeave` refuses a Deputy's own request. | › Z3 |
| **D1** | `scripts/db-roles.ts` creates a DML-only app role; `migrate.mjs` uses `MIGRATION_DATABASE_URL`; runbook updated. | `least-privilege.test.ts` (4) |
| **LOG1** | `auditPrivilegedProcedures` middleware writes allowed, denied and failed calls of 11 privileged procedures to `account_audit_log`, with no input values. | › LOG1 (4) |
| **BODY** | Pre-read `Content-Length` limits: RPC 8 MB, auth 64 KB; missing length → 411. | `request-limits.test.ts` (4); live 413s |
| **A3** | `/is-username-available` (an unauthenticated NIC oracle) disabled. | › A3 (2) |
| **INFRA2** | The sign-up limiter took the leftmost (client-supplied) `X-Forwarded-For`. It now uses the socket address unless `TRUSTED_PROXY_HOPS=N`, in which case it uses the Nth entry from the right. | `client-address.test.ts` (4) |
| **I1** | Formula-like text (`= + - @`, tab, CR) exported with the Text number format. | `export-formula.test.ts` (2) |
| **CI1** | `MINIO_*` removed from `ci.yml`. | — |
| **Secret rotation** | Procedure and consequences documented; rotating `BETTER_AUTH_SECRET` signs everyone out (verified). | › "secret rotation" |

## 3. Findings not yet remediated

| ID | Status | Reason |
| --- | --- | --- |
| Z2 sub-item: `mustChangePassword` | **Deferred** | The escalation is closed without it. Enforcing it needs a schema column, a guard on every procedure tier and a forced-change screen in onboarding, which is a feature in its own right. The initial password is still returned to the creator. |
| D2 cascade deletes | **Deferred** | Application layer is fenced: `deleteStaff` probes 17 history tables under a row lock; years are soft-deleted; the purge only removes non-active staff rows of unverified logins. A DB-level `RESTRICT` would touch about 40 FKs and needs a product decision. |
| F1 file authorization | **Deferred** | Files are only item photos, read by every seat that opens the register and by teachers viewing their own equipment. IDs are random UUIDs. Revisit if `nationalIdentityCardFileId` uploads are ever built. |
| P1 applicant IP/UA | **Deferred** | Shown only to `academicProcedure` seats when vetting applicants. A data-minimisation decision for the owner. |
| INFRA1 Docker | **Partial / not tested** | `USER node` added. `.env` files are confirmed excluded from layers. No Docker on this machine, so the image was not built or run. |
| DEP1 | **Reviewed, no upgrade** | See §12. |

## 4. Z1 verification

The original code failed every Z1 test. The first test **succeeded** in changing the administrator's NIC, which locked the `admin` login out (`sign-in as admin failed: 401`), and that cascaded into later tests. Alternate paths searched: `updateProfile` (phone and portrait only), `createStaff` (new logins only), `approveTeacherRequest` (`teacher-requester` → `teacher` only), the better-auth admin plugin (already guarded), and `/update-user` (fixed above).

## 5. Z2 verification

The chain test fails at the assignment step and the resulting account is a plain teacher. The other position-and-role paths were checked: `reconcilePositionDerivedRoles` derives only from positions, `setCurrentYear` cannot introduce new positions, the port path is fixed, and approval grants only `teacher`.

**Business-rule change:** the Academic Administrator can no longer appoint or remove Deputies or Assistant Principals, which `AGENTS.md`, the procedure comment and the Deputy page previously allowed. That workspace's Deputy page is now a read-only roster. **Please confirm this is acceptable.**

## 6. A1 verification

Verified against better-auth 1.7.5's own source: `revokeSessionsOnPasswordReset` exists and is read by `/email-otp/reset-password`; `/change-password` honours `revokeOtherSessions`, and a `before` hook's `{ context: { body } }` replaces the body.

Side fix: the dialog's "Email code" mode called `changePassword` with an empty current password, which better-auth rejects, so as far as I can tell that mode never worked. It now calls `emailOtp.resetPassword` and sends the user to sign in.

## 7. H1 verification

On a production build (`NODE_ENV=production`, port 3091):

- **Header coverage:** headers present on `/`, `/login`, the 404 page, a 307 redirect, a 500, API 401/404/405, `/api/auth/get-session` and `/assets/*.js`.
- **HSTS:** sent only with an `https://` origin.
- **Browser crawl:** Playwright, signed in as admin, visited 8 workspace pages and the 404 page. **Zero CSP violations**, and all three web fonts loaded.
- **Why not `src/start.ts`:** a TanStack Start request middleware there would have silently replaced Start's default CSRF check on server functions, so the headers live in a Nitro middleware instead.
- **Residual:** `script-src` allows `'unsafe-inline'` because the router's inline hydration scripts have no nonce plumbing. The QR camera scan (needs a `blob:` worker) was not exercised.

## 8. M11 verification

| Case | Original 0011 | Fixed 0011 |
| --- | --- | --- |
| Empty table | pass | pass |
| One file, not copied | `column "data" … contains null values` | refused with a count; `key` and rows intact |
| One file / 40 files after backfill | `column "data" already exists` | pass; bytes and sizes verified |
| Missing object | — | reported; migration refused; nothing lost |
| Truncated object, or bad bytes written out of band | — | refused by both the backfill and the migration |
| Interrupted backfill, re-run, migration run twice | — | consistent; no corruption |
| Dry run | — | no change |

Editing an applied migration is safe here because drizzle selects pending migrations by journal timestamp, not by file hash. Not tested: a real MinIO server (the fetcher was injected) and a production-sized copy.

## 9. Database least privilege

The test creates a non-superuser owner, migrates as it (no migration needs superuser), applies the grants, and then runs the auth bootstrap, opening a year, creating, editing and promoting staff, and the audit insert, all as the app role. The closed-year trigger still raises `YR001`. `CREATE`, `DROP`, `TRUNCATE`, `DISABLE TRIGGER`, audit `UPDATE`/`DELETE` and the migration ledger are all refused with `42501`. `REASSIGN OWNED` on an existing populated database was not exercised.

## 10. Audit logging

- Rows go to `account_audit_log`: `action = rpc:<path>`, plus actor, role, outcome (`allowed`, `denied` or `failed`), and `detail` = target id, request id and error code.
- The middleware is outermost, so it records refusals by the role and permission guards too.
- A failed audit write is logged, not turned into a failure of work that has already committed.
- With D1 applied, the app role cannot alter or delete audit rows. A superuser still can; ship the table to external logging if that matters.

## 11. Request limits

RPC 8 MB (largest legitimate body: `parseExcel` at 6 MB of base64), auth 64 KB, photo upload 8 MB (already in place). Verified live: a 9 MB RPC body and a 70 KB auth body both got 413. The reverse proxy should enforce the same limits; see the runbook. **Not done:** the per-field `v.string()` maximum-length review (§29 of the brief).

## 12. Secondary hardening

DEP1 is reviewed with no upgrades: there are no advisories to justify any.

- **Patch releases behind:** better-auth 1.7.5 (latest 1.7.7), Vite 8.3.1 (latest 8.3.2), TanStack Start 1.168.59 (latest 1.168.60). Review the better-auth release notes first.
- **Pre-release dependencies:** Nitro 3.0.260903-beta and h3 2.0.1-rc.32 are pre-release, but they are the latest published versions, so there is no stable line to move to.
- **Up to date:** drizzle-orm, sharp, ExcelJS, pdfmake, Valibot and React.
- **Advisories not checked:** `bun audit` could not run because the lockfile needs Bun 1.4 (local is 1.3.13). Run it in CI.

## 13. Regression tests

New files: `security-remediation.test.ts` (31), `migration-0011.test.ts` (8), `least-privilege.test.ts` (4), `client-address.test.ts` (4), `export-formula.test.ts` (2), `apps/web/test/security-headers.test.ts` (4) and `request-limits.test.ts` (4). `signup.test.ts` now passes the client address through the context instead of a forged header.

## 14. Build / CI verification

| Check | Result |
| --- | --- |
| Tests | 170 pass, 0 fail |
| Type check (`api`, `auth`, `web`, all four test projects) | 0 errors |
| `ultracite check` (changed files) | clean |
| Production build | pass |
| `db:verify-migrations` | 12 migrations from zero |
| `db:check-drift` | no drift |

## 15. Docker verification

**Not tested:** Docker is not installed on this machine. Static review only: `.env*` is excluded by `.dockerignore`, and the runner now uses `USER node`. Before relying on it, build the image and start it once against a scratch database.

## 16. Remaining risks

- **New, operational:** leftover `MINIO_*` lines in `apps/web/.env` are undeclared since 203f827. varlock's leak scanner then aborts any response containing one of their values (`MINIO_USE_SSL=false`), and in a production build pages failed with resets and 500s. **Remove them from `apps/web/.env`.** The backfill reads them from a separate file. CI no longer sets them.
- **New, operational:** better-auth's own rate limiter trusts a single-entry `X-Forwarded-For`. The proxy must overwrite that header (runbook).
- CSP `'unsafe-inline'` for scripts; nonce plumbing would remove it.
- The initial password is still disclosed to the creator (no forced change).
- In-memory rate limiters are per instance (unchanged).
- A Principal who holds the position on a staff row can finalize their own leave; there is no authority above them in the model.

## 17. Production configuration requirements

1. `BETTER_AUTH_URL=https://…`, `NODE_ENV=production`, TLS at the proxy.
2. `DATABASE_URL` → the app role; `MIGRATION_DATABASE_URL` → the owner role.
3. `TRUSTED_PROXY_HOPS=1` behind one proxy that overwrites `X-Forwarded-For`; the app port must not be public.
4. Proxy body limit of about 9 MB.
5. Remove `MINIO_*` from `apps/web/.env`; run the 0011 backfill procedure if `files` has rows.
6. Rotate `BETTER_AUTH_SECRET`, seat passwords, database and mail credentials for any environment that used the shared values.
7. A mail transport (unchanged requirement).

## 18. Final security verification

**Verified controls:**

- Z1, Z2 (including the full chain), Z3, A1 and A2 server-side, over the client and over raw HTTP.
- Headers on a live production build.
- 0011 on populated databases.
- The application running without superuser.
- Audit rows for allowed and refused privileged calls.
- Body limits live.

**Preserved controls:** all 114 original tests still pass, including those for `adminEndpointGuard`, the seat protections, the leave quota locks, the closed-year trigger, upload re-encoding, the zip-bomb and QR bounds, the sign-up rate limit and the seat-password policy.

Residual risks are listed in §16. The changes are uncommitted on `repair/forensic-audit-2026-10`.
