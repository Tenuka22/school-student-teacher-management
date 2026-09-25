# Class Assignment

> **This file is a planning document, and parts of it no longer describe the product.** The divergences below are deliberate. Treat everything below the list as history, not specification.

## What actually shipped

| Planned | Shipped | Why |
| --- | --- | --- |
| Card overflow menu (⋯) | Inline Assign / Edit / Remove buttons on the card | Three actions do not need a menu; hiding them behind an overflow was one extra click for the common case. |
| "No Teacher" status badge | A "Not assigned" line, plus a 2px accent bar | The text carries the state; the bar only reinforces it. |
| `Sheet` for create/edit | `Dialog` | Short forms, centred. |

Terminology is settled: one class has one **homeroom teacher** (also called the class teacher in older records — the UI says "homeroom teacher" throughout).

`ClassCsvImport` writes a genuinely blank template. On a conflict, "Apply Imported Version" now writes the name, grade and medium, and the homeroom teacher where the file names one — it previously displayed the grade and homeroom differences and then silently applied only two of the three fields.

## Overview

The Class Assignment feature lets administrators seed the standard class structure for an academic year, create/edit classes, assign homeroom teachers, and browse classes grouped by school stage instead of one long flat table.

## Grade Structure & Seeding

Sri Lankan schools split into three bands with very different class-count predictability:

| Category | Grades | Sections | Predictable? |
| --- | --- | --- | --- |
| Primary | 1–5 | A–E (5) | Yes — fixed |
| Secondary | 6–11 | A–F (6) | Yes — fixed |
| Collegiate (A/L) | 12–13 | Customizable | No — depends on subject-stream demand each year |

"Seed Classes" (`orpc.staff.seedDefaultClasses`) generates every Primary and Secondary section for the selected academic year in one call — e.g. grade 1 gets `1-A` through `1-E`, grade 6 gets `6-A` through `6-F`. Section **A** is always the English-medium class; every other section is Sinhala-medium. Seeding is idempotent: sections that already exist for that year/grade are skipped, never duplicated, and the toast reports both counts. Grades 12–13 are **never** auto-seeded — those classes are always created manually via the normal "Create Class" flow, because A/L stream sizes vary year to year.

## Page Layout

### Main Container

- **Header**: Title "Classes" + subtitle "Create classes and assign homeroom teachers for the academic year"
- **Toolbar** (above the tabs, applies across all categories):
  - Search input (by class name or teacher)
  - "Seed Classes" button
  - Export button (Excel)
  - Create Class button
  - CSV template download / import (with local conflict staging)
- **Tabs**: `Primary`, `Secondary`, `Collegiate (A/L)` — each labeled with a live count of matching classes
- **Tab content**: classes grouped by grade (`Grade 1`, `Grade 2`, ...) within the active category, rendered as a responsive card grid (1 column on mobile, up to 4 on wide desktop)
- **Dialogs**: Create/Edit class, Assign teacher, Delete confirmation (all `Dialog`, sticky header/footer + scrollable body, per the app-wide pattern)

### Responsive Design

- Desktop-first; sidebar collapses below `md` (parent Sidebar handles)
- Card grid degrades gracefully: 1 col mobile -> 2 col `sm` -> 3 col `lg` -> 4 col `xl`

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Primary/Secondary/Collegiate split | Groups classes by the school stage they actually belong to instead of one long table |
| `Card` | Per-class tile | Compact glanceable unit: name, medium, teacher, status |
| `Button` | Create, Export, Seed, actions | Primary/secondary buttons |
| `Input` | Search field | Fast filtering by class name or teacher |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` | Per-card context menu | Edit, Assign Teacher, Delete |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` | Create/Edit class and assign teacher forms | Sticky header/footer, scrollable body, consistent with every other staff feature |
| `AlertDialog`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | Delete confirmation | High-consequence action protection |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Grade and medium dropdowns | Form selection controls |
| `Field`, `FieldLabel`, `FieldError`, `FieldDescription` | Form layout | Consistent form field styling |
| `Badge` | Medium badge (English/Sinhala/Tamil), status (Active/No Teacher) | Visual status indicators |
| `Empty`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Empty states (whole page and per-tab) | Friendly onboarding, nudges toward Seed Classes |
| `Skeleton` | Loading state | Smooth loading perception |
| `toast` (sonner) | Notifications | Success/error feedback, seed result counts |
| `IconPlus`, `IconSearch`, `IconFileExport`, `IconSeedling`, `IconDotsVertical`, `IconTrash`, `IconUserCircle` | Action icons | Visual affordance |

