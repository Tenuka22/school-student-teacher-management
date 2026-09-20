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

All feature components are isolated into separate folders under `apps/web/src/components/staff/`:

```
apps/web/src/components/staff/
├── teacher-management/       # Teacher CRUD, profiles, qualifications, employment verification
│   └── UI.md                 # Comprehensive UI design document
├── subject-assignment/       # Assign subjects to teachers per academic year
│   └── UI.md
├── class-assignment/         # Create classes, assign homeroom teachers
│   └── UI.md
├── period-management/        # Timetable: period config + class/teacher slot assignments
│   └── UI.md
└── historical-data/          # Cross-year historical views and reporting
    └── UI.md
```

Each feature is **completely self-contained** (no shared components between folders) to allow independent iteration and feature deployment. Shared patterns (table, form layouts) use shadcn base components only.

### Route Structure

Routes are file-based via TanStack Router, created under `apps/web/src/routes/_auth/dashboard/staff/`:

```
apps/web/src/routes/_auth/dashboard/staff/
├── teachers.tsx              # /dashboard/staff/teachers
├── subjects.tsx              # /dashboard/staff/subjects
├── classes.tsx               # /dashboard/staff/classes
├── periods.tsx               # /dashboard/staff/periods
└── history.tsx               # /dashboard/staff/history
```

The parent layout is in `apps/web/src/routes/_auth/route.tsx` (wraps all `/dashboard/*` routes with the sidebar-08 shell). **Do not** edit `routeTree.gen.ts` directly; it's auto-generated by the TanStack Router Vite plugin.

### API Router Composition

All staff-related oRPC procedures live under `packages/api/src/routers/staff/`. Existing procedures (teacher CRUD, academic years, subject assignments, qualifications) are already implemented. New procedures for period/timetable management will be added in a new subfolder:

```
packages/api/src/routers/staff/
├── create-staff.ts
├── update-staff.ts
├── delete-staff.ts
├── list-staff.ts
├── get-staff.ts
├── ... (existing procedures)
├── periods/                  # New: Period/timetable procedures
│   ├── create-period-config.ts
│   ├── list-period-config.ts
│   ├── assign-class-period.ts
│   ├── update-class-period.ts
│   ├── delete-class-period.ts
│   ├── list-class-timetable.ts
│   ├── list-teacher-timetable.ts
│   ├── list-unassigned-slots.ts
│   ├── check-conflict.ts
│   ├── export-timetables.ts
│   └── index.ts              # Compose all above
└── index.ts                  # Compose all routers
```

All procedures follow the existing pattern: oRPC handler + valibot schema validation + better-auth access control via `assignment: ["read", "create", "update", "delete"]` resource (reused from existing; no new permission resources needed).

### Database Schema Design

**Period Configuration:**

- `period_config` table: Stores school day periods (7:40 AM – 1:30 PM, 8 periods with tea/lunch breaks).
- Columns: `id`, `academicYearId`, `periodNumber` (1–8), `startTime` (HH:MM), `endTime` (HH:MM), timestamps.
- Unique constraint: `(academicYearId, periodNumber)` — one config per year+period.
- Immutable once created (no update procedure); if periods change, create new academic year.

**Class Period Assignment:**

- `class_period_assignment` table: Core timetable table mapping class + day + period → teacher + subject.
- Columns: `id`, `academicYearId`, `classId`, `dayOfWeek` (1–5, Mon–Fri), `periodNumber` (1–8), `subjectKey`, `staffId`, timestamps.
- Unique constraints (enforced at DB level):
  - `(academicYearId, classId, dayOfWeek, periodNumber)` — no duplicate class slots.
  - `(academicYearId, staffId, dayOfWeek, periodNumber)` — no teacher double-booking.
- Indexes: Composite indexes on (academicYearId, classId) and (academicYearId, staffId) for fast weekly-grid lookups.

**Valibot & Branding:**

- New schemas in `packages/db/src/schema/periods.ts`: `PeriodConfigId`, `ClassPeriodAssignmentId`, and their valibot counterparts.
- Branded types follow the existing pattern: `export type PeriodConfigId = Brand<string, "PeriodConfigId">` + `v.pipe(v.string(), brand<...>())`.
- Time validation schema: `HH:MM` ISO format regex + parsing.

**Historical Scope:**

- All assignment tables are `academicYearId`-scoped. Changing years isolates data automatically.
- No archiving needed; past years are queried with their `academicYearId`. The `academicYear` table already exists and tracks `isCurrent`.

See `packages/db/src/schema/PERIOD_SCHEMA_PLAN.md` (detailed planning doc) for full schema specifications.

### UI Component Pattern

Each feature folder contains a `UI.md` file documenting the complete interaction design, shadcn component choices, keyboard shortcuts, export options, and accessibility considerations. Implementation should closely follow these specs.

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

