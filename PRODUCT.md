# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single-college staff administration system for **St. Aloysius' College, Galle**. Four confirmed roles, each with its own workspace and its own permissions tier:

- **Teacher** — self-service. Files their own leave, views their own timetable, manages the equipment in their charge, edits their own profile. Reads nothing school-wide.
- **Administrator** — the only account that changes what the whole school believes: opens/switches/deletes an academic year, edits the attendance policy, sets leave quotas, issues office-staff accounts. Also holds the full staff, class, timetable, leave and inventory ledgers.
- **Principal** and **Deputy Principal** — read and review across the whole staff (leave queue, staff requests, attendance for all staff, school-wide timetable reads) and manage their own equipment. They deliberately do **not** get the school-wide writes.

Office staff have no self-service sign-up. Their accounts are issued by an administrator who creates the staff record and hands over the login. Teacher self-registration exists but lands in a **pending-approval** queue.

The usage scene is a daylight office or staff room, on a school LAN, during working hours. Density and legibility outrank expression.

## Product Purpose

Run the staff side of a college: staff records and qualifications, classes and homeroom assignment, the timetable, attendance, leave with quotas, and the school-wide equipment register with custody and lifecycle.

Success means an administrator can answer "who is covering Period 3 on Tuesday", "is this teacher within leave quota", and "who is accountable for this projector" without leaving the app, and a teacher can file leave without asking anyone.

## Positioning

Academic-year-scoped isolation. Every staff, class, timetable, attendance and inventory table is keyed by `academicYearId`, and the academic year is a **URL path segment** rather than a filter. Switching years swaps the entire dataset; history is queried, not archived. Combined with leave quotas enforced at submission rather than at approval, this is a records system for consecutive years rather than a single-term tool.

## Operating Context

- The academic year is the spine of navigation. Every page lives under `/admin/2027/...`, `/teacher/2027/...`, `/principal/2027/...`, `/deputy-principal/2027/...`. A stale year in the URL is forwarded by a route guard.
- The timetable reads its period times from **code** (`CODE_DEFINED_PERIODS`, 07:50–13:30, eight periods, Mon–Fri), not from a database table. The period grid, teacher grid and attendance register all read that one list so they cannot disagree about what "Period 3" is.
- A teacher's second class in the same slot is a legitimate **combined session** (one Dance/Music teacher across several classes), flagged by `isCombinedSession`. Double-booking is therefore enforced in application code, not by a database constraint, and a conflicting row _can_ be written.
- Excel (`exceljs`) and PDF (`pdfmake`) exports are generated server-side and streamed to the browser. No DOCX export exists.
- Exports, timetable reads, attendance reads and school-wide ledgers are the sensitive surface. A teacher reads their own timetable through a dedicated self-scoped procedure.
- `desktop-first` is the stated intent. No phone layouts. Dialogs go full-screen on narrow viewports and tables scroll rather than overflow.

## Capabilities and Constraints

- **TanStack Start** (SSR via Nitro) + **TanStack Router** (file-based, generated `routeTree.gen.ts` — never hand-edit) + **TanStack Query** over **oRPC**. API is `packages/api`; the app never calls the database directly.
- **shadcn/ui** in `packages/ui` (`base-lyra`, neutral base, lucide icons), imported by subpath (`@school-student-teacher-management/ui/components/*`). Hand-rolled tables, modals, dropdowns and form controls are out of bounds; AGENTS.md requires shadcn `Table`, `Field`/`FieldLabel`/`FieldError`, `Dialog`/`Sheet`, `Select`/`Combobox`, `Skeleton`, `Empty`, `toast()` from sonner.
- Every feature is **self-contained by folder** (`apps/web/src/components/staff/<feature>/`) with deliberately **no barrel `index.ts`** and no shared components between folders. Adding a cross-feature shared module is a decision, not a cleanup.
- Left open, deliberately: no dark theme (tokens are light-only and the brand depends on it), no per-year period configuration table, no DOCX export, no maternity "per delivery" grouping.
- Leave: quota is enforced **at apply time** and consumption is derived from approved requests. Maternity is the College's own rule — 84 days full pay, a further 84 days at half pay, **per person** (`halfPay` is a distinct status from `unpaid`).