## Card Contents

Each class card shows, top to bottom:

1. Class name (click to edit) + Grade label
2. Overflow menu (Edit / Assign Teacher / Delete)
3. Medium badge (English = `default` variant, Sinhala/Tamil = `secondary`)
4. Status badge ("Active" if a homeroom teacher is assigned, "No Teacher" destructive badge otherwise)
5. Homeroom teacher name, or "Unassigned"

## User Interaction Flows

### Seed Classes

1. User clicks "Seed Classes" (toolbar, or from the empty state)
2. Calls `seedDefaultClasses` for the current academic year
3. Toast: "Seeded N classes (M already existed)"
4. List refetches; Primary and Secondary tabs populate immediately

### Create Class

1. User clicks "Create Class"
2. Dialog opens: Grade Level* (1–13), Class Name* (e.g. "10-A"), Medium of Instruction (Sinhala / Tamil / English)
3. Submit -> creates class, dialog closes, list refetches
4. Toast: "Class created successfully"

### Edit Class

1. User clicks the class name or "Edit" from the card menu
2. Dialog opens pre-filled; Class Name and Medium are editable
3. Submit -> update mutation -> toast "Class updated successfully"

### Assign Class Teacher

1. "Assign Teacher" from the card menu opens a searchable staff dropdown
2. Submit -> `assignClassTeacher` -> card's teacher name and status badge update on refetch

### Delete Class

1. "Delete" from the card menu -> `AlertDialog` confirmation
2. Confirm -> delete mutation -> toast "Class deleted successfully"

### Filter by Search

Search filters by class name or teacher name (case-insensitive) across all three category tabs simultaneously; each tab's count badge and card grid update to reflect only matching classes.

### Import via CSV

Unchanged from before: download a template, edit offline, re-upload. New rows (no matching id) are created immediately; rows matching an existing id with different data are staged as conflicts for explicit apply/discard, never auto-overwritten.

## Empty States

- **No classes at all for the year**: full-page `Empty` with both "Seed Classes" and "Create Class" actions.
- **A tab has zero classes** (e.g. Collegiate before any A/L classes are created): a smaller in-tab `Empty` with category-specific guidance — the Collegiate tab explains stream counts are always manual; Primary/ Secondary point back to Seed Classes.

## Loading States

- Initial load: skeleton rows in place of the tab content
- Search: instant, local filtering
- Mutation pending: buttons show "Saving...", "Seeding...", disabled state

## Error States

- Validation error: inline `FieldError` under the field
- Mutation error: toast with the server's message
- Seed error (e.g. no academic year selected): toast, no partial UI state change

## Business Rules

- A class has at most one homeroom teacher per academic year
- Class name is unique within a grade level within an academic year (enforced by a DB unique constraint on `academicYearId + gradeLevel + name`)
- Section "A" is always English medium; every other seeded section is Sinhala medium (matches standard school convention of one English-medium stream per grade)
- Seeding never touches grades 12–13, and never overwrites/duplicates an existing class
- Deleting a class cascades to related period assignments

## Accessibility

- All buttons have clear labels; card name is a real `<button>`
- Form labels use `<label>` with `htmlFor`
- Error messages linked via aria-invalid + aria-describedby
- Tabs are keyboard-navigable (arrow keys move focus between triggers, per Base UI's Tabs implementation)
- WCAG AA color contrast on all badges

## Responsive Behavior

**Desktop**: full toolbar + 3–4 column card grid.

**Tablet**: toolbar wraps; card grid drops to 2 columns.

**Mobile** (<768px): not the primary use case (admin tool), but the card grid degrades to a single column and remains fully usable; the parent sidebar becomes an overlay.

## Future Enhancements

- Class capacity / student-count tracking
- Sub-homeroom teacher assignment surfaced in the card itself
- Class rotation scheduling
- Drag-to-reassign teacher between cards