- Use `exceljs` library (to be added: `bun add exceljs`).
- Supports styling, columns, multiple sheets.
- Server-side (oRPC procedure) generates Excel in-memory, streams to client.
- Examples: All teachers' timetables in one file (one sheet per teacher), all classes' timetables, full subject assignment roster.

**PDF Exports (Single Record or Print-Friendly):**

- Use `@react-pdf/renderer` library (to be added: `bun add @react-pdf/renderer`).
- Component-based PDF generation; can reuse React components.
- Examples: One teacher's full profile + qualifications (PDF), one class's timetable (printable), conflict report (formatted PDF).
- Alternatively, for simple text-heavy reports, use the browser's native `print` stylesheet (via Tailwind's `@print:` utilities) and let user Cmd+P to PDF.

**Word/DOCX Exports (Optional Future):**

- Use `docx` library (programmatic) or `docxtemplater` (template-based).
- Not required for MVP; prioritize Excel + PDF.

All exports are real, working oRPC procedures (not stubs). Files are generated server-side and streamed to the browser for download.

### Permissions & Access Control

The existing `assignment: ["create", "read", "update", "delete"]` permission resource in `packages/auth/src/permissions.ts` covers all period/timetable operations. No new permission resource needed.

- **Admin role:** Full CRUD on all staff, assignments, classes, periods, timetables.
- **Teacher role:** Can read their own timetable; read assignment; read students in assigned classes (via `student: ["read"]`).
- **User role:** Limited (by design; typically not used for staff features).

Enforce access control at the API layer (oRPC procedures) using better-auth's `ac` (access control) helper and the session context.

### Keyboard Shortcuts (Common Across All Features)

- **Cmd+K / Ctrl+K:** Open command palette / search box (global across admin interface).
- **Cmd+N / Ctrl+N:** Create new entity (teacher, class, assignment, etc.).
- **Cmd+E / Ctrl+E:** Open export menu.
- **Cmd+Shift+C / Ctrl+Shift+C:** Run conflict check (period management only).
- **Esc:** Close open dialog, sheet, or menu.
- **Tab / Shift+Tab:** Navigate form fields, table rows.
- **Enter:** Submit form, open selected row detail, trigger primary action.
- **Delete / Backspace:** Delete selected rows (with confirmation).
- **Arrow Keys:** Navigate grid cells (period timetable) or timeline items (history view).

Documented per-feature in each `UI.md` file.

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

- **URL state:** Use TanStack Router for persistence:
  - Academic year: `?year=2027`
  - Filters: `?status=active&grade=6`
  - Search: `?search=john`
  - Comparison (history): `?compare=2026`
  - View mode (table/grid): `#table` or localStorage (user preference).

- **Form state:** Use React's `useState` for simple forms, or `@tanstack/react-form` if complex multi-step forms needed (not required for MVP).
  - Form validation: Client-side via valibot schemas (same schemas generated from DB).
  - Do **not** sync unsaved form state to URL or localStorage (avoid complexity).

- **UI state:** Sidebar collapse, modal open/close: Local component state via `useState` or controlled via Radix/shadcn built-ins.

### Development Workflow

1. **Schema Design (if needed):** Update `packages/db/src/schema/` (e.g., `periods.ts`), regenerate Drizzle types.
2. **API Procedures:** Implement in `packages/api/src/routers/staff/` folder.
3. **Frontend Components:** Build in feature folder (`apps/web/src/components/staff/{feature}/`); export from `index.ts`.
4. **Routes:** Create route file in `apps/web/src/routes/_auth/dashboard/staff/{feature}.tsx`, connect to component.
5. **Testing:** Unit tests for complex logic; smoke tests for mutation flows (use the actual dev server running on port 3001).
6. **Linting:** Run `bun x ultracite fix` on all new files before committing.
7. **Build:** Run `bun run build` to ensure no TypeScript errors. Dev server must continue running; **never stop/restart the port 3001 dev server**.

### Planning Documentation

- **`packages/db/src/schema/PERIOD_SCHEMA_PLAN.md`:** Temporary detailed schema design (can be deleted post-implementation or kept as a design record).
- **`apps/web/src/components/staff/{feature}/UI.md`:** Per-feature UI/UX specification (keep as durable reference; informs all future maintenance).
- **This section (AGENTS.md):** High-level architecture reference for future engineers.

### Implementation Notes (When Ready)

- **Do not start implementation until planning is approved.** This is the planning phase only.
- Coordinate via `hub` messaging if multiple engineers work on the same feature folder (avoid edit conflicts).
- Each feature folder is independent; can be built in parallel.
- Test exports thoroughly (Excel formulas, PDF page breaks, etc.) before claiming done.
- Ensure all oRPC procedures return proper error types (don't swallow errors; surface them to the client).
- Use the existing staff module routers as patterns (see `packages/api/src/routers/staff/create-staff.ts`, etc.).
