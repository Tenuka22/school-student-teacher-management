# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `bun x ultracite fix` before committing to ensure compliance.

---

## Staff Management Architecture (Planning Phase — Sep 19, 2026)

This section documents the design and planning for the comprehensive staff management system, which includes five major features: teacher management, subject assignment, class assignment, period/timetable management, and historical data views.

### Feature Folder Structure

Feature components are isolated into separate folders under `apps/web/src/components/staff/`. These are the folders that exist:

```
apps/web/src/components/staff/
├── teacher-management/       # Teacher CRUD, profiles, qualifications, employment verification
│   └── UI.md                 # Comprehensive UI design document
├── class-assignment/         # Create classes, assign homeroom teachers
│   └── UI.md
├── period-management/        # Timetable: period config + class/teacher slot assignments
│   └── UI.md
├── historical-data/          # Cross-year historical views and reporting
│   └── UI.md
├── inventory/                # School-wide equipment register, custody, lifecycle, ledger
│   └── UI.md
├── academic-year-switcher/   # The sidebar's year switcher
│   └── UI.md
├── attendance/               # Attendance register and late-arrival policy screens (no UI.md)
├── leave-management/         # Leave queue and quota screens (no UI.md)
└── teacher-portal/           # The teacher's own self-service surfaces (no UI.md)
```

There is no `subject-assignment/` folder: subject-to-teacher assignment is administered from inside `teacher-management` and `period-management`. The tree above used to list one; it does not exist.

Each feature is **completely self-contained** (no shared components between folders) to allow independent iteration and feature deployment. Shared patterns (table, form layouts) use shadcn base components only.

### Route Structure

Routes are file-based via TanStack Router. Every authenticated page lives under a role-scoped workspace in `apps/web/src/routes/_auth/`, and the academic year is a path segment:

```
apps/web/src/routes/_auth/
├── route.tsx                          # authed shell (sidebar + session guard)
├── account.tsx                        # /account — password, device sessions
├── verify.tsx                         # /verify — email confirmation
├── pending-approval.tsx               # teacher awaiting administrator approval
├── admin/route.tsx                    # role guard: admin | principal | vicePrincipal
├── admin/$year/route.tsx              # year guard: forwards a stale year
├── admin/$year/index.tsx              # /admin/2026
├── admin/$year/academic-years.tsx     # /admin/2026/academic-years
├── admin/$year/users.tsx              # /admin/2026/users
├── admin/$year/teacher-requests.tsx   # /admin/2026/teacher-requests
├── admin/$year/staff/                 # teachers, classes, periods, leaves, attendance,
│                                      #   teacher-timetable, historical-data, inventory
├── principal/route.tsx                # role guard: principal
├── principal/$year/index.tsx          # /principal/2026
├── principal/$year/leaves.tsx         # /principal/2026/leaves
├── principal/$year/teacher-requests.tsx
├── principal/$year/equipment.tsx      # /principal/2026/equipment — own equipment only
├── principal/$year/staff/attendance.tsx
├── deputy-principal/route.tsx         # role guard: vicePrincipal
├── deputy-principal/$year/index.tsx   # /deputy-principal/2026
├── deputy-principal/$year/leaves.tsx
├── deputy-principal/$year/equipment.tsx
├── deputy-principal/$year/staff/attendance.tsx
├── teacher/route.tsx                  # role guard: teacher | admin roles
├── teacher/$year/index.tsx            # /teacher/2026
├── teacher/$year/profile.tsx          # /teacher/2026/profile
├── teacher/$year/leave.tsx            # /teacher/2026/leave
├── teacher/$year/timetable.tsx        # /teacher/2026/timetable
├── teacher/$year/equipment.tsx        # /teacher/2026/equipment — own equipment only
├── dashboard.tsx                      # legacy /dashboard -> role home
└── dashboard.$.tsx                    # legacy /dashboard/* -> role home
```

The school-wide inventory register has one route, `admin/$year/staff/inventory.tsx`. It is deliberately **not** mounted under the Principal and Deputy workspaces, whose `equipment.tsx` pages show each seat its own holdings. `leadershipNav` in `app-sidebar.tsx` carries "My Equipment" and no register entry, so widening that is a product decision, not a missing file.

