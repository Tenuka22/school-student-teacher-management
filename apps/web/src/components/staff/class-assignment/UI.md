# Class Assignment

> **This file began as a planning document, and parts of it no longer describe the product.** The table below is the record of what shipped and where the plan was wrong. Treat everything below the table as history, not specification.

## What actually shipped

| Planned | Shipped | Why |
| --- | --- | --- |
| Card overflow menu (⋯) | Inline Assign / Edit / Delete buttons on the card | Three actions do not need a menu; hiding them behind an overflow was one extra click for the common case. |
| "No Teacher" status badge | Three named states plus an amber `warning` badge — "No homeroom teacher" / "Assigned, but not on this year's staff list" / the teacher's name | A class with a `homeroomTeacherId` that does not resolve out of the staff list is **not** the same fact as a class with no teacher, and drawing both as "Not assigned" told administrators that an assigned class had nobody in charge. The 2px accent bar that used to sit on the left edge is gone: a coloured `border-left` is a craft-floor ban, and the words plus the badge already carry the state. |
| `Sheet` for create/edit | `Dialog` | Short forms, centred. |
| Class name as a `<button>` that opens Edit | A real `<h3>`; Edit is an icon button labelled `Edit class 10-A` | Two controls opened the same dialog, and a heading that is also a button is announced as a heading you can press. |
| Grade headings only | Grade heading plus `4 of 6 classes have a homeroom teacher` | The heading said "Grade 7" and left the only question that matters — is this grade finished — scattered across six cards. |
| One skeleton of five bars in a bordered box | A skeleton of the real layout (grade bars + a four-across card grid) and `aria-busy` | The old skeleton reserved a tenth of the page's height, so every grade and every card arrived as a jump. |
| "No classes in this category" for every empty band | Per-band copy, and a **distinct** "nothing in this band matches this search" state with a Clear search action | The same sentence was printed for "nobody has built this band yet" and for "your search matched nothing in it". The second is a statement about the search, not about the College. |
| `homeroomTeacherId` as a CSV column | `homeroomTeacher` (a **name**) as the fillable column, with the id column kept for round trips | A column headed `homeroomTeacherId` asks a person to type a UUID. Names are resolved against `listStaff({ onlyPositioned: true })`, the same roster `assertTeacherEligibleForYear` enforces. |
| CSV import writes as it reads | Parse → judge every row → **preview** → confirm → a result summary | See below. |
| `classUpdateSchema` fields sent to `updateClass` | Only `name` and `medium` | `updateClass`'s input is an explicit `pick(classUpdateSchema, ["name", "medium"])`, so `gradeLevel` and `homeroomTeacherId` sent alongside them are stripped by the schema, not applied. |

### What the CSV importer does and does not do

- **Fatal vs row-level.** Fatal (nothing written, one `toast.error`): no academic year selected, the teaching roster failed to load, the file is empty, or the file is missing `name` / `gradeLevel` / `medium`. Row-level (listed by line number, class name and reason, in both the preview and the result): a schema failure, a duplicate class name inside the file, a `homeroomTeacher` name that is not on this year's roster, an ambiguous name, an `id` that matches no class in the year, or a **grade that differs from the class on record**.
- **A class's grade cannot be changed once it exists.** No procedure accepts it, so a row that disagrees about the grade is rejected rather than staged for a review that could not act on it. The UI says so instead of quietly dropping it.
- **A row is never overwritten.** A row whose `id` matches an existing class is staged, not written. `Apply imported version` writes the name and medium, and the homeroom teacher only when the class had nobody — replacing a teacher needs a reason from `TEACHER_REASSIGNMENT_REASONS`, which a spreadsheet cannot supply, so a replacement is declined with a message pointing at the class card.
- **A row carrying an `id` that matches nothing is rejected, not created.** Creating it would put a second copy of the class in a year that looked right on the way in.
- **The result is never optimistically reported.** `toast.success` only when nothing was refused; a partial import gets `toast.warning` naming both numbers; a total refusal gets `toast.error`; nothing-to-do gets `toast.info`. Every refused row is listed with the server's own reason, and a class that was created while its homeroom assignment failed says exactly that.
- Conflicts persist in `localStorage` under `import-conflicts:classes` and are shown with a full field-by-field diff. A conflict whose class has left the year is marked and can only be discarded — unless the year holds no classes at all, which usually means the read failed, and then nothing is called stale.
- The conflict list is a `Dialog`, not an `AlertDialog`. It is a review queue, not a question, and `AlertDialogContent` also clamps itself to `max-w-xs`.

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

