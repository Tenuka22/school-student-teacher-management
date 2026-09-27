# UI/UX Modernization Plan

This plan is the companion to `UI_UX_AUDIT_REPORT.md`. Finding IDs (UX-0xx) refer to that report.

**Design direction:** "2050 Next-Generation Educational Administration" means precision, not decoration. We keep the College green, gold, cream and crimson palette, the square institutional corners, the Cormorant/Manrope pairing and the uppercase eyebrow labels. The improvement comes from legibility, consistent structure, honest data and robust interaction, not from gradients, glass or glow.

**Ground rules for every phase**
- Frontend only. `packages/api`, `packages/auth`, `packages/db`, `apps/web/src/routes/api`, env files and server functions are untouched. After each phase, `git diff --stat` on those paths must be empty.
- No changes to form field names, payloads, validation rules, query/mutation inputs, route paths or guards.
- Changes are small and reviewable, grouped by phase. After changing a shared primitive, re-inspect every page that uses it.
- Never stop or restart the port-3001 dev server.
- Run `bun x ultracite fix` on touched files only (repo-wide formatting is blocked by CRLF; see UX-047).

---

## Decisions needed before starting

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Admin dashboard (UX-002)** | (a) Wire tiles to existing queries (teachers, classes and homeroom coverage, pending leaves, academic year), wire buttons to existing routes, and drop tiles with no data source (school-wide slots filled, system status). (b) Replace the dashboard with a simple honest launcher until a stats endpoint exists. | **(a)** |
| D2 | **Teachers bulk delete (UX-003)** | (a) Remove bulk delete and "Export Selected". (b) Implement by calling the existing `deleteStaff` once per id, behind a confirm dialog. | **(a)** now; (b) later if needed |
| D3 | **Role-change confirmation (UX-022)** | Add a confirm step before the existing mutation. | Yes |
| D4 | **Missing campus photo (UX-032)** | (a) You supply the photo. (b) Remove the layer. | (a) if available, else (b) |
| D5 | **Test account for browser verification** | Provide one admin and one teacher login for dev, or approve using the seeded accounts. | Needed for Phase 9 |
| D6 | **Dark theme (UX-033)** | Remove the dead `.dark` block, or brand it. | Remove (no toggle exists) |

---

## Phase 0 — Honesty and critical fixes (P0)

| | |
|---|---|
| **Scope** | UX-001 landing clip; UX-002 admin dashboard (per D1); UX-003 bulk delete (per D2); UX-017 "IconSearch" placeholders; UX-014 page titles |
| **Files** | `routes/index.tsx`, `routes/_auth/admin/$year/index.tsx`, `teachers-list.tsx`, `attendance-page-content.tsx`, `classes-tabs.tsx`, `routes/__root.tsx`, plus a `head()` in each route file |
| **Dependencies** | D1, D2 |
| **Expected result** | No fabricated information anywhere; landing readable on every phone; every tab titled "{Page} · St. Aloysius' College" |
| **Regression risk** | Low. The dashboard only *reads* existing queries (already cached by the sidebar). |
| **Tests** | Vertical-clip sweep on `/`; title check on all routes; dashboard counts compared with the Teachers and Classes pages |

## Phase 1 — Design tokens (P1)

| | |
|---|---|
| **Scope** | In `packages/ui/src/styles/globals.css`: `--muted-foreground` 60%→70% (UX-010); `--input` 22%→55% (UX-011); focus ring spec (UX-012); sidebar muted 40/50%→60% (UX-034); named tokens for the hand-coded colours (`--surface-deep #04220A`, `--primary-hover #064A12`, `--gold-text #A97400`, `--success #2E7D32`, `--destructive-foreground`, `--subject-1..8`); type scale; content widths (`--content-max: 96rem`, `--prose-max: 65ch`); z-index layers; reduced-motion defaults (UX-040); thin brand scrollbars plus `scrollbar-gutter: stable` (UX-044); `color-scheme: light` |
| **Dependencies** | None |
| **Expected result** | Every token-based page passes AA text contrast and 3:1 control borders |
| **Regression risk** | Low to medium. The whole app shifts slightly darker in muted text. Hex-styled pages are unaffected until Phase 6. |
| **Tests** | Recompute contrast; axe colour-contrast rule; screenshot comparison of 4 public routes |

