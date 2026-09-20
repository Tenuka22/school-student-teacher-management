# Class Assignment UI Design

## Overview

The Class Assignment feature allows administrators to create classes, assign homeroom teachers, and manage class structure within the academic year.

## Page Layout

### Main Container

- **Header**: Title "Classes" + subtitle "Create classes and assign teachers for the current academic year"
- **Toolbar**:
  - Search input (by class name or teacher)
  - Export button (Excel)
  - Create Class button
- **Main Content**: Classes list table
- **Sheets**: Create/Edit class forms, Assign teacher form
- **Dialogs**: Delete confirmation

### Responsive Design

- Desktop-first; sidebar collapses below `md` (parent Sidebar handles)
- Full-width content area with consistent padding

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Card` | Table wrapper | Clean visual containment |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Classes grid | Multi-column layout for class data |
| `Button` | Create, Export, actions | Primary/secondary buttons |
| `Input` | Search field | Fast filtering by class name or teacher |
| `Checkbox` | Row selection | Bulk operations |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` | Context menu | Edit, Assign Teacher, Delete |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Create/Edit class and assign teacher forms | Preserve list context during editing |
| `AlertDialog`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | Delete confirmation | High-consequence action protection |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Grade and medium dropdowns | Form selection controls |
| `Field`, `FieldLabel`, `FieldError`, `FieldDescription` | Form layout | Consistent form field styling |
| `Badge` | Status badges (Active, No Teacher) | Visual status indicators |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Empty state | Friendly onboarding |
| `Skeleton` | Loading rows | Smooth loading perception |
| `toast` (sonner) | Notifications | Success/error feedback |
| `IconPlus`, `IconSearch`, `IconFileExport`, `IconDotsVertical`, `IconTrash` | Action icons | Visual affordance |

## Table Columns

| Column | Sortable | Filterable | Purpose |
| --- | --- | --- | --- |
| Checkbox | No | No | Row selection |
| Class Name | Yes | Yes (search) | Unique class identifier (e.g., 10-A) |
| Grade | Yes | No | Grade level (1–13) |
| Class Teacher | Yes | Yes (search) | Homeroom teacher name or "Unassigned" |
| Status | Yes | No | Badge showing "Active" or "No Teacher" |
| Actions | No | No | Edit, Assign Teacher, Delete |

**Search**: Case-insensitive across class name and teacher name.

## User Interaction Flows

### Create Class

1. User clicks "Create Class" button
2. Sheet slides in with form:
   - Grade Level* (dropdown 1–13)
   - Class Name* (e.g., "10-A", "Grade 9 Science")
   - Medium of Instruction (Sinhala / Tamil / English)
3. Form validates required fields
4. Submit → creates class + optimistic update
5. Sheet closes, list refetches
6. Toast: "Class created successfully"

### Edit Class

1. User clicks row or "Edit" from context menu
2. Sheet slides in with pre-filled form
3. Grade Level: read-only or not shown (immutable)
4. Class Name: editable
5. Medium: editable
6. Submit → update mutation
7. Toast: "Class updated successfully"

### Assign Class Teacher

1. User clicks row or "Assign Teacher" from context menu
2. Sheet slides in with teacher assignment form:
   - Class Teacher (searchable dropdown of all staff)
   - Option to unassign (empty value)
3. Submit → calls `assignClassTeacher` mutation
4. Sheet closes, list refetches with updated teacher name
5. Toast: "Teacher assigned successfully"
6. Status badge changes from "No Teacher" to "Active"

### Delete Class

1. User clicks "Delete" from context menu
2. AlertDialog: "Are you sure you want to delete this class? This action cannot be undone."
3. Confirm → delete mutation
4. List refetches
5. Toast: "Class deleted successfully"

### Filter by Search

1. User types in search input
2. List instantly filters to show matching classes (name or teacher)
3. Search is case-insensitive

### Bulk Operations

1. User selects multiple rows via checkbox
2. Toolbar appears: "N items selected | [Bulk Delete] [Bulk Export]"
3. Bulk Delete → confirmation, deletes all selected classes
4. Bulk Export → Excel file with all selected classes

### Export Classes

1. User clicks "Export" button
2. Toast: "Export as EXCEL coming soon"
3. Future: Generates `.xlsx` with columns: Class Name, Grade, Teacher, Status, Academic Year, Created Date

## Keyboard Shortcuts

| Shortcut       | Action               |
| -------------- | -------------------- |
| `Cmd/Ctrl + K` | Open command palette |
| `/`            | Focus search input   |
| `C`            | Create new class     |
| `E`            | Export classes       |

## Empty States

**No Classes**: Shows "No classes yet", description "Create your first class to get started", with prominent "Create Class" button.

## Loading States

- **Initial Load**: 5–10 skeleton rows
- **Search**: Instant (local data filtering)
- **Mutation Pending**: Button shows loading spinner + disabled state

## Error States

- **Validation Error**: Inline `FieldError` under field (e.g., "Grade Level is required")
- **Mutation Error**: Toast with server message
- **Fetch Error**: Error card above table

## Form Validation

**Create Form**:

- Grade Level: Required, must be 1–13
- Class Name: Required, min 2 chars, unique within grade+year

**Edit Form**:

- Class Name: Required, min 2 chars, unique (excluding self)

**Assign Teacher Form**:

- Teacher: Optional (can unassign)

Validation on blur and submit.

## Business Rules

- A class must have exactly one homeroom teacher per academic year (or none, marked "No Teacher")
- Class name must be unique within a grade level within the same academic year
- Deleting a class cascades to related period assignments (if they exist)
- Sub-homeroom teachers can be assigned separately (future enhancement)

## Performance Considerations

- Virtual scroll for lists >150 items
- Debounced search (300ms)
- Optimistic updates on mutations
- Query caching (default 5min stale)
- Lazy-load teacher list in dropdown only when sheet opens

## Accessibility

- All buttons have clear labels
- Form labels use `<label>` with `htmlFor`
- Error messages linked via aria-invalid + aria-describedby
- Keyboard: Tab through table, Enter/Space to select row, Escape to close sheets
- WCAG AA color contrast on all badges

## Responsive Behavior

**Desktop**: Full table layout, all toolbars visible.

**Tablet**: Toolbar compresses; table may scroll horizontally; sheets work normally.

**Mobile** (<768px): Not primary use case (admin tool). Sidebar overlay (parent). Table may become card-based list if needed.

## Future Enhancements

- Bulk import classes from CSV
- Class capacity management
- Multi-section classes (A, B, C variants)
- Sub-homeroom teacher assignment
- Class rotation scheduling
- Student count tracking
- Parent communication features
