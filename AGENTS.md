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
├── admin/route.tsx                    # role guard: admin
├── admin/$year/route.tsx              # year guard: forwards a stale year
├── admin/$year/index.tsx              # /admin/2026
├── admin/$year/academic-years.tsx     # /admin/2026/academic-years
├── admin/$year/users.tsx              # /admin/2026/users
├── admin/$year/teacher-requests.tsx   # /admin/2026/teacher-requests
├── admin/$year/staff/                 # teachers, classes, periods, leaves, attendance,
│                                      #   teacher-timetable, historical-data, inventory
│                                      #   deputy-principals
├── academic-admin/route.tsx           # role guard: academicAdmin | admin
├── academic-admin/$year/route.tsx     # same year guard as the admin tree
├── academic-admin/$year/index.tsx     # /academic-admin/2026 — the shared dashboard
├── academic-admin/$year/users.tsx
├── academic-admin/$year/teacher-requests.tsx
├── academic-admin/$year/academic-years.tsx
├── academic-admin/$year/staff/        # teachers, classes, periods, attendance, leaves,
│                                      #   teacher-timetable, historical-data (allowAnyYear);
│                                      #   deputy-principals
│                                      #   no leaves.tsx here — moved to leave-admin
├── inventory-admin/route.tsx          # role guard: inventoryAdmin | admin
├── inventory-admin/$year/route.tsx    # same year guard as the admin tree
├── inventory-admin/$year/index.tsx    # the store dashboard (InventoryDashboard)
├── inventory-admin/$year/staff/inventory/   # register + loans, issues, write-offs,
│                                            #   asset-register, ledger
├── leave-admin/route.tsx               # role guard: leaveAdmin | admin
├── leave-admin/$year/route.tsx         # same year guard as the admin tree
├── leave-admin/$year/index.tsx         # redirects straight to staff/leaves
├── leave-admin/$year/staff/leaves.tsx  # the school-wide leave queue
├── principal/route.tsx                # role guard: principal
├── principal/$year/index.tsx          # /principal/2026
├── principal/$year/leaves.tsx         # /principal/2026/leaves
├── principal/$year/teacher-requests.tsx
├── principal/$year/equipment.tsx      # /principal/2026/equipment — own equipment only
├── principal/$year/staff/attendance.tsx
├── deputy-principal/route.tsx         # role guard: vicePrincipal (no seeded account — a real staff member's current-year staffPosition)
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

The school-wide inventory register exists in two trees: `admin/$year/staff/inventory.tsx` (the top administrator's) and `inventory-admin/$year/staff/inventory.tsx` (the Inventory Administrator's). Both render the same `InventoryPage`, which takes a `base` prop so its pane switches stay inside the workspace they were opened from. The register is deliberately **not** mounted under the Principal and Deputy workspaces, whose `equipment.tsx` pages show each seat its own holdings. `leadershipNav` in `app-sidebar.tsx` carries "My Equipment" and no register entry, so widening that is a product decision, not a missing file.

Workspace roots (`/admin`, `/academic-admin`, `/inventory-admin`, `/leave-admin`, `/teacher`, `/principal`, `/deputy-principal`) only carry the role guard and forward to the active year; the pages themselves live under `$year`. The `admin` workspace is the top administrator's alone — `inventoryAdmin`, `academicAdmin` and `leaveAdmin` were each admitted to it in turn and arrived at a workspace whose links outside their one job failed at the API layer, which is why all three seats now have trees of their own (`academic-admin/route.tsx`, `inventory-admin/route.tsx` and `leave-admin/route.tsx` document the reasoning). `leaveAdmin` also has no `staffNav`/`academicNav` entries at all — its whole job is one group of routes under `staff/leaves`, mirroring how `inventoryAdmin`'s whole job is one group under `staff/inventory`.