- **Header**: Title "Class Assignment" + subtitle "Create classes and assign homeroom teachers for the academic year" (owned by the route)
- **Toolbar** (above the tabs, applies across all bands, and stays on screen while loading):
  - A labelled search field (`Find a class`, by class name or homeroom teacher) with a clear button
  - "Seed Classes" — `aria-disabled` with a tooltip once all 55 Primary and Secondary sections exist
  - Export (Excel) — shows "Preparing…" while the server builds the workbook
  - Create Class
  - CSV template download / import, in the page header beside the title
- A live-region count line: `12 classes this year`, or `3 of 55 classes match “fernando”`
- **Tabs**: `Primary`, `Secondary`, `Collegiate (A/L)` — each labelled with a live count of matching classes. The active band is **component state, not URL state**: the inventory register's `?tab=` contract belongs to the inventory feature, and AGENTS.md keeps the URL to the year path segment plus that one query param.
- **Tab content**: classes grouped by grade (`Grade 1`, `Grade 2`, …) within the active band, each grade headed by an `<h2>` and an `N of M classes have a homeroom teacher` line, then a card grid (1 column, up to 4 on wide desktop)
- **Dialogs**: Create class, Edit class, Assign homeroom teacher, CSV preview/result, staged-changes review (`Dialog`); Delete (`AlertDialog`). All with a sticky header and footer over a scrollable body.

### Responsive Design

- Desktop-first; sidebar collapses below `md` (parent Sidebar handles)
- Card grid degrades gracefully: 1 col mobile -> 2 col `sm` -> 3 col `lg` -> 4 col `xl`

## shadcn Components Used

| Component | Purpose | Justification |
| --- | --- | --- |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Primary/Secondary/Collegiate split | Groups classes by the school stage they actually belong to instead of one long table. Base UI supplies `role="tablist"`/`tab`/`tabpanel`, `aria-selected` and roving arrow-key focus; `activateOnFocus` is on so an arrow key moves _and_ selects, which is the WAI-ARIA default for panels this cheap. |
| `Card`, `CardHeader`, `CardTitle`, `CardAction`, `CardContent`, `CardFooter` | Per-class tile | Compact glanceable unit: name, grade, medium, homeroom teacher, status, three actions. The primitive's `ring-1` is the only elevation — no border, no shadow. Radius is the primitive's, which is square, matching every other staff card. |
| `Button` | Create, Export, Seed, card actions | One shape everywhere. |
| `Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldError` | Every form control and the search field | Consistent form field styling. Errors are bound with `aria-describedby` and the control carries `aria-invalid` — the base-lyra controls style from `aria-invalid`, **not** from `data-invalid`, so a `data-invalid` attribute drew a red message under a control that still looked valid. |
| `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupButton` | Search field, with a clear button | The same control vocabulary the combobox uses. |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | Create/Edit class, assign teacher, CSV preview and result, staged-changes review | Sticky header/footer, scrollable body. `Esc` is refused while a write is in flight. |
| `AlertDialog`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | Delete confirmation only | High-consequence action protection, and it names the class. |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Grade, medium and reassignment reason | Form selection controls. |
| `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, `ComboboxEmpty` | Homeroom teacher picker | Server-side fuzzy search, debounced 250 ms. |
| `Badge` | Medium (`secondary`), the actionable state (`warning`), a rejected CSV row (`destructive`) | `warning` is `--warning-ink` on `bg-accent/20` — the only pairing of that gold that clears AA. Never `text-gold`. |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | CSV preview, CSV result, conflict diff | Real `<table>` with `<th scope>`; never hand-rolled rows. |
| `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | Four distinct empty states | Whole page, per-band, no-search-match, and a "no class rows in the file" refusal. |
| `Skeleton` | Loading state that mirrors the real layout | Smooth loading perception without a reflow. |
| `Tooltip`, `TooltipTrigger`, `TooltipContent` | Why Seed Classes is unavailable | A `disabled` button is not focusable, so its tooltip could never be reached; the button is `aria-disabled` with a guarded handler instead. |
| `toast` (sonner) | Notifications | Every mutation, and the year-level failures. |
| `QueryErrorPanel` | The failed read | Shared, and the reason a failed read is never drawn as an empty year. |
| `IconPlus`, `IconSearch`, `IconFileExport`, `IconSeedling`, `IconX`, `IconEdit`, `IconTrash`, `IconUserCog`, `IconUserOff`, `IconAlertTriangle`, `IconCircleCheck`, `IconDownload`, `IconUpload` | Action and state icons | `@tabler/icons-react`, one stroke weight, `aria-hidden` when decorative. |

