# Technical Report: Typography Refresh, Branch Integration and Local Environment Recovery

**Project:** St. Aloysius' College — School Management System **Repository:** `Tenuka22/school-student-teacher-management` **Period covered:** 26 September – 1 October 2026

---

## 1. Summary

| Workstream | Outcome | Where it lives |
| --- | --- | --- |
| Typography and visual refinement of the web app | Done and pushed | Branch `develop`, commit `ce74e4a` |
| Integration with `master` | **Not done.** 51 files conflict with four newer `master` commits | Pending pull request `develop` → `master` |
| Local environment (`.env`, packages, database) | Running on `master` at `http://localhost:3001` | Local machine only |
| Runtime errors found after start-up | Two fixed, one transient | Data fix in local database; one uncommitted code fix on `master` |
| Defects found in the shared codebase | Three, not fixed (outside the scope of a local run) | See §6 |

---

## 2. Typography and visual refinement

### 2.1 Problems found

Initial audit of `apps/web` and `packages/ui`:

| Problem | Evidence |
| --- | --- |
| Too much 12px text | 167 uses of `text-xs` in the app, 44 in the UI primitives, including card bodies, tabs, table secondary lines, hints and error messages |
| Heavy, wide, all-caps text | 65 uses of `font-extrabold`/`font-black`; letter-spacing up to `0.46em`; labels, buttons and button states typed in capitals in the source (`"SAVING…"`, `"UPDATE PASSWORD"`) |
| Display serif used at body sizes | `CardTitle` was Cormorant at 14px / 500; dialog, sheet, empty-state and section titles and dashboard figures also used Cormorant |
| Old-style numerals | Cormorant's default figures made years and counts ("2024", "01") bob up and down |
| Wrong font in toasts | Sonner's injected stylesheet forced a system font at 13px |
| Text sized by viewport height | Landing and auth pages used `clamp(…vh…)`, shrinking text on short screens; the landing page also clipped content (`lg:h-dvh overflow-hidden`) |
| Merge helper dropped classes | `cn()` (tailwind-merge) treated custom `text-page-title` / `text-eyebrow` as colours and could drop a real colour class |
| No Sinhala/Tamil fallback | Neither brand face has those glyphs, and the font stacks had no fallback for them |
| Wrong 404 page title | Unknown URLs used the site's default title |

### 2.2 Type system implemented (`packages/ui/src/styles/globals.css`)

**Font families**

- **Manrope** for everything functional: navigation, forms, tables, buttons, badges, dialogs, metrics, and every heading below page-title size.
- **Cormorant Garamond** only at display sizes (about 28px and up): page titles, the landing/404/auth headlines, and academic-year numerals. `.font-heading` turns on lining figures.
- Both stacks fall back to system fonts with Sinhala and Tamil glyphs (Noto Sans/Serif Sinhala, Noto Sans Tamil, Nirmala UI, Iskoola Pota, Sinhala Sangam MN) before the generic family.

**Role utilities.** Each `type-*` class is a Tailwind `@utility` that sets family, size, line height, weight and tracking together. tailwind-merge ignores them, which removes the `cn()` problem.

| Role | Class | Specification |
| --- | --- | --- |
| Display | `type-display` | Cormorant 600, `clamp(2.5rem, 1.75rem + 3vw, 4.5rem)` (40–72px), 1.02 |
| Page title | `type-page-title` | Cormorant 600, 30–40px fluid, 1.1 |
| Section title | `type-section-title` | Manrope 700, 19–22px fluid, 1.3, −0.018em |
| Card title | `type-card-title` | Manrope 600, 17px, 1.35, −0.012em |
| Big figure | `type-stat` | Manrope 700, 26–32px, lining + tabular figures |
| Eyebrow / small label | `type-eyebrow` | Manrope 700, 12px, uppercase, 0.14em |
| Running text | `type-body` | 15px, 1.6 |
| Secondary grid data | `type-caption` | 13px, 1.45, tabular figures |

**Scale tokens:** `--text-xs` 12px/1.4 (metadata only), `--text-caption` 13px, `--text-sm` 14px/1.5, `--text-body` 15px/1.6, `--text-base` 16px/1.55, `--text-lg` 18px/1.4, `--text-xl` 20px/1.35.

**Weights:** 400 body, 500 secondary emphasis, 600 labels, buttons and card titles, 700 section titles, figures and eyebrows. 800 is no longer used.

