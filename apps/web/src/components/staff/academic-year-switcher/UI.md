# Academic Year Switcher UI Design

## Overview

Replaces the previous static "School Management" sidebar header link with a functional academic-year switcher, following the shadcn `TeamSwitcher` pattern from sidebar-07/08 blocks — except "teams" are academic years. Switching years changes which year is `isCurrent` in the database, which is the scope every other staff-management page reads from (`listClasses`, `listSubjectAssignments`, `periods`, etc. all filter by the current year).

## Placement

Lives in `<SidebarHeader>` in `app-sidebar.tsx`, replacing the old static logo link. Rendered once, shared across every `/dashboard/*` page via the persistent sidebar.

## Components Used

| Component | Purpose |
| --- | --- |
| `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` | Header slot, matches existing sidebar item styling |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuLabel`, `DropdownMenuItem`, `DropdownMenuSeparator` | Year list + actions |
| `Dialog` (via `AddAcademicYearDialog`) | Add Academic Year form, sticky header/footer pattern matching every other feature |
| `Select` | Year picker in the Add dialog, with already-defined years disabled |
| `Input type="date"` | Start/end date fields |
| `IconCalendar`, `IconChevronDown`, `IconPlus` | Visual affordances |

## Behavior

### Trigger button

Shows `Academic Year {year}` as the primary label and the year's `startDate – endDate` range as the secondary line (or "Select an academic year" if none is current yet).

### Dropdown list — windowing

Lists the **current year, the two years before it, and one year after it** — but only years that actually exist in the database. If the school has only ever created 2023 and 2024 (current = 2024), only those two show; a placeholder "2025" is never fabricated. Clicking a listed year calls `setCurrentYear` and invalidates every query, so the whole app immediately reflects the new scope. The active year is marked "Active" instead of being selectable again (clicking it again is a no-op).

### Add Academic Year

"Add Academic Year" opens a `Dialog` with:

- **Year** — a `Select` populated with a small range around the current year (2 years back, 3 years forward). Years that already exist as an `academicYear` row are rendered `disabled` so they can't be picked twice.
- **Start Date** / **End Date** — both required `type="date"` inputs. Validated client-side: end must be after start.
- Submits to `createAcademicYear` (backend already requires `startDate`/ `endDate` — they were previously optional in some flows but the schema and this dialog now always capture them). The new year is **not** automatically made current — creating next year's record ahead of time is a planning action, not a switch.

## Error/Loading States

- Switch action: toast on failure with the server's message; toast "Switched academic year" on success.
- Add dialog: inline `FieldError` for validation (missing year, missing dates, end before start); toast/inline error surfaces server-side validation (e.g. duplicate year) on submit failure. Submit button shows "Creating..." and disables while pending.

## Accessibility

- Trigger is a real button (via `SidebarMenuButton`/`DropdownMenuTrigger`), keyboard-operable.
- Year `Select` items use `disabled`, which is exposed to assistive tech via the underlying Base UI primitive's `data-disabled` state.
- Dialog follows the same sticky-header/scrollable-body/sticky-footer pattern as every other create/edit dialog in this app for consistent focus trapping and Escape-to-close behavior.