Workspace roots (`/admin`, `/teacher`, `/principal`, `/deputy-principal`) only carry the role guard and forward to the active year; the pages themselves live under `$year`.

The parent layout is in `apps/web/src/routes/_auth/route.tsx` (wraps all `/dashboard/*` routes with the sidebar-08 shell). **Do not** edit `routeTree.gen.ts` directly; it's auto-generated by the TanStack Router Vite plugin.

### API Router Composition

Staff procedures live under `packages/api/src/routers/staff/`; marking under `routers/marking/`, inventory under `routers/inventory/`. They are not all guarded the same way, and the guard is the decision: `adminProcedure` for the leadership queue, `adminOnlyProcedure` for school-wide writes, and a `require*Permission("resource")` helper where the work is a domain edit (staff, student, mark, exam, qualification, inventory). Timetable assignment reuses the `assignment` resource, as subject and class assignment already did.

```
packages/api/src/routers/staff/
├── create-staff.ts
├── update-staff.ts
├── delete-staff.ts
├── list-staff.ts
├── get-staff.ts
├── ... (existing procedures)
├── periods/                  # Period/timetable procedures
│   ├── list-period-config.ts
│   ├── assign-class-period.ts
│   ├── update-class-period-assignment.ts
│   ├── delete-class-period-assignment.ts
│   ├── list-class-timetable.ts
│   ├── list-teacher-timetable.ts
│   ├── get-my-teacher-timetable.ts
│   ├── list-unassigned-slots.ts
│   ├── list-period-conflicts.ts
│   ├── create-period-config.ts # a stub that throws; not in the router
│   └── index.ts              # Compose all above
├── exports/                  # Excel/PDF procedures
│   ├── export-teachers-excel.ts
│   ├── export-teacher-profile-pdf.ts
│   ├── export-classes-excel.ts
│   ├── export-class-timetable-pdf.ts
│   ├── export-class-teacher-history-excel.ts
│   ├── export-all-timetables-excel.ts
│   └── index.ts
└── index.ts                  # Compose all routers
```

All procedures follow the same shape: oRPC handler + valibot input schema + a guard chosen from the tiers below. The guard, not the resource, is what makes a procedure safe to expose.

### Database Schema Design

**Period Configuration:**

There is no `period_config` table, and there never has been. Period times live in code: `CODE_DEFINED_PERIODS` in `packages/db/src/periods.ts` (07:50–13:30, eight periods). The period grid, the teacher grid and the attendance register all read that one list, so they cannot disagree about what "Period 3" is. `staff.periods.createPeriodConfig` is a stub that throws and is not exported.

A per-year `period_config` table was planned once and never built: a data-driven period editor requires a migration, a version-selection UI, and a decision about what happens to assignments when a period's time changes. None of that is built. If a future year needs different bell times, that is a feature — do not describe it as existing.

**Class Period Assignment:**

- `class_period_assignment` table: Core timetable table mapping class + day + period → teacher + subject.
- Columns: `id`, `academicYearId`, `classId`, `dayOfWeek` (1–5, Mon–Fri), `periodNumber` (1–8), `subjectKey`, `staffId`, `isCombinedSession`, timestamps.
- One unique constraint, enforced at DB level: `(academicYearId, classId, dayOfWeek, periodNumber)` — no duplicate class slots (`class_period_assignment_class_slot_unique`).
- **There is no unique constraint on teacher double-booking, and there is not meant to be.** `class_period_assignment_teacher_slot_unique` on `(academicYearId, staffId, dayOfWeek, periodNumber)` was created in `0002_eager_kinsey_walden.sql` and dropped in `0004_silly_punisher.sql`. The schema states the reason (`packages/db/src/schema/periods.ts`): a combined session — one Dance/Music teacher running several classes in the same period — is a legitimate, intentional overlap, and a unique index cannot tell it from an accident. So double-booking is enforced in **application code**, not by the database: `periods.listPeriodConflicts` groups a year's assignments by `(staffId, dayOfWeek, periodNumber)` and reports every group containing an unmarked overlap. A conflicting row _can_ be written, so nothing may promise that the stored timetable is double-book-free — only that conflicts are detectable.
- Indexes: four **single-column** indexes — `class_period_assignment_year_idx` (`academicYearId`), `class_period_assignment_class_idx` (`classId`), `class_period_assignment_staff_idx` (`staffId`), `class_period_assignment_subject_idx` (`subjectKey`). There is no composite index on this table.
- `isCombinedSession` is how an intentional overlap is recorded. A teacher's legitimate second class in the same slot must set it, or the conflict scan reports it as double-booked.