**Other global rules:** `antialiased`; `text-size-adjust: 100%`; `text-wrap: balance` on h1–h3 and `pretty` on paragraphs; an unlayered override so Sonner toasts use Manrope at 14px with 600-weight titles.

### 2.3 Shared components changed

| Component | Change |
| --- | --- |
| Button | 600 weight; `sm` size 13px → 14px; default horizontal padding 12 → 14px |
| Card | Body 12 → 14px; title uses `type-card-title` (Manrope 17px) instead of Cormorant 14px; description 14px |
| Tabs | 12 → 14px labels; list height 32 → 40px; active ring scoped to the default variant |
| Badge | 22px tall, 600 weight, slight tracking |
| Table | Tabular figures; header cells 12px / 600 / uppercase / 0.06em, muted; cell padding 8 → 10px vertical |
| Dialog, AlertDialog, Sheet titles | Manrope 600, 18px (was Cormorant) |
| Empty title | Manrope 600, 16px |
| Label | 600 weight |
| Input, Textarea, Select | 16px on phones, 15px from `sm` (was 14px) |
| Field legend, Popover, Breadcrumb, Combobox empty text, InputGroup add-ons | 12 → 14px |
| Tooltip | 500 weight |
| Sidebar | Menu items 12 → 14px, row height 32 → 36px, group labels as uppercase eyebrows, badge/action offsets adjusted |
| `PageHeader`, `RequiredMark` | Role utilities; "(required)" 12 → 14px |

### 2.4 Pages migrated

Landing, 404, login, sign-up and sign-up success, email verification, pending approval, saved accounts, account and password dialog, admin / principal / deputy-principal dashboards, users and its ban/approve/purge dialogs, teacher requests, sidebar and header, academic-year switcher, teachers list, class cards and tabs, academic years, periods, class timetable and teacher timetable (desktop grid and mobile day view), attendance grid, leave cards, and the teacher portal.

Patterns applied:

- Hard-coded capitals rewritten in sentence case; CSS uppercases only eyebrows, table headers and short status chips.
- Essential information raised to at least 14px: decisions, review notes, OTP hints, import-conflict comparisons, leave balances.
- Monospace numbers replaced by Manrope tabular figures.
- Timetable row headers opt out of the new uppercase header default (`tracking-normal normal-case text-foreground`).
- Landing page grows with its content instead of clipping it; CTAs and the header subtitle wrap below `sm`; stats use a 2×2 grid on phones.
- 404 title set from the root route's `head()` using `match._notFound`.
- `DESIGN_SYSTEM.md` Type section rewritten to match.

Usage after the change: `text-xs` 167 → 40 (metadata only), `font-extrabold`/`font-black` 65 → 0, pixel-valued font sizes → 0.

### 2.5 Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Type check | Pass | `tsc --noEmit` in `packages/ui` and `apps/web`: 0 errors |
| Production build | Pass | `vite build` in `apps/web`; only third-party `"use client"` warnings |
| Lint / format | Pass | `ultracite check` on 43 changed app files (`packages/ui` is excluded by `oxfmt.config.ts`) |
| Browser, public pages | Pass | Chromium (Playwright 1.62): landing, login, sign-up, 404 at 320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920 and 2560px; no horizontal overflow, no app text under 12px |
| Live CSS | Pass | All `type-*` utilities, tokens and the Sonner override present in the served stylesheet |
| Lining figures, Sinhala/Tamil fallback | Pass | Rendered sample screenshot |
| Signed-in pages | **Not visually verified** | No test accounts were available during this work. Pages were later shown to load without errors (§5), but the typography on them has not been reviewed visually |
| Accessibility | Partial | Labels, titles and live fonts checked; no axe run, no keyboard, screen-reader or 200/400% zoom testing |
| Protected backend paths | Clean | `git diff` hash of `packages/api`, `packages/auth`, `packages/db`, `apps/web/src/routes/api` identical before and after |

---

## 3. Git and branch history

