# Period Management (Timetable) UI Design

## Overview

The Period Management feature allows administrators to configure the school day schedule (8 periods: 7:40 AM – 1:30 PM) and assign subjects and teachers to class period slots.

## Page Layout

### Main Container

- **Header**: Title "Period Management" + subtitle "Configure the school day schedule and manage class timetables"
- **Toolbar**:
  - Academic Year selector (dropdown)
  - Class selector (dropdown of all classes in year)
  - View toggle: Class Timetable / Teacher Timetable
- **Main Content**:
  - **Period Configuration Section** (collapsible): Shows 8 periods with start/end times
  - **Timetable Grid**: 5 columns (Mon–Fri) × 8 rows (periods 1–8)
  - Each cell shows assigned subject + teacher name, or "Assign" button
- **Sheets**: Create/Edit period assignment form
- **Dialogs**: Delete confirmation

### Responsive Design

- Desktop-first; grid is horizontal-scrollable on smaller screens
- Period config remains visible on left (or collapses to tabs)

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Card` | Sections (config, timetable) | Visual separation of concerns |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Timetable grid | 5-day × 8-period matrix |
| `Button` | Assign, Edit, Delete, Export | Action triggers |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Year/class dropdowns | Filtering controls |
| `Badge` | Status labels | Visual categorization |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` | Cell context menu | Edit/Delete assignment actions |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Period assignment form | Preserve grid context |
| `AlertDialog` | Delete confirmation | High-consequence action protection |
| `Field`, `FieldLabel`, `FieldError` | Form controls | Consistent validation display |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Empty state | No classes/periods message |
| `Skeleton` | Loading placeholders | Smooth perceived loading |
| `toast` (sonner) | Notifications | Success/error feedback |
| `IconPlus`, `IconDotsVertical`, `IconTrash`, `IconFileExport` | Action icons | Visual affordance |
| `Collapsible` (if needed) | Period config collapse | Space optimization |

## Data Structure

### Period Configuration

Displayed at top of page (collapsible section):

```
Period | Start Time | End Time
-------|-----------|----------
1      | 7:40 AM   | 8:20 AM
2      | 8:20 AM   | 9:00 AM
(break: 9:00–9:15)
3      | 9:15 AM   | 9:55 AM
4      | 9:55 AM   | 10:35 AM
5      | 10:35 AM  | 11:15 AM
(break: 11:15–11:45)
6      | 11:45 AM  | 12:25 PM
7      | 12:25 PM  | 1:05 PM
8      | 1:05 PM   | 1:30 PM
```

Admin can edit start/end times (future feature); initially hardcoded or seeded.

### Timetable Grid

**Row Headers**: Period 1–8 (with time ranges) **Column Headers**: Monday, Tuesday, Wednesday, Thursday, Friday

Each cell contains:

- If assigned: Subject key + Teacher name (clickable)
- If unassigned: "Assign" button

## User Interaction Flows

### View Class Timetable

1. User selects academic year from dropdown
2. User selects a class from dropdown
3. Timetable grid loads, showing current assignments for that class
4. If no assignments, grid shows "Assign" buttons in every slot

### Assign Subject + Teacher to Slot

1. User clicks "Assign" button in a specific day+period cell
2. Sheet slides in with form:
   - Day of Week (display-only, e.g., "Monday")
   - Period Number (display-only, e.g., "Period 3")
   - Subject* (dropdown of all known subjects)
   - Teacher* (searchable dropdown of all staff)
3. Form validates required fields
4. Submit → creates assignment (after conflict check)
5. Sheet closes, grid re-renders with new assignment
6. Toast: "Assignment created"

### Edit Period Assignment

1. User clicks on an assigned cell (or context menu "Edit")
2. Sheet slides in with form (same as above, pre-filled)
3. Submit → update mutation
4. Grid re-renders
5. Toast: "Assignment updated"

### Delete Period Assignment

1. User right-clicks cell or clicks context menu "Delete"
2. AlertDialog: "Unassign [Subject] from [Day] [Period]?"
3. Confirm → delete mutation
4. Grid re-renders, cell becomes "Assign" button again
5. Toast: "Assignment removed"