**Valibot & Branding:**

- `packages/db/src/schema/periods.ts` holds `ClassPeriodAssignmentId` and its valibot counterpart. `PeriodConfigId` was never added, because the table it described does not exist.
- Branded types follow the existing pattern: `export type ClassPeriodAssignmentId = Brand<string, "ClassPeriodAssignmentId">` + `v.pipe(v.string(), brand<...>())`.

**Historical Scope:**

- All assignment tables are `academicYearId`-scoped. Changing years isolates data automatically.
- No archiving needed; past years are queried with their `academicYearId`. The `academicYear` table already exists and tracks `isCurrent`.
- Reading a _closed_ year is a route-level decision, not a global one: every year-scoped page is guarded to the current year, and only `/_auth/admin/$year/staff/historical-data` passes `allowAnyYear: true` to `loadAcademicYearRoute`.

The period design is the code: `packages/db/src/schema/periods.ts` for the table, `packages/db/src/periods.ts` for `CODE_DEFINED_PERIODS`, and this section for the reasoning. No period planning document is kept in the repository, so do not cite one.

### UI Component Pattern

Most feature folders contain a `UI.md` file — `teacher-management`, `subject-assignment`, `class-assignment`, `period-management`, `historical-data` and `inventory` do; `attendance`, `leave-management` and `teacher-portal` do not, so do not go looking for one. Those files began as plans and now open with a table of what actually shipped and where the plan was wrong — read the banner, not the plan. Two rules follow from that: never document a shortcut, export or field that does not exist, and when a screen's behaviour changes, the banner is the thing that must change with it.

**shadcn Component Usage (Maximize Coverage):**

- **Tables:** Use shadcn `Table` (composition-based) + optional `DataTable` helper pattern for sorting/filtering. Never hand-roll table markup.
- **Forms:** All form controls wrapped in `FieldGroup` + `Field` + `FieldLabel` + `FieldError` (already in UI package). Never use raw `input` + `label`.
- **Dialogs/Modals:** Use `Dialog` (centered modal) or `Sheet` (side panel slide-in) for create/edit flows. Keep users on the list page during mutations.
- **Dropdowns/Selects:** Use shadcn `Select` (with `Combobox` pattern for search) for filtering and form controls.
- **Lists & Grids:** Timetable grids use `Table` or a custom CSS Grid (for period slots); use `Card` for grade-structure view (card per grade).
- **Feedback:** Use `toast()` from `sonner` (already installed) for every mutation success/error.
- **Skeletons & Empty States:** Use shadcn `Skeleton` for loading + `Empty` component for no-data states.
- **Navigation & Search:** Use shadcn `Command` (wrapped in `Dialog`) for Cmd+K search across teachers, classes, subjects.
- **Menus:** Use shadcn `ContextMenu` (right-click) or `DropdownMenu` for row actions and bulk operations.

No hand-rolled modals, dropdowns, or custom table logic. If shadcn doesn't have a component you need (e.g., rich calendar, advanced data table), install it via `bunx --bun shadcn@latest add <component>` from `apps/web/` or implement using base-ui primitives + TailwindCSS.

### Export Strategy

**Excel Exports (Multiple Records):**

- `exceljs`, already a dependency of `packages/api` — not "to be added".
- `staff.exports.*Excel` build the workbook in `packages/api/src/lib/export.ts` and return it for download.
- Shipped: `teachersExcel`, `classesExcel`, `classTeacherHistoryExcel`, `allTimetablesExcel` (one sheet per teacher).

