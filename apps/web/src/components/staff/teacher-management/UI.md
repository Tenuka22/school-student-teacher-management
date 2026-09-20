# Teacher Management UI Design

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

**No Teachers**: Shows `Empty` component with title "No teachers yet", description "Create your first teacher to get started", and a "Create Teacher" button.

## Loading States

**Table Loading**: Shows 5 skeleton rows while `listStaff.isLoading` is true. **Search Loading**: Search happens instantly on local data; no additional loading state needed.

## Error States

**Validation Errors**: Display inline in `FieldError` below each field. Field borders turn red (via `data-invalid` attribute).

**Mutation Errors**: Toast shows error message from server response or default message.

**List Fetch Error**: AlertDialog or inline error card displayed prominently.

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
