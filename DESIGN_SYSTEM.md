# Design System — St. Aloysius' College School Management

How the interface is built: tokens, patterns and rules. Everything described here exists in the code; file paths are given so you can check.

## Principles

1. **Honest.** Show only what the College records say. No invented figures, statuses or success messages. If something cannot be loaded, say so.
2. **Legible.** 14–15px body text and controls (16px inputs on phones), AA contrast, and a visible focus ring on everything interactive.
3. **Institutional.** College green, gold, cream and crimson; square corners; Cormorant for display headings, Manrope for everything functional; uppercase eyebrow labels. No gradients, glass or glow in application screens.
4. **Operable everywhere.** Keyboard, touch and screen reader all reach every action. No hover-only controls.

## Tokens

Defined in `packages/ui/src/styles/globals.css` and exposed as Tailwind colours (`bg-primary`, `text-muted-foreground`, …).

### Colour

| Token | Value | Use |
|---|---|---|
| `primary` / `foreground` | `#013405` | Text, primary buttons, table headers |
| `primary-hover` | `#064A12` | Hover on primary fills |
| `primary-foreground` | `#FFF8E7` | Text on green |
| `background` | `#FDF8EC` | Page |
| `card` / `popover` | `#FFFDF6` | Surfaces |
| `muted` / `secondary` | `#F3F1E9` | Subtle fills |
| `muted-foreground` | green at 70% (5.4:1) | Secondary text, placeholders |
| `accent` | `#FFB203` | Gold. **Only on green or dark surfaces** (1.7:1 on cream) |
| `accent-hover` | `#FFD45A` | Hover on gold fills |
| `gold-text` | `#936500` (4.8:1) | Gold-coloured *text* on light surfaces, e.g. eyebrows |
| `destructive` / `destructive-foreground` | `#A51919` / cream | Errors, destructive actions |
| `success` | `#2E7D32` | Positive status |
| `surface-deep` | `#04220A` | Landing, 404 and auth brand panels |
| `border` | green at 16% | Decorative dividers only |
| `input` | green at 55% (3.4:1) | Control boundaries |
| `ring` | `#013405` (gold inside `.surface-deep` and the sidebar) | Focus |
| `sidebar-muted-foreground` | cream at 60% (5.7:1) | Secondary sidebar text |
| `subject-1` … `subject-8` | see file | Timetable subject colours (all ≥ 5:1) |

Contrast figures were computed from these values (see the implementation report). Do not use raw hex values in components; add a token instead.

A few deliberate exceptions remain: the signup page's lighter green "user account" palette (`#0B5E1A`, `#084512`, `#F4F6F1`), which distinguishes it from staff sign-up, and the red "database unreachable" dot on the landing page.

### Type

**Families.** Manrope for everything functional: navigation, forms, tables, buttons, badges, dialogs, metrics, and every heading below page-title size. Cormorant Garamond only at display sizes (about 28px and up): page titles, the landing/404/auth headlines, and the academic-year numerals. Below that size its hairlines stop reading well. Both stacks fall back to system fonts with Sinhala and Tamil glyphs (Noto, Nirmala UI, Iskoola Pota, Sinhala Sangam) before the generic family. `.font-heading` switches Cormorant to lining figures, because its default old-style figures make years and counts bob.

**Roles.** Use the `type-*` utilities from `globals.css`. Each one sets family, size, leading, weight and tracking together. They are not `text-*` classes, so `cn()` never drops a colour class next to them.

| Role | Class | Result |
|---|---|---|
| Display (landing, 404) | `type-display` | Cormorant 600, 40–72px fluid, 1.02 |
| Page title | `type-page-title` (via `PageHeader`) | Cormorant 600, 30–40px fluid, 1.1 |
| Section title | `type-section-title` | Manrope 700, 19–22px, 1.3, −0.018em |
| Card title | `type-card-title` (`CardTitle` default) | Manrope 600, 17px, 1.35 |
| Dialog / sheet title | primitive default | Manrope 600, 18px (`text-xl` for large confirmations) |
| Big figure | `type-stat` | Manrope 700, 26–32px, tabular figures |
| Eyebrow / small label | `type-eyebrow` (+ `text-gold-text` on light) | Manrope 700, 12px, uppercase, 0.14em |
| Running text, descriptions | `type-body` | 15px, 1.6 |
| Controls, table cells, labels | `text-sm` | 14px, 1.5. Labels are 600. Inputs are 16px on phones and 15px from `sm` |
| Secondary data in grids | `type-caption` | 13px, tabular. E.g. teacher under a subject, period times, email under a name |
| Metadata only | `text-xs` | 12px. Timestamps, badges, counts. Nothing smaller, and never for a decision, an error or a hint |

**Weights:** 400 body, 500 secondary emphasis, 600 labels/buttons/card titles, 700 section titles, figures and eyebrows. 800 is not used.

**Uppercase:** only through `type-eyebrow`, table headers (primitive default: 12px, 600, 0.06em; green header bars use `text-xs font-bold tracking-[0.08em]`) and short status chips. Write the source text in sentence case and let CSS uppercase it. Never type labels, buttons or button states in capitals.

**Responsive:** the display steps are fluid by viewport *width*. Never size text by `vh`, because it shrinks on short laptop screens and zoomed windows. Fix wrapping and layout rather than shrinking body text.

### Layout and layers