**PDF Exports (Single Record or Print-Friendly):**

- `pdfmake`, already a dependency of `packages/api` (`buildPdfExport`). `@react-pdf/renderer` is **not** installed and is not what the app uses.
- Shipped: `teacherProfilePdf` (one teacher's profile + qualifications), `classTimetablePdf` (one class's timetable).
- For simple text-heavy reports, the browser's native `print` stylesheet (Tailwind `@print:` utilities) is the alternative.

**Word/DOCX Exports:** not built. `docx` is not a dependency; do not describe a DOCX export as existing.

All six exports are real, working oRPC procedures (not stubs), in `packages/api/src/routers/staff/exports/`. Files are generated server-side and returned to the browser for download. There is no timetable conflict-report export — `periods.listPeriodConflicts` returns the conflicting assignment ids and nothing renders them to a file.

### Permissions & Access Control

Three tiers, and the difference between them is a decision, not an accident (September 2026).

- **`adminProcedure`** — `admin`, `principal`, `vicePrincipal`. Reading the ledger and acting inside your own queue: leave review, staff requests, attendance for the whole staff, and school-wide timetable reads.
- **`adminOnlyProcedure`** — `admin` alone. The writes that change what the whole school believes: opening, switching or deleting an academic year, editing the attendance policy, setting leave quotas. The leadership seats can read and review, but they do not move the goalposts for everyone else.
- **Permission resources** (`packages/auth/src/permissions.ts`) — per-role grants on `file`, `staff`, `assignment`, `qualification`, `student`, `mark`, `exam` and `inventory`. A teacher's `assignment: ["read"]` deliberately does **not** reach school-wide timetable reads, attendance reads or timetable exports: those are `adminProcedure`. A teacher reads their own timetable through `periods.getMyTeacherTimetable`, and enters marks only for the class they are the homeroom teacher of (`assertCanEnterMarkForAssignment`). A teacher's `inventory` grant is `["read", "take", "manageOwn"]` and is scoped to _their own_ rows inside the handlers, because a permission says which procedures may run and never which rows they may touch.

Office staff have no self-service sign-up: their accounts are issued by an administrator, who creates the staff record and hands over the login.

Enforce access control at the API layer (oRPC procedures) using better-auth's `ac` (access control) helper and the session context.

### Leave entitlements

`leave_entitlement` is one row per (academic year, leave type, payment status), and the quota is **enforced** at `applyLeave`: a request that would exceed the remaining days is refused with the remaining figure in the message. Consumption is derived from approved requests, matching the balance a teacher is shown.

Maternity is the College's own rule: **84 days on full pay and a further 84 days at half pay**, per person (`DEFAULT_LEAVE_ENTITLEMENTS` in `packages/db/src/constants/leave.ts`). `halfPay` is a distinct payment status from `unpaid` — the second maternity tier used to be recorded as `unpaid`, which told a teacher the wrong thing about their entitlement.

The quota is counted per person per academic year. A "per delivery" reading of the 84 days would need a maternity-event reference on `leave_request` to group requests by delivery; that data model does not exist yet, so the UI states "per person" rather than implying a rule it does not enforce.

### Keyboard Shortcuts

There are no product-level keyboard shortcuts. The only one in the app is the sidebar's inherited Cmd/Ctrl+B toggle. Do not document shortcuts that are not implemented — the shortcut table that used to live here listed Cmd+K, Cmd+N, Cmd+E and Cmd+Shift+C, none of which exist.

- **Esc:** Close an open dialog or menu.
- **Tab / Shift+Tab:** Move through form fields, table rows and grid cells.
- **Enter:** Submit the focused form, or activate the focused control.

Per-feature UI docs, where they exist (see the folder list above), say the same thing: the inventory `UI.md` records that the register shipped with no keyboard shortcuts at all.

### Responsive Behavior

**Desktop-first design.** Do NOT spend effort on mobile/phone layouts for admin staff features.

