# Teacher Management

> **This file began as a planning document, and parts of it no longer describe the product.** The divergences below are deliberate. **Everything below the "Two more behaviours worth knowing" list is history, not specification** — and the most misleading parts of it are the "Empty States", "Loading States", "Error States", "Bulk Actions" and "Keyboard Shortcuts" sections, all of which describe screens that have since been rebuilt. Read the banner; do not implement from the rest.

## What actually shipped

| Planned | Shipped | Why |
| --- | --- | --- |
| `Sheet` create/edit forms | `Dialog` | Create and edit are short forms; a centred modal keeps them predictable. |
| "Export as EXCEL coming soon" | Export is implemented | `staff.exports.teachersExcel` produces a real XLSX. It is scoped to the selected year by default, so the file and the on-screen roster describe the same people. A second export, `staff.exports.teacherProfilePdf`, sits at the foot of the profile dialog. |
| Address field on the teacher form | Not collected | Out of scope for the staff record; the audit found no screen that reads it. |
| Cmd+K / Cmd+N / Cmd+E shortcuts | None | No shortcut layer is implemented. |
| NIC / Position / Status as list columns | Name, contact, employment, account | What a teacher list is for. The account column (`Linked` / `No account` / `Banned` / `Unverified email`) is hidden below `md`; everything else scrolls horizontally rather than reflowing. |
| Search strip below the toolbar | Search in the toolbar, above the table | The old strip was inside the "the roster has rows" branch, so the search sat under the table and the page's two primary controls vanished on every refetch. |
| CSV import writes as it reads | **Preview, then write** | See "CSV import" below. |
| `AlertDialog` for the conflict resolver | `Dialog` | An `AlertDialog` is one question with one answer. The resolver is a list of per-row decisions with a diff for each. |
| Nested `Card` per qualification | One `Card`, a bordered row per qualification | A card inside a card is a second ground, a second ring and a second set of padding wrapped around each row. |
| "Position" as a profile field | "Account role" and "Positions", stated as different things | A staff record's **role** is what the sign-in may do (`teacher`, `admin`, `principal`, `vicePrincipal`) and is set by the linked account. A **position** is this year's appointment and is scoped to one academic year. Collapsing them tells a reader that a teacher is a deputy principal for 2026 and every year after. |
| `staff.category` shown for a record with none | `—` | The old mapping fell through to "Teacher", asserting a staff category — the field that decides whether a person appears on a teaching roster — on a record that has never been given one. |
| `TeachersList` — a hand-rolled `<table>` with a client-side search | `TeachersDataTable`, on the shared data-table kit | The list is now the server's: `staff.listTeachers` searches, orders and pages in SQL, and `?q=&sort=&dir=&page=&size=` is the list's state, so a refresh, a shared link and Back all arrive populated. The old component is deleted. See "The register is a server-side list table" below. |

### The register is a server-side list table

`teachers.tsx` is the second surface on the `ui-patterns/data-table` kit, and it is the pattern the remaining lists in the app are being moved onto. The account list (`admin/users-*`) is the reference; this one is deliberately the same shape with different content.

- **`staff.listTeachers` is a second procedure, not a `limit` on `listStaff`.** `listStaff` has twelve callers — the class-assignment teacher picker, the timetable teacher picker, the sidebar's count, the class tab's teacher column — and every one of them wants _all_ of the establishment. A default limit there would cap the pickers at fifty with no way to reach the fifty-first, which is data loss wearing a performance feature. Both read through one `buildStaffScope` and one `selectStaff`, so the scope rule and the join exist once.
- **The search moved into SQL.** It was a post-filter over the returned rows, which is correct for a list returned whole and wrong for one that is paged: a post-filter over twenty-five rows is a statement about the twenty-five, and the total beside it was a count of the wrong thing. `staffSearchPredicate` keeps the old meaning — every token must match one of name, email, phone, NIC or service number — and applies it before the page is taken.
- **The order is the server's, and `?sort=createdAt` is not the default.** A staff register is read by name; the accounts list is read by "who is new". `phone` is a column and not sortable, because a phone number has no meaningful order in a register read by name.
- **The row the table hands back is `listTeachers`' shape, not the `staff` row.** The list sends `createdAt`/`updatedAt` as ISO strings, because they crossed a wire, and the dialogs were written against `typeof staff.$inferSelect`, which has them as `Date`. The bridge is one named function (`toStaffRecord`) in the route, not a cast at four call sites.
- **`listStaff` is still read on this page, for the CSV import only.** The importer has to decide create-or-update for every row in a file, which is a question about the whole establishment rather than about a page of it. Both reads are in the route's `loader`, issued together.

### Nothing dangles

Every async surface in this folder now resolves to content, a taught empty state, or a named error with a recovery. The four that were not:

- **A roster that has not answered yet** used to print "No teachers yet". `listStaff` is `enabled` only once the academic year has resolved, so for a moment after a year switch `data` is `undefined` while `isLoading` is `false`, and the page confidently claimed the College had no teachers. It now draws the loading shape.
- **Qualifications, positions and subject assignments** each read `data ?? []`, so a failed read and a genuinely empty list were the same `[]` and each said "No qualifications recorded" / "No positions assigned" / "No subjects configured" — a claim about the record, printed by a request that had learned nothing. Each is now a `QueryErrorPanel` naming what could not be read, with a retry that re-requests.
- **`PortTeachersDialog`** had one branch for "no data", so a request in flight and a request that failed both printed "No previous academic year". It now has a loading shape and a named failure.
- **The write-then-refetch ordering** in `useTeachersPage` meant a _failed refetch_ after a successful create was reported to the reader as "Failed to create teacher", with a real teacher on the server and an issued password nobody was shown. The write now decides: close, then refetch in the background.

### CSV import

The highest-risk surface in the folder, and the one that changed most.

- **Nothing is written until it is confirmed.** The file is parsed and every row classified first — will be created, will be staged for review, already matches, cannot be imported — and the preview says so before a single record is touched. It used to be `Promise.all` over `rows.map(processRow)`, where `processRow` called `onCreate` before the next row had been looked at.
- **Per-row problems, with the line number and the reason.** A row that fails validation is listed as `Line 41 — Nimal Perera` / `NIC: Enter a valid Sri Lankan NIC…`, and is not written.
- **Fatal and row-level are different states.** A file that is not a teacher import, has a header and no data, or cannot be read gets the error panel and **no confirm button at all** — there is nothing that could be confirmed.
- **A blank cell means "leave the field alone."** It cannot mean "clear it": `updateStaff` cannot null `gender` at all, and an absent key means "do not change" everywhere else. The preview states the rule, so the diff and the write cannot disagree.
- **A row carrying an `id` that is not on this year's roster** is a warning, not an error. It still creates, because that is what the importer has always done, but the preview says in words what will happen before it happens.
- **A partial import never reports success.** `toast.success` is only ever reached by a run with zero failures; anything else is an error toast naming both numbers, over a table of the rows that were not written and why. The failed rows can be downloaded as a CSV with the reason beside each one.
- **Applying a staged conflict writes only the fields the diff shows**, so an unrelated edit made on the record since the file was read is not silently rolled back.
- The blank template is still genuinely blank, with one example row.

Two more behaviours worth knowing:

- **Office staff** have no self-service sign-up. Their accounts are issued by an administrator, who creates the staff record and hands over the login. The profile dialog says so where the account would otherwise be empty.
- **Required is a machine-readable fact, not an asterisk.** Name and NIC carry `required` / `aria-required` and a screen-reader-only "(required)"; the form is `noValidate` so the browser's own bubble does not argue with the valibot messages. **Email is not required** and no longer claims to be — `staffColumnRefinements` types it `optionalNullable`, so the old asterisk was promising a constraint the database does not have.

## Overview

The Teacher Management feature allows administrators to create, edit, view, and manage teacher profiles, including qualifications and employment verification.

## Page Layout

### Main Container

- **Header**: Title "Teachers" + subtitle "Create, edit, and manage teacher profiles"
- **Toolbar**: Search input, Export button (Excel), Create Teacher button
- **Main Content**: Teachers list table
- **Sheets**: Create/Edit forms slide in from the right
- **Dialogs**: Delete confirmation, View profile modal

### Responsive Design