Each of the four specialist administrator seats lands on its own `$year` index, and `getHomePath` sends all four there — the Academic, Inventory and Leave Administrators included, with no special case. The two specialist dashboards are the same page dressed for different work rather than two implementations: `components/admin/admin-dashboard.tsx` (with `base` deciding which workspace's addresses it builds) and `components/staff/inventory/inventory-dashboard.tsx`, sharing `StatTile` and `components/admin/dashboard-figure.ts` (`FOCUS_RING`, `OUTLINE_LINK`, `plural`, `Figure`, `showFigure`). **The values live in their own module on purpose:** a module exporting both components and plain values cannot preserve Fast Refresh state, so the fix for that lint rule is a file, not a disable comment.

The parent layout is in `apps/web/src/routes/_auth/route.tsx` (wraps all `/dashboard/*` routes with the sidebar-08 shell). **Do not** edit `routeTree.gen.ts` directly; it's auto-generated by the TanStack Router Vite plugin.

### API Router Composition

Staff procedures live under `packages/api/src/routers/staff/`; marking under `routers/marking/`, inventory under `routers/inventory/`. They are not all guarded the same way, and the guard is the decision: `adminProcedure` for the leadership queue, `academicProcedure` for the academic desk's pages, `adminOrAcademicProcedure` for the school-wide switches the academic desk shares with the top admin, `adminOnlyProcedure` for the one switch only the top admin makes (leave quotas), the two `inventory*Procedure` tiers for the register, and a `require*Permission("resource")` helper where the work is a domain edit (staff, student, mark, exam, qualification, inventory). Timetable assignment reuses the `assignment` resource, as subject and class assignment already did.

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

**Staff identity (`staff.nic`):**

`staff.nic` is **`NOT NULL`, `UNIQUE` and format-checked by the database** (`staff_nic_format`, declared in `packages/db/src/schema/staff.ts` and mirroring `NIC_FORMAT_SQL` in `schema/primitives.ts`: 9 digits + `V`/`X`, or 12 digits). It is the identity this product keys a person on — `usernameForNic` in `packages/auth/src/admin.ts` makes it the login username — so "leave it blank and fill it in later" was never available in the first place, and the database now says so.

**Both Sri Lankan formats are accepted on purpose.** The old 9-digit card is a real identity the Department of Issue still recognises, and a registration form refusing a 70-year-old teacher is refusing a person rather than rejecting a typo. The old column accepted any string at all, and three seeded rows were carrying 10-digit values that matched no identity card in the country; the CHECK is the version of the valibot rule that cannot be skipped by a seed script or a hand-run `UPDATE`.

**The five seeded office seats carry a synthetic NIC.** `SEEDED_PLACEHOLDER_NIC` in `packages/auth/src/admin.ts` is `000000000001`–`000000000005` for admin, principal, deputy, inventory-admin and academic-admin: eight leading zeros is a birth year of `00`, which is not a year anybody was issued, so the value satisfies the format while being visibly not a person's. They are **never** a login username — those seats sign in with the fixed usernames above. A seat's row is created with `onConflictDoNothing({ target: staff.userId })`, so the placeholder is written on insert and never overwritten; rows created before the column became `NOT NULL` are backfilled by migration `0007` (`000000000001`–`000000000006` by seat id; a NULL or malformed NIC on any other row stops the migration with a count rather than being invented — this backfill was claimed here before it existed and was added in the October 2026 repair), not by the seeder, because "only a missing row is repaired" is the same property that stops a school's edits being reverted.

**Period Configuration:**

There is no `period_config` table, and there never has been. Period times live in code: `CODE_DEFINED_PERIODS` in `packages/db/src/periods.ts` (07:50–13:30, eight periods). The period grid, the teacher grid and the attendance register all read that one list, so they cannot disagree about what "Period 3" is. `staff.periods.createPeriodConfig` is a stub that throws and is not exported.

A per-year `period_config` table was planned once and never built: a data-driven period editor requires a migration, a version-selection UI, and a decision about what happens to assignments when a period's time changes. None of that is built. If a future year needs different bell times, that is a feature — do not describe it as existing.

**Timetable tables (subject-first, teacher-later):**

The single `class_period_assignment` table this section used to describe was dropped in migration `0006` and replaced by two tables; there is no `0002_eager_kinsey_walden.sql` or `0004_silly_punisher.sql` in the repository.

- `class_period_subject` — _what_ is taught in a (class, day, period) slot: `id`, `academicYearId`, `classId`, `dayOfWeek`, `periodNumber`, `subjectKey`, timestamps. Two subjects may share a slot (a split period), so the unique constraint is `(academicYearId, classId, dayOfWeek, periodNumber, subjectKey)` (`class_period_subject_slot_subject_unique`). `dayOfWeek` is CHECKed to 1–5 and `periodNumber` to 1–8 by the database (`class_period_subject_day_range` / `_period_range`, migration `0009`). Indexes: single-column on `academicYearId`, `classId`, `subjectKey`.
- `class_period_teacher` — _who_ teaches a `class_period_subject` row: `classPeriodSubjectId`, `staffId`, `isCombinedSession`. Several teachers may co-teach one entry; `(classPeriodSubjectId, staffId)` is unique.
- **There is no unique constraint on teacher double-booking, and there is not meant to be.** A combined session — one Dance/Music teacher running several classes in the same period — is a legitimate overlap a unique index cannot tell from an accident. Double-booking is _detected_ in application code: `periods.listPeriodConflicts` groups by `(staffId, dayOfWeek, periodNumber)` and reports every group containing an unmarked overlap. A conflicting row _can_ be written; nothing may promise the stored timetable is double-book-free, only that conflicts are detectable. `isCombinedSession` is how an intentional overlap is recorded.

**Valibot & Branding:**

- `packages/db/src/schema/periods.ts` holds `ClassPeriodSubjectId` / `ClassPeriodTeacherId` and their valibot counterparts. `PeriodConfigId` was never added, because the table it described does not exist.
- Branded types follow the existing pattern: `export type ClassPeriodSubjectId = Brand<string, "ClassPeriodSubjectId">` + `v.pipe(v.string(), brand<...>())`.

**Historical Scope:**

- All assignment tables are `academicYearId`-scoped. Changing years isolates data automatically.
- No archiving needed; past years are queried with their `academicYearId`. The `academicYear` table already exists and tracks `isCurrent`.
- Reading a _closed_ year is a route-level decision: every year-scoped page is guarded to the current year, and the two historical-data pages (`/_auth/admin/$year/staff/historical-data` and `/_auth/academic-admin/$year/staff/historical-data`) pass `allowAnyYear: true` to `loadAcademicYearRoute`.
- **Writing to a closed year is refused by the database, not by the route.** A closed year is `academic_year.deleted_at IS NOT NULL`; migration `0010` puts a row trigger (`assert_academic_year_writable`) on every table carrying `academic_year_id`, raising SQLSTATE `YR001`, which the API maps to a 409. Restore the year to change its records. Child rows without their own `academic_year_id` (`teacher_period_absence`, `class_period_teacher`, `subject_mark`) are covered only through their parent.
- **At most one year is current, enforced by the database** (`academic_year_single_current`, a partial unique index, migration `0009`), and a closed year cannot be current (`academic_year_current_not_deleted`). `setCurrentYear` runs in one transaction under an advisory lock.

The period design is the code: `packages/db/src/schema/periods.ts` for the table, `packages/db/src/periods.ts` for `CODE_DEFINED_PERIODS`, and this section for the reasoning. No period planning document is kept in the repository, so do not cite one.

### UI Component Pattern

Most feature folders contain a `UI.md` file — `teacher-management`, `subject-assignment`, `class-assignment`, `period-management`, `historical-data` and `inventory` do; `attendance`, `leave-management` and `teacher-portal` do not, so do not go looking for one. Those files began as plans and now open with a table of what actually shipped and where the plan was wrong — read the banner, not the plan. Two rules follow from that: never document a shortcut, export or field that does not exist, and when a screen's behaviour changes, the banner is the thing that must change with it.

**shadcn Component Usage (Maximize Coverage):**

- **Tables:** Use shadcn `Table` (composition-based) + optional `DataTable` helper pattern for sorting/filtering. Never hand-roll table markup.
  - **A server-side list table is the accounts pattern, not a local invention.** `apps/web/src/components/admin/users-*` is the reference implementation: a `tableFeatures()` object naming exactly the features used, `createColumnHelper` columns with `columnMeta.label` for the Columns menu, `useTable` with `manualSorting` + `manualPagination` + `rowCount`, and the list state in the URL (see **URL state** above). A `sortedRowModel`/`paginatedRowModel`/filter function in a table whose data came from a paged request would order or filter fifty rows and call the answer the whole list.

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

Six tiers, and the difference between them is a decision, not an accident (September 2026).

- **`adminProcedure`** — `admin`, `principal`, `vicePrincipal`. Reading the ledger and acting inside your own queue: leave review, staff requests, attendance for the whole staff, and school-wide timetable reads.
- **`academicProcedure`** — `admin`, `principal`, `vicePrincipal`, `academicAdmin`. The Academic Administrator's desk: the teachers register, classes, period assignment, the accounts list, staffing requests, historical reads. It is `ADMIN_ROLES` **plus** one seat, so widening a procedure onto it grants exactly one new audience and nothing else.
- **`adminOrAcademicProcedure`** — `admin`, `academicAdmin`. School-wide switches the two seats share: opening, switching, restoring and deleting an academic year, and editing the attendance policy. Leadership is deliberately not on this list — it can read every ledger but does not move the goalposts for everyone else.
- **`adminOnlyProcedure`** — `admin` alone. School-wide switches: opening, switching and removing academic years, and editing the attendance policy. Setting leave quotas moved off this tier onto `leaveManagerProcedure` when the Leave Administrator seat was carved out.
- **`inventoryOverseerProcedure` / `inventoryManagerProcedure`** — the register's reads (`ADMIN_ROLES` + `inventoryAdmin`) and writes (`admin` + `inventoryAdmin`). `academicAdmin` holds neither, which is why no inventory link appears in its workspace.
- **`leaveOverseerProcedure` / `leaveManagerProcedure`** — the leave desk's reads (`ADMIN_ROLES` + `leaveAdmin`, guarding `staff.leaves.listLeaveRequests`) and writes (`admin` + `leaveAdmin`, guarding `staff.leaves.entitlements`). `academicAdmin` held the read half through `academicProcedure` until this seat was carved out and now holds neither; the Deputy → Principal recommend/finalize chain is unrelated to this pair — it is resolved from `staffPosition` rows in `resolveAuthority`, not from a role tier, and `leaveAdmin` does not join that chain.
- **Permission resources** (`packages/auth/src/permissions.ts`) — per-role grants on `file`, `staff`, `assignment`, `qualification`, `student`, `mark`, `exam` and `inventory`. A teacher's `assignment: ["read"]` deliberately does **not** reach school-wide timetable reads, attendance reads or timetable exports: those are `adminProcedure`. A teacher reads their own timetable through `periods.getMyTeacherTimetable`, and enters marks only for the class they are the homeroom teacher of (`assertCanEnterMarkForAssignment`). A teacher's `inventory` grant is **`["read", "acknowledge"]`** — reads of their own holdings plus the handover notices they acknowledge or dispute, and **no custody write at all**: `take`, `manageOwn` and `update` are absent, because custody in this school is set from the seeded Inventory Administrator's seat. The three self-service/owner verbs (`takeItem`, `releaseCustody`, `transferOwnership`, `reclaimCustody`) are therefore reachable only by the three leadership seats, which hold `take`/`manageOwn`. A grant says which procedures may run and never which rows they may touch, so the scoping that does exist lives in the handlers.

The route guards are the mirror of these tiers: `/admin` admits `admin`, `/academic-admin` admits `academicAdmin` + `admin`, `/inventory-admin` admits `inventoryAdmin` + `admin`, `/leave-admin` admits `leaveAdmin` + `admin`. Each workspace only offers links its seat's procedures accept, so nobody is invited to click something the server will refuse.

The seeded accounts are `admin`, `principal`, `inventory-admin`, `academic-admin` and `leave-admin` (there is no seeded `deputy-principal` any more; a Deputy is a staff member holding a position). Their **initial** passwords come from `ACADEMIC_ADMIN_PASSWORD` and friends in `.env.schema`. `packages/auth/src/admin.ts` creates a missing seat on boot and **never** overwrites an existing seat's password, so editing `.env` does not rotate one: run `bun --env-file=apps/web/.env scripts/rotate-seat-password.ts <username>`. Boot refuses a seat password shorter than 12 characters or equal to any value ever committed to the repository (`packages/auth/src/seat-password-policy.ts`, forensic audit F-03). `.env.example` ships every secret blank.

**better-auth's admin plugin is not an authorization boundary on its own** (forensic audit F-01). It authorizes on the caller's role statements only, and every role used to spread `adminAc.statements`, which let the Principal, Deputy and Academic Administrator create an `admin` account or set the top administrator's password over `/api/auth/admin/*`. Now:

- the only user/session statements any role holds are `ACCOUNT_ADMIN_STATEMENTS` (`user: list, get, ban`; `session: list, revoke`), on `admin` and `academicAdmin` — exactly what the accounts page calls;
- `adminEndpointGuard` (`packages/auth/src/admin-endpoint-guard.ts`, a better-auth `hooks.before`) refuses the verbs no role is granted, refuses any action on a seeded seat or a privileged-role account unless the caller is `admin`, refuses banning or changing a seeded seat for everyone, and writes every decision to `account_audit_log`;
- better-auth's `/sign-up/email` is disabled; self-registration is the app's own `signupStaff`.

`databaseHooks.user.update` receives only the changed fields — no user id, no request context — so a hook cannot protect a _particular_ account. The one that claimed to protect seeded seats from bans never fired. Put target checks in `adminEndpointGuard`.

Office staff have no self-service sign-up: their accounts are issued by an administrator, who creates the staff record and hands over the login.

Enforce access control at the API layer (oRPC procedures) using better-auth's `ac` (access control) helper and the session context.

### Leave entitlements

`leave_entitlement` is one row per (academic year, leave type, payment status), and the quota is **enforced twice** (`packages/api/src/routers/staff/leaves/quota.ts`, forensic audit F-07):

- **at `applyLeave`, against pending + recommended + approved days** — filing reserves days, so several pending requests cannot each pass against the same untouched balance;
- **at `finalizeLeave`, against approved days** — inside the approval's transaction, so a quota lowered after filing, or an overridden request, cannot slip through.

Both lock the teacher's `staff` row `FOR UPDATE`, which serializes concurrent applications and approvals for one person. `getMyLeaveBalance` reports `usedDays` (approved), `pendingDays` and `remainingDays` = max − used − pending, the same number the server checks. Only `pending`/`recommended` requests can be decided; a cancelled or rejected request is closed even with an override reason. `recommendLeave` and `cancelLeave` are conditional updates on the expected state. Dates are validated as real calendar dates (`packages/db/src/dates.ts`); a request containing no working day is refused. The database CHECKs every status column, the leave type, day part, payment status and `start_date <= end_date` (migration `0009`).

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
  - **Search params, and there are two families of them.** The _pane_ params — `?tab=` on the inventory register (`register` / `records`) and `?search=` on the three equipment pages — are plain `validateSearch` declarations read through `useSearch({ strict: false })`.
  - **The accounts list is a full list state in the URL** (`apps/web/src/routes/_auth/admin/$year/users.tsx`, contract in `apps/web/src/components/admin/users-search.ts`): `?q=`, `?role=`, `?status=`, `?sort=`, `?dir=`, `?page=`, `?size=`. This is the **pattern to copy for a new server-side list table**: one `validateSearch` that both the route's `loader` and the page's hook call, the loader fetching through `context.queryClient.ensureQueryData(orpc.<router>.<list>.queryOptions({ input }))` so the first paint is the answer and a refresh, a shared link and Back all arrive populated, every value clamped on the way in, and every default left **off** the URL. The page reads the validated object as a prop and writes changes by navigating — it must not import the route file, and it must not keep a second copy in `useState`.
  - The register's other filters (status, category, condition, custodian, low stock, "no manager") are component state, deliberately — see the inventory `UI.md`, which argues why. A previous version of this list claimed `?status=`, `?grade=`, `?compare=` and `#table` on those pages; none of them exist. `?status=` exists now, but only on the accounts list, where it is a different thing: a server-side filter with a picklist, not a pane.

- **Form state:** Use React's `useState` for simple forms, or `@tanstack/react-form` if complex multi-step forms needed (not required for MVP).
  - Form validation: Client-side via valibot schemas (same schemas generated from DB).
  - Do **not** sync unsaved form state to URL or localStorage (avoid complexity).

- **UI state:** Sidebar collapse, modal open/close: Local component state via `useState` or controlled via Radix/shadcn built-ins.

### Development Workflow

1. **Schema Design (if needed):** Update `packages/db/src/schema/` (e.g., `periods.ts`), regenerate Drizzle types. **Applying it to a running database:** `bun run db:push` **must not be used here, and the reason matters more than the fact.** It dies on a TTY-less shell at its confirmation prompt, and the statement it wants to confirm is _"You're about to add `gsc_unique` unique constraint to the table, which contains 326 items… Do you want to truncate `grade_subject_config` table?"_ — so answering the only way a non-interactive shell can is to accept a **truncate of 326 rows of curriculum data**. The index itself is not the problem: `grade_subject_config` and `gsc_unique` match the schema exactly (same seven columns, same nullability, same defaults, and the same four-column unique object present in `pg_constraint`), and none of the other 21 `unique()` declarations is reported. Drizzle's introspection simply does not register this one, so it plans to add a second copy of something that already exists. `--force` is worse, not better: it accepts the data loss. **Use `bun run db:generate` instead** — it is non-interactive, and it diffs the schema against the checked-in snapshot rather than the live catalog, which is the correct source when the live catalog is what is suspect. `bun run db:migrate` also exits 1 here with nothing on either stream, so the generated file has been applied with `psql -v ON_ERROR_STOP=1` inside one transaction, with the ledger row written by hand: `drizzle.__drizzle_migrations.hash` is the **sha256 of the migration file's bytes** (verified by recomputing an existing row's hash from its file), so a later `db:migrate` skips what has been applied rather than re-applying it. A migration that adds a constraint must tolerate an out-of-band application of the same constraint (`DROP CONSTRAINT IF EXISTS` first) or it fails on this database.
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