- Content width: `max-w-content` (96rem). The signed-in shell centres every page in it. Running text: `max-w-prose` (65ch).
- Breakpoints: Tailwind defaults. `md` (768px) switches the sidebar to a sheet and the timetables to the day view.
- Layers (`--z-sticky` 10, `--z-overlay` 50, `--z-toast` 100): sidebar 10; every overlay 50 (Base UI stacks overlays by mount order); skip link 100.
- Corners are square (`rounded-none` in all primitives). Do not add `rounded-*` except for avatars and dots.

### Motion and scrolling

- `prefers-reduced-motion: reduce` shortens every animation and transition to near zero (global rule).
- Scrollbars are thin, in green at 40% (cream on dark surfaces), and stay visible. The signed-in app reserves the scrollbar gutter so tables don't shift.
- `color-scheme: light`. There is no dark theme; the `dark:` variant is kept inert on purpose (see the comment in `globals.css`).

## Primitives (`packages/ui/src/components`)

shadcn "base-lyra" on Base UI. Relevant defaults:

- **Button**: 36px (`h-9`); 40px on touch (`pointer-coarse:`); `sm` 32px; icon sizes 24/32/36px. 2px focus ring with offset.
- **Input / Textarea / Select / InputGroup**: 36px (40px on touch), 16px text below `sm`, `border-input`, a 2px green focus boundary, and crimson on `aria-invalid`.
- **Dialog / AlertDialog**: never taller than the viewport minus safe areas; content scrolls inside. Titles are Manrope 600, 18px.
- **Sheet**: scrolls internally; bottom safe-area padding.
- **Table**: 14px cells with tabular figures; header cells are 12px uppercase labels with `scope="col"`. Row labels pass `scope="row"` plus `tracking-normal normal-case text-foreground`.
- **Empty / Skeleton**: loading and empty states. Use these; don't write "Loading…" paragraphs.
- **SidebarInset** is a plain `div`; the shell provides `<header>` and `<main id="main-content">`.

## Patterns (`apps/web/src/components/ui-patterns`)

| Pattern | Use it for |
|---|---|
| `PageHeader` | Every page's heading: `eyebrow`, `title`, `description`, `actions` |
| `FormDialog` | Create/edit dialogs: fixed header, scrolling body, fixed footer; submit targets the form by `formId` |
| `ConfirmDialog` | Any confirmation in front of an action. Pass `isPending`: it disables both buttons and blocks dismissal while the mutation runs. `tone="destructive"` for deletions |
| `SearchInput` | Search boxes; `label` is required (visually hidden by default) |
| `ErrorState` | A query that failed; offers "Try again" only when you pass `onRetry` |
| `RequiredMark` | The visible "(required)" after a label; pair it with `aria-required` |
| `CollegeCrest` | The crest; WebP with PNG fallback and intrinsic size. `size="large"` for watermarks |

## Forms

- Every control has an `id` and a `<FieldLabel htmlFor>` (or a native `<label htmlFor>`). Never wrap two controls in one `<label>`.
- Use `fieldA11y(id, { error, hasDescription, required })` from `apps/web/src/lib/field-a11y.ts` on the control, `<Field data-invalid={Boolean(error)}>` on the wrapper, and `<FieldError id={errorId(id)}>` / `<FieldDescription id={descriptionId(id)}>` beneath. This turns the label and border crimson and links the message for screen readers.
- Group controls (e.g. year buttons) in a `<fieldset>` with a legend or `aria-labelledby`.
- Phone numbers: `type="tel" inputMode="tel"`. Sign-in: `autoComplete="username"` / `"current-password"`; new passwords `"new-password"`; codes `"one-time-code"`.
- Placeholders start with "e.g." and never replace the label.
- Never change field names, payloads or validation for presentation reasons.

## Navigation and pages

- Sidebar items are real links (`<Link>`) with `aria-current="page"`. Unavailable items stay focusable with `aria-disabled` and announce "(coming soon)".
- The header shows the breadcrumb from `apps/web/src/lib/breadcrumbs.ts` and the academic year only when the URL has one. Add a label there when you add a route segment.
- Every route sets `head: () => pageHead("Page name")` (`apps/web/src/lib/page-title.ts`), placed **after** `loader`/`validateSearch` so route types still infer.
- A "Skip to main content" link is the first focusable element in the signed-in shell.

## Tables and grids

- Row actions: an always-visible primary action plus a named menu trigger (`aria-label="More actions for …"`). Never nest a button inside a button.
- Menus that appear on hover must also appear on `group-focus-within`, `focus-visible`, `aria-expanded` and `pointer-coarse`.
- Icon-only buttons need an `aria-label` and are at least 24×24px (32px preferred).
- Wide tables scroll inside their container, never the page. Hide secondary columns below `md` and fold their content into the first cell.
- Timetables switch to a one-day view below `md`.

## Copy

- Sentence case for buttons, titles and labels ("Add teacher", "Save changes"). Uppercase only through the eyebrow and table-header styles.
- One verb per action across the app: *Add* (create), *Save changes* (edit), *Delete* (remove a record), *Unassign* (clear a slot).
- In-progress labels use a typographic ellipsis: "Saving…".
- Show enum values through their labels (e.g. `GENDER_LABELS`), never raw values.

## Adding a page (checklist)

1. Route file with `head: () => pageHead("…")` after `loader`.
2. `PageHeader` with an eyebrow for the section.
3. Loading → `Skeleton`, empty → `Empty`, failure → `ErrorState`.
4. Forms wired with `fieldA11y`; confirmations through `ConfirmDialog`.
5. Tokens only; no hex values; `type-*` roles for headings; nothing below 12px.
6. Add the route segment's label in `lib/breadcrumbs.ts`.
7. Run `bun x ultracite fix <changed files>` and `bun run check-types`.
