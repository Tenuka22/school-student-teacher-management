# Subject Assignment UI Design

## Overview

The Subject Assignment feature allows administrators to assign subjects to teachers for each academic year and grade level.

## Page Layout

### Main Container

- **Header**: Title "Subject Assignments" + subtitle "Assign subjects to teachers per academic year and grade"
- **Toolbar**:
  - Academic Year selector (dropdown showing all years, default to current)
  - Grade Level filter (multi-select or single select)
  - Search input (by teacher name or subject)
  - Export button (Excel)
  - Create Assignment button
- **Main Content**: Subject assignments table
- **Sheets**: Create/Edit assignment forms
- **Dialogs**: Delete confirmation

### Responsive Design

- Desktop-first; sidebar collapses below `md` (parent Sidebar handles)
- Full-width content area with consistent padding

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Card` | Table wrapper | Clean visual containment |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Assignments grid | Multi-column display of assignments; sortable |
| `Button` | Create, Export, actions | Primary/secondary UI actions |
| `Input` | Search field | Fast filtering by teacher/subject |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Academic year & grade dropdowns | Filtering controls |
| `Checkbox` | Row selection | Bulk delete/export |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` | Row context menu | Edit, Delete actions |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Create/Edit forms | Preserve list context |
| `AlertDialog` | Delete confirmation | High-consequence action protection |
| `Field`, `FieldLabel`, `FieldError`, `FieldDescription` | Form layout | Consistent form field styling |
| `Badge` | Status labels (e.g., grade level display) | Visual categorization |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Empty state | Friendly onboarding |
| `Skeleton` | Loading rows | Smooth perceived loading |
| `toast` (sonner) | Notifications | Success/error feedback |
| `IconPlus`, `IconSearch`, `IconFileExport`, `IconDotsVertical`, `IconTrash` | Action icons | Visual affordance |

## Table Columns

| Column | Sortable | Filterable | Purpose |
| --- | --- | --- | --- |
| Checkbox | No | No | Row selection |
| Teacher Name | Yes | Yes (search) | Full name of assigned teacher |
| Subject | Yes | Yes (search) | Subject key (e.g., ENGLISH, MATHEMATICS) |
| Grade | Yes | Yes (dropdown) | Grade level (1–13) |
| Class | No | No | Assigned class (if specific) or "All" |
| Status | Yes | No | Assignment status (Active, Pending, etc.) |
| Year | Yes | Yes | Academic year |
| Actions | No | No | Edit, Delete |

**Search**: Across teacher name and subject key. **Filters**: Academic year (required), Grade level (optional), Status (optional).

## User Interaction Flows

### Create Subject Assignment

1. User clicks "Create Assignment" button
2. Sheet slides in with form:
   - Academic Year (read-only, auto-filled from filter)
   - Teacher (searchable dropdown)
   - Subject (dropdown of all known subjects)
   - Grade Level (dropdown 1–13)
   - Class (optional dropdown if assigning to specific class)
3. Form validates required fields
4. Submit → creates assignment + optimistic update
5. Sheet closes, list refetches with new row
6. Toast: "Assignment created"

### Edit Assignment

1. User clicks row or "Edit" from context menu
2. Sheet slides in with pre-filled form
3. Same validation as Create (may be read-only for some fields like year)
4. Submit → update mutation
5. Toast: "Assignment updated"

### Delete Assignment

1. User clicks "Delete" context menu
2. AlertDialog: "Remove this subject assignment?"
3. Confirm → delete mutation
4. List refetches, toast confirms

### Filter by Year/Grade

1. User selects academic year from dropdown
2. List filters/refetches to show only that year's assignments
3. Optional: Select grade level to further filter
4. Search still works within filtered results

### Bulk Operations

1. User selects multiple rows via checkbox
2. Toolbar shows: "N assignments selected | [Bulk Delete] [Bulk Export]"
3. Bulk Delete → confirmation dialog, deletes all selected
4. Bulk Export → Excel file with selected assignments

### Export Assignments

1. User clicks "Export" button
2. Toast: "Export as EXCEL coming soon"
3. Future: Generates `.xlsx` with columns: Teacher, Subject, Grade, Class, Year, AssignmentDate

## Keyboard Shortcuts

| Shortcut                      | Action                |
| ----------------------------- | --------------------- |
| `Cmd/Ctrl + K`                | Open command palette  |
| `/`                           | Focus search          |
| `A`                           | Create new assignment |
| `E`                           | Export                |
| `Backspace` (on selected row) | Delete assignment     |

## Empty States

**No Assignments for Year**: Shows "No assignments yet for [Year]", suggests "Create your first assignment".

**No Teachers**: Shows "No teachers available. Create teachers first in the Teachers section."

## Loading States

- **Initial Load**: 5–10 skeleton rows
- **Filter Change**: Shows loading state while refetching
- **Search**: Instant on local data

## Error States

- **Validation Error**: Inline `FieldError` per field (e.g., "Teacher is required")
- **Mutation Error**: Toast with server message
- **Fetch Error**: Card-based error message above table

## Form Validation

- **Teacher**: Required, must exist in system
- **Subject**: Required, must be from known subjects list
- **Grade Level**: Required, 1–13
- **Class**: Optional
- **Academic Year**: Required (auto-filled)

Validation on blur and submit.

## Relationship Enforcement

- A teacher cannot be assigned the same subject at the same grade in the same year twice
- A class can have at most one teacher per subject per year (domain rule)
- Delete removes assignment; does not cascade to period assignments

## Performance Considerations

- Virtual scroll for lists >200 items
- Debounced search (300ms)
- Optimistic updates on mutations
- Year/grade filters reduce data volume
- Query caching (default 5min stale)

## Accessibility

- Dropdowns have descriptive labels + associated `<label>` tags
- Form fields use aria-invalid + aria-describedby
- Error messages are visible and linked to fields
- Keyboard: Tab through table, Enter to open row actions, Escape to close sheets
- Color coding on badges meets WCAG AA

## Responsive Behavior

**Desktop**: Full 3-column table, all toolbars visible.

**Tablet**: Toolbar compresses; table may scroll horizontally.

**Mobile** (<768px): Not primary use case; sidebar overlay (parent handles). Table becomes card-list if accessed.

## Future Enhancements

- Bulk import assignments from CSV
- Subject specialization levels (e.g., "Primary", "Specialist")
- Teacher workload visualization (how many subjects per teacher)
- Conflict warnings (e.g., teacher overloaded)
- Historical view (past year assignments)
- Approval workflow for new assignments