- Desktop-first; sidebar collapses below `md` breakpoint (handled by parent Sidebar component)
- Full-width content area with consistent padding

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Card` | Wraps the table for visual containment | Clean separation of content sections |
| `Table` + `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Main data grid | shadcn's composition pattern for data-heavy views; sortable/filterable |
| `Button` | Create, Export, Actions | Primary and secondary actions throughout |
| `Input` | Search field | Fast filtering without page reload |
| `Checkbox` | Row selection for bulk actions | Multi-select UX on tables |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` | Context menu on rows | Quick actions (Edit, View, Delete) without dialogs |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Create/Edit forms | Preserves list context while editing |
| `AlertDialog`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | Delete confirmation | High-consequence action protection |
| `Field`, `FieldLabel`, `FieldError`, `FieldDescription` | Form field layout | All form inputs use these for consistent validation/error display |
| `Label` | Form labels | Associated with inputs via `htmlFor` |
| `Badge` | Status indicators (e.g., "Active", "Pending Verification") | Color-coded visual status |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Empty state | Friendly onboarding when no teachers exist |
| `Skeleton` | Loading placeholders | Smooth perceived loading during data fetch |
| `toast` (from sonner) | Success/error notifications | Non-intrusive feedback |
| `IconPlus`, `IconSearch`, `IconFileExport`, `IconDotsVertical`, `IconTrash` | Icon buttons | Visual affordance for actions |

## Table Columns

| Column | Sortable | Filterable | Purpose |
| --- | --- | --- | --- |
| Checkbox | No | No | Row selection |
| Name | Yes | Yes (via search) | Teacher full name |
| Email | Yes | Yes (via search) | Contact email |
| Phone | No | Yes (via search) | Contact phone |
| NIC | No | No | National ID (sensitive, display masked) |
| Position | Yes | Yes | Current position (e.g., Teacher, HOD) |
| Status | Yes | No | Qualification/Verification status (badge) |
| Actions | No | No | Edit, View, Delete dropdown |

**Search**: Case-insensitive full-text search across Name, Email, Phone, NIC.

## User Interaction Flows

### Create Teacher

1. User clicks "Create Teacher" button
2. Sheet slides in from right with form:
   - Personal Info: Name, Email, Phone, NIC, Gender, DOB, Address
   - Employment: Position, Appointment Date, Employment Status
3. Form validation on blur (Field component with aria-invalid)
4. User submits → optimistic update + toast
5. Sheet closes, list refetches

### Edit Teacher

1. User clicks row or "Edit" from context menu
2. Sheet slides in with pre-filled form
3. Same validation flow as Create
4. Submit → update mutation + refetch
5. Toast confirms update

### View Profile

1. User clicks "View" context menu item
2. Modal/dialog opens with full teacher details:
   - Personal Info (read-only)
   - Contact Info (read-only)
   - Employment History
   - Qualifications (embedded, clickable to expand)
   - Employment Verification (status)

### Delete Teacher

1. User clicks "Delete" context menu
2. AlertDialog confirms: "Are you sure? This action cannot be undone."
3. On confirm → delete mutation
4. List refetches, toast confirms deletion

### Export Teachers

1. User clicks "Export" button
2. Toast shows "Export as EXCEL coming soon"
3. Future: Generates `.xlsx` file with all teacher records
4. Columns: Name, Email, Phone, NIC, Position, Status, Appointment Date, etc.

## Keyboard Shortcuts

| Shortcut       | Action                                  |
| -------------- | --------------------------------------- |
| `Cmd/Ctrl + K` | Open command palette with quick actions |
| `/`            | Focus search input                      |
| `N`            | New teacher (if palette is open)        |
| `E`            | Export (if palette is open)             |

## Empty States

**No Teachers**: Shows `Empty` component with title "No teachers yet", description "Create the first teacher record to get started", and a "Create Teacher" button. Reachable only when `listStaff` succeeded and returned no rows — see Error States.

## Loading States

**Table Loading**: Shows 5 skeleton rows while `listStaff.isLoading` is true. **Search Loading**: Search happens instantly on local data; no additional loading state needed.

## Error States

**Validation Errors**: Display inline in `FieldError` below each field. Field borders turn red (via `data-invalid` attribute).

**Mutation Errors**: Toast shows error message from server response or default message.

**List Fetch Error**: `QueryErrorPanel` in place of the list — "The teacher roster could not be loaded", the server's message via `formatApiErrorMessage`, and a "Try again" button that calls `listQuery.refetch()`. The empty state above is _not_ shown on a failure: a failed request knows nothing about the roster, and "No teachers yet" is a claim about the College, so the two must never share a branch.

## Form Validation

- **Name**: Required, min 2 characters
- **Email**: Required, valid email format
- **Phone**: SL mobile format (regex: `^(?:\+94|0)7\d{8}$`)
- **NIC**: Valid format (old 9-digit+V or new 12-digit)
- **Position**: Required, selected from enum
- **Appointment Date**: Required, ISO date format
- **Employment Status**: Required, dropdown (Active, On Leave, Resigned, etc.)

Validation runs on blur and on submit.

## Bulk Actions

When 1+ rows selected:

- Toolbar appears above table: "N items selected | [Bulk Delete] [Bulk Export] [Clear]"
- Bulk Delete → AlertDialog confirmation
- Bulk Export → Excel file with selected teachers

## Performance Considerations

- Virtual scroll for lists >100 items (use shadcn's `Virtualized` table variant or external lib)
- Debounced search (300ms)
- Optimistic updates on mutations
- Query caching with TanStack Query (default 5min stale time)

## Accessibility

- All buttons have descriptive labels or aria-labels
- Form fields use associated labels
- Error messages linked via aria-invalid + aria-describedby
- Keyboard navigation through table rows (Tab, Shift+Tab)
- Dialogs are properly trapped (AlertDialog, Sheet)
- Color contrast meets WCAG AA

## Responsive Behavior

**Desktop** (≥1024px):

- Full 3-column table layout
- Toolbar buttons fully visible
- Context menu on the right

**Tablet** (768–1023px):

- Sidebar collapses to overlay (parent handles)
- Table remains readable; may scroll horizontally
- Toolbar buttons may compress/stack

**Mobile** (<768px):

- Not a primary use case (admin internal tool)
- Sidebar overlay navigation (parent handles)
- Table becomes a card-based list if needed, but not optimized for phone

## Future Enhancements

- Bulk import teachers from CSV
- Advanced filtering (by position, status, appointment date)
- Teacher performance dashboard
- Integration with qualifications module (embedded certificates)
- Email notifications for pending verifications