| Step | What happened |
| --- | --- |
| Commit | Whole working tree committed as `ce74e4a` ("feat(ui): premium typography system and UI/UX modernization"), with no AI co-author line, at the owner's request. It also contains earlier uncommitted work that could not be separated (new `ui-patterns`, `DESIGN_SYSTEM.md`, `page-title.ts`, three files in `packages/api/src/lib/`, and an incidental `bun.lock` rewrite) |
| Push to `master` | Rejected: `origin/master` had four newer commits (inventory, custody notices, QR scanning, and a UI data-honesty fix: `0fdc8f7`, `b9fefa4`, `afc72ee`, `6f6e38b`) across 344 files |
| Dry-run merge | 51 conflicting files, about 210 hunks: almost every restyled screen, plus `globals.css`, `bun.lock` and `packages/api/src/lib/export.ts` |
| Force push | Not done; it would have deleted the four inventory commits |
| Merge attempt | Started and then aborted at the owner's request; nothing from it was kept |
| `develop` branch | Created from `ce74e4a` and pushed (`origin/develop`) |
| Later | Local `master` was moved to the newer `origin/master` (`1f2c705 "Small changes"`) outside this work |

Notes from the partial merge, for whoever does the pull request:

- `master` restructured several screens: new page components for the leave routes, teacher-form sections extracted into components, new `timetableRead`/`periods` loading state, soft-delete academic years. Those structures should be kept, with typography re-applied on top.
- `master` self-hosts fonts (`@fontsource-variable/manrope`, `@fontsource/cormorant-garamond`) and adds tokens (`--gold`, `--warning-ink`, `--destructive-hover`; `--success` changed to `#0b5e1a`). `globals.css` needs a union of both sides; a resolution was drafted during the aborted merge.
- `export.ts` (pdfmake loading) was fixed differently on each side; take `master`'s.

---

## 4. Local environment set-up

### 4.1 Environment file

`apps/web/.env` (gitignored) was rewritten with the values supplied, adding `INVENTORY_ADMIN_*` and `ACADEMIC_ADMIN_*`. Every key in `.env.schema` is present except `NODE_ENV`, which has a schema default.

Notes:

- `ACADEMIC_ADMIN_PASSWORD` is still the placeholder `change-me-academic-admin`.
- The secrets were shared in a chat session. Rotate `BETTER_AUTH_SECRET` and the passwords for any shared or production environment.

### 4.2 Problems while starting the app, and fixes

| # | Symptom | Root cause | Action |
| --- | --- | --- | --- |
| 1 | `bun run dev:web` failed at `db:migrate` with no message | The committed migration history was regenerated (8 files, `0000`–`0007`), and the existing database held 11 records from the old history | — |
| 2 | Every page returned 500: `relation "inventory_category" does not exist` | Same as #1: the inventory tables were never created | Created a new database `school-student-teacher-management-v2` and pointed `DATABASE_URL` at it. The old database is untouched |
| 3 | Migrations also failed on the empty database | Defect: a later migration runs `ALTER TABLE "inventory_audit_log" DROP CONSTRAINT "inventory_audit_log_actor_staff_id_user_id_fk"`, a constraint no earlier migration creates | Built the schema with `drizzle-kit push --force` against the empty database (46 tables). Migration files unchanged |
| 4 | `bun run seed` failed | Defect: the seed script inserts `inventory_item` rows without a column the schema now requires (NOT NULL, `23502`) | Not fixed (see §6) |
| 5 | 500: `Cannot find module 'qrcode'` | New dependencies not installed | — |
| 6 | `bun install --frozen-lockfile` failed: unknown lockfile version 2 | `bun.lock` was written by a newer Bun; local Bun is 1.3.13 | Ran a plain `bun install`, then restored `bun.lock` with `git checkout`. Installed versions are resolved from `package.json` ranges and may differ slightly from the lockfile |

The `db` package has no `DATABASE_URL` source of its own (not in its `.env.schema`, no `.env`), so `drizzle-kit` commands were given the URL explicitly. The same gap may explain why `db:migrate` failed silently under `dev:web`.

### 4.3 How the app is currently started

```bash
cd apps/web && bun run dev        # http://localhost:3001
```

Don't use `bun run dev:web` until the migration defect (§6) is fixed: it stops at `db:migrate`.

---

## 5. Runtime errors after start-up

### 5.1 Method

Playwright signed in as each seeded role (`admin`, `principal`, `deputy-principal`, `inventory-admin`, `academic-admin`). It visited every sidebar link plus every route of that workspace (from the route tree), recording console errors, uncaught exceptions, HTTP ≥ 400 responses and `role="alert"` content.

### 5.2 Findings