- **md breakpoint (TailwindCSS):** Sidebar and main content adjust. Sidebar collapses to hamburger icon on smaller screens (handled by shadcn Sidebar component already integrated in the shell).
- **Tables:** On smaller screens (below md), some columns hide; users can swipe/scroll to reveal. Use TailwindCSS's responsive utilities (`hidden md:table-cell`, etc.).
- **Dialogs/Sheets:** Full-screen on mobile, centered on desktop (handled by `Dialog` and `Sheet` components).
- **Timetable Grid:** May need horizontal scroll on tablets; period view can collapse to "day view" mode (one day visible at a time, vertical scroll through periods).

Explicitly: Do **NOT** design phone layouts. Only ensure dialogs are full-screen on narrow viewports and tables don't overflow.

### State Management

- **Server state:** Use TanStack Query (`@tanstack/react-query`) with oRPC queryClient setup (already configured in the app).
  - Queries: `useQuery(orpc.staff.listTeachers.queryOptions())`, etc.
  - Mutations: `useMutation(orpc.staff.createTeacher.mutationOptions())`, etc.
  - Optimistic updates: Possible via Query cache manipulation (recommended for all mutations for snappy UX).

- **URL state:** TanStack Router owns exactly two kinds of thing today, and nothing else is in the URL:
  - **Academic year: a path segment**, not a query param — `/admin/2027/staff/teachers`. The sidebar switcher rewrites the segment and the `$year` guard forwards a stale one.
  - **Two search params:** `?tab=` on the inventory register (`register` / `records`) and `?search=` on the three equipment pages.
  - The register's other filters (status, category, condition, custodian, low stock, "no manager") are component state, deliberately — see the inventory `UI.md`, which argues why. A previous version of this list claimed `?status=`, `?grade=`, `?compare=` and `#table`; none of them exist.

- **Form state:** Use React's `useState` for simple forms, or `@tanstack/react-form` if complex multi-step forms needed (not required for MVP).
  - Form validation: Client-side via valibot schemas (same schemas generated from DB).
  - Do **not** sync unsaved form state to URL or localStorage (avoid complexity).

- **UI state:** Sidebar collapse, modal open/close: Local component state via `useState` or controlled via Radix/shadcn built-ins.

### Development Workflow

1. **Schema Design (if needed):** Update `packages/db/src/schema/` (e.g., `periods.ts`), regenerate Drizzle types.
2. **API Procedures:** Implement in `packages/api/src/routers/staff/` folder.
3. **Frontend Components:** Build in feature folder (`apps/web/src/components/staff/{feature}/`). Import the component from its own module — **no feature folder has an `index.ts` barrel, and this document's own Performance rules say not to add one.**
4. **Routes:** Create route file in `apps/web/src/routes/_auth/admin/$year/staff/{feature}.tsx`, connect to component.
5. **Testing:** Unit tests for complex logic; smoke tests for mutation flows (use the actual dev server running on port 3001).
6. **Linting:** Run `bun x ultracite fix` on all new files before committing.
7. **Build:** Run `bun run build` to ensure no TypeScript errors. Dev server must continue running; **never stop/restart the port 3001 dev server**.

### Planning Documentation

- **`packages/db/src/schema/periods.ts`:** the period/timetable table, its one unique constraint and its four single-column indexes. This is the design of record for periods; there is no separate planning document.
- **`apps/web/src/components/staff/{feature}/UI.md`:** Per-feature UI/UX specification where one exists (see the list above); keep as durable reference; informs all future maintenance.
- **This section (AGENTS.md):** High-level architecture reference for future engineers.

### Implementation Notes (When Ready)

- **Do not start implementation until planning is approved.** This is the planning phase only.
- Coordinate via `hub` messaging if multiple engineers work on the same feature folder (avoid edit conflicts).
- Each feature folder is independent; can be built in parallel.
- Test exports thoroughly (Excel formulas, PDF page breaks, etc.) before claiming done.
- Ensure all oRPC procedures return proper error types (don't swallow errors; surface them to the client).
- Use the existing staff module routers as patterns (see `packages/api/src/routers/staff/create-staff.ts`, etc.).
