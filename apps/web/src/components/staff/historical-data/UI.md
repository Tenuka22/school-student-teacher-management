# Historical Data UI Design

## Overview

The Historical Data feature allows administrators to view and export assignments, staff records, and timetables from past academic years for compliance, analysis, and historical reference.

## Page Layout

### Main Container

- **Header**: Title "Historical Data" + subtitle "View assignments, staff, and timetables from past academic years"
- **Information Banner**: Explains purpose and use cases
- **Main Content**:
  - Academic year selector card
  - Records browser card (appears when year is selected)
  - Each record type has a preview and export button
- **No Dialogs/Sheets**: This is read-only viewing; all actions are filtering and exporting

### Responsive Design

- Desktop-first; cards stack nicely on smaller screens
- Full-width content area

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | Main containers | Clean sections for year selector and records |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Academic year dropdown | Filter historical data by year |
| `Button` | Export buttons | Trigger Excel/PDF downloads |
| `Alert`, `AlertTitle`, `AlertDescription` | Information banners | Explain historical data purpose |
| `Badge` | Current year indicator | Mark year as "(Current)" |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | No years message | If no historical data exists |
| `Skeleton` | Loading placeholders | While fetching years list |
| `toast` (sonner) | Notifications | Export status feedback |
| `IconFileExport`, `IconAlertCircle` | Action/info icons | Visual affordance |

## Table/Grid Structures (Not Editable)

When a year is selected, display cards for each record type:

### 1. Staff Assignments Card

- **Columns (Read-Only Table)**:
  - Teacher Name
  - Subject Assigned
  - Grade Level
  - Class (if applicable)
  - Assignment Date
  - Status (Active, Historical, etc.)
- **Export**: Excel file with all selected year's assignments
- **Preview**: Show first 5 rows, "View All" expands (or pagination)

### 2. Class Timetables Card

- **Columns (Read-Only Table)**:
  - Class Name
  - Grade
  - Period Count
  - Last Modified
- **Export**: Excel file, one sheet per class, with full timetable matrix
- **Preview**: Expandable timetable grid (5-day × 8-period)

### 3. Teacher Timetables Card

- **Columns (Read-Only Table)**:
  - Teacher Name
  - Total Periods
  - Busiest Day
  - Last Modified
- **Export**: PDF files (one per teacher) or single Excel with multi-sheet
- **Preview**: Expandable timetable for selected teacher

### 4. Subject Assignments Card

- **Columns (Read-Only Table)**:
  - Subject
  - Grade
  - Teachers Assigned
  - Class Count
- **Export**: Excel with detailed breakdown
- **Preview**: List of all subject assignments in year

## User Interaction Flows

### Browse Historical Data

1. Page loads; years dropdown shows "Select a year to view history..."
2. User selects an academic year (e.g., "2025 (Academic Year)")
3. Four record cards appear below:
   - Staff Assignments
   - Class Timetables
   - Teacher Timetables
   - Subject Assignments
4. Each card shows a preview (first N rows, or compact summary)
5. User clicks "View All" or "Expand" to see full data (in a collapsible section or separate view)

### Export Records

1. User selects a year
2. User clicks "Export" button on desired record card
3. For multi-record exports (Staff, Subjects, Classes): Excel file
4. For single-entity exports (Teacher Timetables): PDF files
5. Toast shows: "Exporting Staff Assignments..."
6. File downloads when ready
7. Toast confirms: "Downloaded staff-assignments-[year].xlsx"

### Export Multiple Timetables (Bulk)

1. User clicks "Export" on "Class Timetables" card
2. System generates Excel with one sheet per class
3. Each sheet contains the 5-day × 8-period grid
4. File downloads as `class-timetables-[year].xlsx`

### Compare Years (Future)

1. User selects a year, then "Compare with..." button
2. Selects another year to compare
3. Side-by-side view highlights changes in assignments

## Keyboard Shortcuts

| Shortcut       | Action                        |
| -------------- | ----------------------------- |
| `Cmd/Ctrl + K` | Open command palette          |
| `1–5`          | Quick-jump to record card 1–5 |
| `E`            | Export current card           |

## Empty States

**No Years Available**: Shows "No historical data available" message.

**Year Selected But No Assignments**: Shows "No assignments found for [Year]" in each card.

## Loading States

- **Years Dropdown**: Skeletons while loading
- **Record Cards**: Skeleton rows while loading assignment data
- **Export**: Toast shows "Exporting..." with spinner

## Error States

- **Fetch Error**: Card shows error message "Failed to load [Record Type]"
- **Export Error**: Toast shows error message, suggests retry

## Form Validation

N/A – this is read-only viewing; no forms to validate.

## Data Constraints

- **Year Scope**: All displayed data is filtered to selected academic year only
- **Read-Only**: No edits allowed from this view
- **Historical Integrity**: Data is immutable (not current year data)
- **Cascade**: Deletes/updates to current data do not affect historical archives

## Performance Considerations

- Lazy-load record data only when year is selected
- Paginate large tables (e.g., show first 10 staff, "View All" loads rest)
- Cache years list (1 hour stale time)
- Export is async; file generated on server and streamed
- Virtual scroll for large tables (100+ rows)

## Accessibility

- Year dropdown has descriptive label
- Each record card has a clear title and description
- Export buttons are easy to locate and use
- Read-only tables are keyboard-navigable (Tab, Arrow keys)
- WCAG AA color contrast on all elements
- Links and buttons have descriptive labels

## Responsive Behavior

**Desktop** (≥1024px): Cards side-by-side or in a grid layout.

**Tablet** (768–1023px): Cards stack vertically; tables remain scrollable.

**Mobile** (<768px): Not primary use case (admin tool). Cards stack; tables become scrollable cards.

## Visual Design

- **Cards**: Soft shadows, rounded corners, consistent padding
- **Read-Only Tables**: Light gray header, no interactive styling
- **Badges**: Current year marked with a green badge "(Current)"
- **Export Buttons**: Prominent, with icon + label
- **Information Banner**: Blue background with icon, friendly tone

## Data Examples

### Staff Assignments (Year 2024)

```
Teacher Name | Subject | Grade | Class | Date | Status
Ahmed Malik | ENGLISH | 10 | 10-A | 2024-01-15 | Active
Nirmala Silva | MATHEMATICS | 10 | 10-B | 2024-01-15 | Active
```

### Class Timetables (Year 2024)

```
Class | Grade | Periods | Modified
10-A | 10 | 40 (8/day × 5 days) | 2024-09-01
10-B | 10 | 40 | 2024-09-01
```

### Teacher Timetables (Year 2024)

```
Teacher | Periods | Busiest Day | Modified
Ahmed Malik | 36 | Monday (8) | 2024-09-01
Nirmala Silva | 32 | Wednesday (7) | 2024-09-01
```

### Subject Assignments (Year 2024)

```
Subject | Grade | Teachers | Classes
ENGLISH | 10 | Ahmed Malik, Sarah Perera | 3
MATHEMATICS | 10 | Nirmala Silva, Rohan Kumar | 4
```

## Future Enhancements

- Year-over-year comparison (change highlighting)
- Teacher workload trend analysis (charts)
- Assignment approval workflow history
- Staff retention metrics (compare years)
- Automated archival of data >3 years old
- Print-to-PDF for full year reports
- Email scheduled exports (e.g., monthly summary)
- Search across multiple years
- Custom report builder