## Phase 2 — Shared primitives and patterns (P1)

| | |
|---|---|
| **Scope** | `button`, `input`, `textarea`, `select`, `table`, `dialog`, `alert-dialog`, `sheet`: 14px text (16px below `sm`, UX-013), 36px controls (40px on `pointer: coarse`), 2px focus ring, dialog `max-h-[calc(100dvh-2rem)]` with scrolling and safe-area padding (UX-024), reduced-motion gating. New app-level patterns in `apps/web/src/components/ui-patterns/`: `PageHeader` (UX-026), `FormDialog` (sticky header and footer), `ConfirmDialog` with pending state (UX-029), `SearchInput` with a required label, and a `Skeleton`/`Empty`/`ErrorState` trio (UX-039) |
| **Dependencies** | Phase 1 |
| **Expected result** | One button, one input and one dialog behaviour everywhere; dialogs never exceed the viewport |
| **Regression risk** | **Medium.** Every page uses these primitives, and the denser staff pages (timetable, attendance) grow slightly. Local `className` overrides that set `h-*`/`size-*` must be re-checked. |
| **Tests** | Visual pass of every route and dialog (see the inventory in the audit, B.3); dialogs at 844×390 landscape; keyboard: Tab, Escape, focus return |

## Phase 3 — Forms (P1)

| | |
|---|---|
| **Scope** | `id`/`htmlFor` on all labels (UX-015); `aria-invalid` + `aria-describedby` + `data-invalid` on `Field` (UX-016); login `autoComplete`, NIC placeholder and toggle target (UX-023); `type="tel"` phone inputs (UX-038); required-field indicator (visually "Required", and `aria-required`); consistent submit labels and loading text; placeholders reviewed against the style guide |
| **Files** | teacher-form, class-form, assign-teacher-form, period-assignment-form, teacher-period-assignment-form, academic-year-form, apply-leave-form, my-profile-content, login-form, signup-form, password-dialog, verify-email-content, ban-user-dialog, leave-request-card, `periods.tsx` filters |
| **Dependencies** | Phase 2 |
| **Expected result** | Every control has a visible, programmatically linked label; errors appear on the field and are announced |
| **Regression risk** | Low. Attribute-only changes. Field names and submit handlers are unchanged. |
| **Tests** | axe `label` and `aria-*` rules; submit each form invalid, then valid, and confirm the API payload is unchanged (network tab or Playwright request capture) |

## Phase 4 — Shell and navigation (P1/P2)

| | |
|---|---|
| **Scope** | Sidebar items become `<Link>` with `aria-current` (UX-021); the header shows the page title and breadcrumb plus the academic-year chip (UX-027); skip link (UX-042); centered content with `--content-max` (UX-035); focusable "Coming soon" items (UX-043); crest `<img>` gets width and height |
| **Files** | `nav-main.tsx`, `app-sidebar.tsx`, `routes/_auth/route.tsx` |
| **Dependencies** | Phase 1 |
| **Expected result** | Navigable by keyboard and screen reader; open-in-new-tab works; balanced layout on 2560–7680 displays |
| **Regression risk** | Low. Route destinations are identical. The `navigate()` → `Link` change must keep the `as never` typed paths working. |
| **Tests** | Click every nav item for each role; middle-click; check the active state on nested routes |

## Phase 5 — Tables, grids and data (P1)