## Card Contents

Each class card shows, top to bottom:

1. Class name as an `<h3>`, the grade beneath it, and the medium as a `secondary` badge in the header corner
2. A `HOMEROOM TEACHER` label over one of three states — the teacher's name with initials, `No homeroom teacher`, or `Assigned, but not on this year's staff list`
3. An amber `warning` badge — `Action needed` or `Check roster` — when the class is not fully accounted for
4. Three actions in the footer: `Assign teacher` / `Reassign` (primary when a teacher is missing), Edit, Delete. The two icon buttons carry `aria-label`s that name the class.

There is no card in this feature that is an icon, a heading and a paragraph. There is also no nested card: the Card primitive plus its header/content/footer slots is the whole unit.

## User Interaction Flows

### Seed Classes

1. User clicks "Seed Classes" (toolbar, or from the empty state)
2. Calls `seedDefaultClasses` for the current academic year
3. Toast: "Seeded N classes (M already existed)"
4. List refetches; Primary and Secondary tabs populate immediately

### Create Class

1. User clicks "Create Class"
2. Dialog opens: Grade Level* (1–13), Class Name* (e.g. "10-A"), Medium of Instruction (Sinhala / Tamil / English)
3. Submit -> client schema -> `createClass` -> dialog closes, list refetches
4. Toast: "Class created"

### Edit Class

1. User clicks the Edit icon button on the card
2. Dialog opens pre-filled, titled `Edit 10-A`. Only Class Name and Medium are editable — `updateClass` accepts those two and nothing else.
3. Submit -> `updateClass` -> toast "Class 10-A updated"

### Assign Homeroom Teacher

1. "Assign teacher" / "Reassign" on the card opens a searchable roster of this year's teaching staff
2. The form names the consequence of the change as it is made: _New assignment_, _Replacing the current teacher_, _Clearing the current teacher_
3. Submit -> `assignClassTeacher` -> the card's teacher line and the grade summary update on refetch

### Delete Class

1. The Delete icon button opens an `AlertDialog` that **names the class** and lists what goes with it
2. Confirm -> `deleteClass` -> toast "Class 10-A deleted"

### Filter by Search

Search filters by class name or homeroom teacher name (case-insensitive) across all three bands at once; each tab's count badge, the card grid and a live-region count line all reflect only matching classes. Clearing the filter is one click, from the field's clear button or from the no-match state.

### Import via CSV

Download a template, edit offline, re-upload. Nothing is written until the preview is confirmed. See "What the CSV importer does and does not do" above.

## Empty States

Four of them, and they are four different sentences:

- **No classes at all for the year** — full-page `Empty` with Seed Classes and Create Class, and a note that A/L is never seeded. Reachable only when `listClasses` succeeded.
- **A band has no classes** (e.g. Collegiate before any A/L classes exist) — per-band copy: Collegiate explains that stream sizes are always manual; Primary and Secondary point back to Seed Classes and carry the button.
- **A search matches nothing in the band you are on** — names the search term, says the other bands may still have matches, and offers Clear search.
- **A search matches nothing anywhere** — every band shows the same third state with its own count of 0.

## Loading States

- Initial load: a skeleton of the real layout (grade bars and a four-across card grid) with `aria-busy`, and the toolbar still rendered so nothing jumps and Create/Seed stay reachable
- Search: instant, local filtering
- Mutation pending: the button says "Seeding…" / "Preparing…" / "Importing…" and is guarded; dialog submit buttons hold a fixed width so the label swap does not reflow the footer mid-press

## Error States

- Validation error: inline `FieldError`, bound with `aria-describedby`, on a control marked `aria-invalid`, and the caret is moved to the first field anybody objected to
- Server validation error: mapped back onto the fields it names by the form. The three form-driven mutations rethrow rather than toast-and-swallow, so a refusal that the client schema could not predict lands on the field that caused it instead of nowhere.
- Seed / export / delete error: a toast carrying the server's message via `formatApiErrorMessage`
- **Staff roster failure**: toasted once, and every card says "Assigned, but not on this year's staff list" rather than "No homeroom teacher"
- Class-list fetch error: `QueryErrorPanel` — "The class list could not be loaded", the server's message, and "Try again" calling `listQuery.refetch()`. `classes` is `[]` for a failure as well as for an empty year, so the seeding prompt is never rendered from a failed read.
- **Academic-year failure or absence**: `listClasses` is disabled until a year resolves, so a pending, failed or unmatched year list all arrive as `classes === []` with the query neither loading nor errored. Each is resolved to its own message, because "seed the class structure" is a wrong instruction about a year the system never found.

## Business Rules

- A class has at most one homeroom teacher per academic year, and a replace or a clear needs a reason from `TEACHER_REASSIGNMENT_REASONS`
- Only staff holding a teaching post in the year (`onlyPositioned`) can be assigned, and the picker and the write enforce the same rule
- Class name is unique within a grade level within an academic year (enforced by a DB unique constraint on `academicYearId + gradeLevel + name`)
- A class's grade cannot be changed after creation — no procedure accepts `gradeLevel` on an update
- Section "A" is always English medium; every other seeded section is Sinhala medium
- Seeding never touches grades 12–13, and never overwrites/duplicates an existing class
- Deleting a class cascades to related period assignments

## Accessibility

- One `<h1>` (the route) → `<h2>` per grade → `<h3>` per class. The old markup jumped h1 → h3 with no level between.
- The tab strip is a real tablist/tab/tabpanel with `aria-selected` and arrow-key navigation, and `aria-label` on both the list and each panel
- Every icon-only control has an `aria-label` naming its class; every decorative icon is `aria-hidden`
- Form labels are real `FieldLabel`s bound by `htmlFor`; ids are namespaced by `formId`, because all three class dialogs are mounted at once
- Error messages are bound by `aria-describedby` and the control by `aria-invalid`
- The search result count and the "change kind" panel are live regions
- The CSV preview and result are real tables with `<th scope>`
- Dialogs move focus in, trap it, return it to the trigger, and refuse `Esc` while a write is in flight
- WCAG AA contrast: `--warning-ink` for amber text, never `--gold`

## Responsive Behavior

**Desktop**: full toolbar + 3–4 column card grid.

**Tablet**: toolbar wraps; card grid drops to 2 columns.

**Mobile** (<768px): not the primary use case (admin tool), but the card grid degrades to a single column and remains fully usable; the parent sidebar becomes an overlay.

## Future Enhancements

- Class capacity / student-count tracking
- Sub-homeroom teacher assignment surfaced in the card itself
- Class rotation scheduling
- Drag-to-reassign teacher between cards