## Brand Commitments

Refining the incumbent, not replacing it. These are binding and must survive the work:

- **Deep green `#013405`** as primary ink and sidebar ground; **cream paper `#fdf8ec`** background; **amber `#ffb203`** accent. `CERTA VIRILITER` is the College motto and appears on the 404.
- **Cormorant Garamond** for headings (`font-heading`), **Manrope** for everything else. Both self-hosted from the bundle — a school LAN, privacy extension, strict CSP or slow link must never collapse a heading to a generic serif or send a page view to a third party.
- **Light-only.** The crest, cream surfaces and deep green assume a light ground, and the system is used in daylight. A dark theme is a feature to be built deliberately with checked contrast, never a leftover token block.
- The gold/amber pair carries a real contrast hazard, already documented in `globals.css`: `--gold` (#a8730b) is **3.87:1** on cream and **3.45:1** on `bg-accent/20`, both under WCAG AA. Gold **text** uses `--warning-ink` (#7f5605, 5.65:1 worst case). Keep that distinction; do not "simplify" it into one token.
- Motto, College name, and the "Galle" location are factual. Do not invent testimonials, counts, benchmarks or awards.

## Evidence on Hand

Real data, no marketing assets. Public figures come from `getLandingStats` against the live database, not from hardcoded numbers. There is no logo file, no photography, no press, no case study, and no pricing. **Future work must not fabricate any of these.** The crest is referenced in markup only.

## Product Principles

1. **The academic year is the address, not a filter.** It belongs in the path so a link, a bookmark and a screenshot are all unambiguous.
2. **Permissions describe the seat, not the screen.** Three tiers, deliberately: `adminProcedure` (admin/principal/deputy — read the ledger, act in your own queue), `adminOnlyProcedure` (admin alone — the school-wide writes), and per-role resource grants. A grant says which procedures may run, never which rows they may touch; row scoping lives in the handler.
3. **Nothing dangles.** Every async surface resolves to content, a taught empty state, or a named error with a recovery. A spinner in the middle of content is a defect; so is a form that can submit into a void.
4. **Density is a feature.** This is a records tool used all day. Earned familiarity beats surprise: one button shape, one form-control vocabulary, one icon style, screen to screen.
5. **Say the real thing.** Errors name the problem and the recovery. The Maternity rule says "per person" because that is what the code enforces.

## Accessibility & Inclusion

WCAG 2.1 AA is the floor, treated as a build requirement rather than a review pass. Staff include people using the system daily for long sessions; keyboard operability and contrast are access, not polish.

- The app is a keyboard tool: full tab order, visible focus rings, `Esc` to close overlays, `Enter` to submit, focus returned to the trigger when a dialog closes. There are no product-level keyboard shortcuts beyond the inherited sidebar `Cmd/Ctrl+B` toggle — do not invent or document any.
- Every image and meaningful icon needs a real accessible name. Icon-only buttons need a label. Decorative icons are `aria-hidden`.
- Announce async results: toasts are `sonner` and must be announced; form errors bind to their field via `FieldError` + `aria-describedby`; loading regions are `aria-busy`.
- Motion conveys state only, 150–250ms, and respects `prefers-reduced-motion`.
- Contrast ≥4.5:1 body and placeholder text, ≥3:1 large text, checked against the specific ground each token sits on (see the Brand Commitments note on `--gold`).
- Semantic HTML: real `<button>`, `<nav>`, `<table>`, `<th scope>`, `<label for>`. One `<h1>` per page, no skipped heading levels, landmarks present.
- Authenticated surfaces carry `noindex` so private staff data can never reach a search index.