| | |
|---|---|
| **Scope** | Remove nested buttons in both timetable grids and the Teachers row menu (UX-018); make actions visible on focus and touch (UX-019); attendance checkbox names, visible period times, 24px+ icon buttons (UX-020); Teachers checkbox labels and responsive Email column (UX-037); a shared `DataToolbar` (search + filters + actions); `scope="col"` on header cells; a timetable "day view" below `md` (from `AGENTS.md`); minimum text size (UX-036) |
| **Files** | `timetable-grid.tsx`, `teacher-timetable-grid.tsx`, `teachers-list.tsx`, `attendance-grid.tsx`, `classes-tabs.tsx`, `class-card.tsx` |
| **Dependencies** | Phase 2 |
| **Expected result** | Every table and grid fully operable by keyboard, touch and screen reader; no data columns removed |
| **Regression risk** | Medium. Timetable cell markup changes, so Assign/Edit/Unassign flows and the conflict highlight must be re-tested. |
| **Tests** | Assign, edit and unassign a period; mark absent/present, add a reason, record an arrival; past-date confirmation; export buttons |

## Phase 6 — Migrate hex-styled pages to the system (P1/P2)

| | |
|---|---|
| **Scope** | Replace hardcoded hex values and raw controls with tokens and primitives while keeping each page's look: login, signup, verify, pending approval, account, admin users (role confirmation UX-022, table → `Table`), teacher requests, approve/ban/purge dialogs, principal and deputy homes, admin dashboard, 404 (UX-025, UX-041) |
| **Dependencies** | Phases 1–3; D3 |
| **Expected result** | A single visual language. Contrast fixes from Phase 1 now reach these pages. |
| **Regression risk** | Medium. These are auth and account flows, so sign-in, sign-up, OTP, password change, ban/unban and purge must be re-tested. |
| **Tests** | Full auth smoke test; a before/after screenshot pair per page |

## Phase 7 — Assets and performance (P2)

| | |
|---|---|
| **Scope** | Self-host Manrope and Cormorant via `@fontsource` and drop the Google Fonts `<link>` and the unused Figtree/Roboto/Inter (UX-030 — needs `bun add` of 2 frontend-only font packages, for your approval); optimised crest in WebP/AVIF with a PNG fallback (UX-031); resolve the campus photo per D4 (UX-032) |
| **Dependencies** | D4 |
| **Expected result** | No render-blocking third-party CSS; about 250 KB less per page; no 404s |
| **Regression risk** | Low. Font metrics may shift slightly. |
| **Tests** | Lighthouse (lab) LCP/CLS before and after; network tab shows no 404s |

## Phase 8 — Polish (P2/P3)

UX-028 (`color-scheme:dark` removal), UX-033 (dark theme per D6), UX-045 (copy and capitalisation pass), UX-046 (enum labels), and `DESIGN_SYSTEM.md` documenting tokens, patterns, copy style and responsive rules.

## Phase 9 — Verification and final reports

- Playwright sweep of **all** routes (authenticated, once D5 is resolved) × 24 widths: overflow, clipping, dialogs within the viewport.
- axe-core on every route; manual keyboard pass; 200% and 400% zoom.
- WebKit and Firefox engine runs via Playwright. Physical devices are documented as untested.
- `bun run check-types`, `bun run build`, and lint on changed files.
- Deliver `DESIGN_SYSTEM.md`, `RESPONSIVENESS_TEST_REPORT.md` and `FRONTEND_REGRESSION_REPORT.md`, each separating passed, failed and not-executed results.

---

## Suggested order and size

| Phase | Est. files touched | Can ship alone? |
|---|---|---|
| 0 | ~25 (mostly one-line `head()` additions) | Yes |
| 1 | 1 | Yes |
| 2 | ~10 primitives + 4 new patterns | Yes, after Phase 1 |
| 3 | ~15 | Yes |
| 4 | 3 | Yes |
| 5 | 6 | Yes |
| 6 | ~15 | Page by page |
| 7 | 3 + assets | Yes |
| 8–9 | docs + tests | — |

Recommended first step: **Phase 0 + Phase 1**. They are the highest impact at the lowest risk, and fix what users currently see as wrong or misleading.