### Conflict Detection

1. When assigning teacher + subject:
   - System checks: Is this teacher already assigned elsewhere in the same period?
   - Is this class already assigned another subject in the same period?
2. If conflict detected: Form shows error banner with conflict details
3. User cannot submit if unresolved conflict
4. Example error: "Teacher [Name] is already teaching Period 3 on Monday in Class 8-B"

### View Teacher Timetable (Alt View)

1. User toggles "View: Teacher Timetable" in toolbar
2. Class selector changes to "Teacher selector"
3. Grid shows selected teacher's complete weekly schedule
4. Cells show: Subject + Class (e.g., "ENGLISH - 10-A")
5. Same assign/edit/delete interactions as class view

### Export Timetables

1. User clicks "Export" button
2. For single class/teacher: PDF export
3. For bulk export: Excel with one sheet per class/teacher
4. Toast: "Exporting to PDF..."
5. File downloads when ready

## Keyboard Shortcuts

| Shortcut       | Action                               |
| -------------- | ------------------------------------ |
| `Cmd/Ctrl + K` | Open command palette                 |
| `A`            | Assign slot (if one slot focused)    |
| `E`            | Edit assignment (if cell selected)   |
| `D`            | Delete assignment (if cell selected) |
| `P`            | Toggle Period config visibility      |
| `T`            | Toggle Teacher/Class view            |

## Empty States

**No Classes**: Shows "No classes available. Create classes first in the Classes section."

**No Periods Configured**: Shows "Period configuration not yet set up. Contact administrator."

## Loading States

- **Initial Load**: Grid skeletons
- **Class Selection Change**: Brief loading overlay
- **Conflict Check**: Spinner during validation

## Error States

- **Validation Error**: Inline form field errors
- **Conflict Error**: Red banner in sheet: "⚠ Conflict: [Details]"
- **Mutation Error**: Toast with message
- **Fetch Error**: Error card above grid

## Form Validation

**Period Assignment Form**:

- Subject: Required, must be from known list
- Teacher: Required, must be active staff member
- No duplicate assignments in same slot (enforced by DB constraint)

Validation on blur and submit.

## Business Rules & Constraints

1. **Fixed 8 Periods**: 7:40 AM–1:30 PM, no gaps except designated breaks
2. **No Teacher Double-Booking**: A teacher cannot be in two places during same period on same day (enforced DB constraint + UI warning)
3. **No Class Subject Duplication**: A class cannot have two different subjects at the same period (enforced by DB constraint)
4. **Unique Slot Assignment**: One (subject, teacher) pair per (class, day, period)
5. **Year-Scoped**: All assignments belong to an academic year

## Performance Considerations

- Load timetable on-demand per class/teacher selection
- Cache period config (rarely changes)
- Optimistic updates for assign/edit/delete
- Virtual scroll if 100+ classes in dropdown
- Query caching (30min stale time for config, 5min for assignments)

## Accessibility

- Grid cells are keyboard-navigable (Arrow keys, Tab)
- Enter/Space on "Assign" button opens sheet
- Form labels use `<label>` with `htmlFor`
- Error messages linked via aria-invalid
- WCAG AA color contrast on all badges and cells

## Responsive Behavior

**Desktop** (≥1024px): Full grid visible, period config on left or collapsible tab.

**Tablet** (768–1023px): Grid scrolls horizontally; period config collapses to accordion.

**Mobile** (<768px): Not primary use case (admin tool). Grid becomes scrollable cards if accessed.

## Visual Design

- **Assigned Cells**: Light blue background, border, clickable shadow on hover
- **Unassigned Cells**: Light gray background, "Assign" button
- **Hover**: Subtle drop shadow, edit/delete icons appear
- **Selected/Active**: Darker blue border, slight scale
- **Conflict Cell**: Red/orange background, warning icon

## Future Enhancements

- Bulk assign periods (e.g., "Use last year's schedule as template")
- Teacher workload heatmap (color intensity = workload)
- Substitute teacher scheduling
- Period swap/exchange requests
- Mobile timetable view for teachers/students
- Calendar integration for holidays/closures
- Clash warnings for resource scheduling (lab, sports, music room)