| Error | Cause | Fix | Status |
| --- | --- | --- | --- |
| `PRECONDITION_FAILED: Attendance policy is not configured for this academic year` (attendance, leave review) | The partial seed run (§4.2 #4) created academic year 2026 directly, skipping what `createAcademicYear` does | One-off script, deleted afterwards, mirroring `createAcademicYear`. For 2026 it added the attendance policy (defaults), the 7 `DEFAULT_LEAVE_ENTITLEMENTS`, pinned curriculum `v1.1` (`LATEST_STRUCTURE_VERSION_KEY` at its latest subversion, the only version registered) and created the 326 `grade_subject_config` rows. A second run reported nothing missing | Fixed (data only) |
| React warning: two children with the same key `closed` (Users page, Account page) | `BanUserDialog` and `BulkBanDialog` are siblings that both fall back to `key="closed"` when closed | `apps/web/src/components/admin/admin-users-content.tsx`: keys prefixed `ban-` and `bulk-`. Behaviour unchanged | Fixed. **Uncommitted on `master`** |
| `Invalid hook call` / `Cannot read properties of null (reading 'useContext')` in `LeaveRequestsContent` | Logged once, during Vite's first dependency optimisation and reload right after start-up | None needed | Not reproduced since |

After the fixes, every visited page in all five workspaces loads without console errors, failed requests or error alerts.

### 5.3 Not covered

- Only page loads were tested; no forms, mutations, exports, QR scanning or file uploads.
- The academic year has no classes, periods or students, so pages that render those were only tested in their empty states.

---

## 6. Open issues

| # | Issue | Severity | Owner / suggested action |
| --- | --- | --- | --- |
| 1 | Migration history fails on a fresh database (drops `inventory_audit_log_actor_staff_id_user_id_fk`, which never exists) | High: blocks `db:migrate`, `dev:web` and any new environment | Database maintainer: fix the drop to target the real constraint name or use `IF EXISTS`; regenerate, and check it against an empty database |
| 2 | Existing databases from the old migration history can't move to the new one | High for anyone with an existing database | Provide a baseline step (mark `0000` as applied) or a documented reset |
| 3 | `scripts/seed.ts` fails on `inventory_item` (NOT NULL), and when it fails it leaves an academic year with no policy, entitlements or curriculum | Medium | Update the seed for the current schema; create years through the same logic as `createAcademicYear` |
| 4 | `packages/db` has no `DATABASE_URL` source for `drizzle-kit` | Medium | Add `DATABASE_URL` to `packages/db/.env.schema`, or load `apps/web/.env` in `drizzle.config.ts` |
| 5 | `bun.lock` needs a newer Bun than some developers have | Medium | Pin the Bun version (e.g. `packageManager` field / CI) and ask developers to `bun upgrade` |
| 6 | `develop` (typography) conflicts with `master` in 51 files | Medium | Pull request `develop` → `master`, keeping `master`'s structure and re-applying typography; then re-run type check, build, and the browser checks in §2.5 |
| 7 | Typography on signed-in pages not visually reviewed | Medium | Review after #6; focus on the timetables, Classes tabs on narrow screens, sidebar row height, and table headers used as row labels |
| 8 | Duplicate-key fix uncommitted on `master` | Low | Commit `admin-users-content.tsx` |
| 9 | `ACADEMIC_ADMIN_PASSWORD` is a placeholder; secrets were shared in chat | Low locally, high if reused | Set a real password; rotate secrets for any shared environment |
| 10 | Old local database `school-student-teacher-management` still exists | Low | Drop it once nothing from it is needed |

---

## 7. Files and artefacts

**In the repository**

- `develop` / `ce74e4a`: typography system, component and page changes, `DESIGN_SYSTEM.md`.
- `master` (uncommitted): `apps/web/src/components/admin/admin-users-content.tsx`.
- `TECHNICAL_REPORT.md`: this report (uncommitted).

**Outside the repository**

- `apps/web/.env` (gitignored): updated values; `DATABASE_URL` points to `…/school-student-teacher-management-v2`.
- PostgreSQL on `localhost:3000`: new database `school-student-teacher-management-v2` (schema from `drizzle-kit push`, admin accounts and inventory categories created by the app at start-up, 2026 year backfilled). The old database is unchanged.
- `node_modules`: reinstalled with plain `bun install`.
- `C:\tmp\typo-baseline\`: baseline and after screenshots, protected-path hashes, edit scripts.
- `C:\tmp\pwtest7\`: Playwright scripts (`typo-shots.mjs`, `css-check.mjs`, `login-check.mjs`, `crawl.mjs`).
