# Historical Data — as shipped

Status: **implemented**. This file describes what the page does today, not an earlier plan. Where the two ever disagreed, the plan was wrong: the page was built to what the data supports, and the document was corrected.

## What it is

A read-only view of one academic year's staffing, timetable, leave and attendance records, for an administrator reviewing a year that has closed (or one about to).

## Reading a year that is not the current one

This is the one route in the app allowed to disagree with the school's active year. Every other year-scoped page is guarded to the current year, because the sidebar switcher promotes a year as you navigate. Historical views exist to read a _past_ year, so this route passes `allowAnyYear: true` to `loadAcademicYearRoute` (`routes/_auth/admin/$year/staff/historical-data.tsx`).

A year that does not exist is still refused, and `/account` is unaffected.

## The six tabs

| Tab | Shows | Source |
| --- | --- | --- |
| Staff & positions | Staff on the year's roster with their positions | `staff.getHistoricalData` |
| Teacher subjects | Teacher → subject assignments | same |
| Class & teacher timetables | Every class-period assignment with its class and teacher | same |
| Homeroom history | Assignment, replacement and clearing of class teachers | same |
| Leave decisions | Requests with both review steps and their comments | same |
| Attendance exceptions | Attendance rows that are not `present` | same |

All six read the year from the URL segment, and the header states the year and its record count, so the reader always knows which year they are looking at.

## The table

Each tab renders one shared data table — `historical-data-table.tsx` (`HistoryDataTable<TRow>`), fed by tab-specific column builders in `historical-data-columns.tsx` and typed row accessors in `historical-data-rows.ts`. It composes the house `ui-patterns/data-table` pieces (`DataTableFrame`, `DataTableSearchField`, `DataTableViewOptions`) rather than hand-rolled markup. Until this was built the six tabs were six independent hand-written lists, each with its own filtering and ordering held in component state.

**URL state** (`historical-data-search.ts`), five params, no defaults in the address bar:

| Param | Values | Notes |
| --- | --- | --- |
| `tab` | `staff` (default), `subjects`, `timetables`, `homerooms`, `leaves`, `attendance` | Absent when default |
| `q` | free text | Matched against what each row _renders_, not stored keys |
| `sort` | per-tab column id | Rejected for the current tab falls back to that tab's default |
| `dir` | `asc` \| `desc` | Absent when the tab's default |
| `status` | per-tab picklist, `""` = all | Homerooms → Change, Leaves → Decision, Attendance → Status |

`tab` is what makes the page shareable: the route's `validateSearch` clamps first and strips defaults second, so a hand-typed link and an in-app link arrive in the same shape, and a `sort` key that belongs to another tab becomes the current tab's default instead of a header that highlights nothing.

**Filtering and sorting are client-side**, in `historical-data-table.tsx`. `getHistoricalData` returns a whole year in one response, so there is nothing to page: no `pagination` state and no paging bar — the toolbar says `n of m shown` while narrowed, `m records` otherwise. Sorting goes through the table's `manualSorting` contract — the table only _reads_ `state.sorting`, and `orderHistoryRows` does the ordering — so no header here calls `toggleSorting` at all. The five other list tables do reach the table through `sortColumn` (`ui-patterns/data-table/sort-column.ts`), which clears the sort for `null`; this page cannot, because its default order is per-tab, so it writes `HISTORY_SORT_DEFAULTS[tab]` itself.

Headers call `onSort(columnId, direction)`; the page writes `HISTORY_SORT_DEFAULTS[tab]` for the reset case. The filter is one text field plus the tab's own status picklist, both written straight to the URL.

## What it deliberately does not do

- **No export.** Exports were specified here once and never built. The Excel and PDF exports that do exist are the class timetable and teacher workbook, under Period Assignment and Teachers.
- **No year picker.** The year comes from the URL, so a bookmarked view keeps its year. The switcher promotes a year for _working_ pages; using it here would change school-wide state to look at history.
- **No editing.** Nothing on this page writes. A record is corrected in the page that owns it.

## Labels

Subject keys are rendered through `subjectLabel` (`packages/db/src/constants/display.ts`) and leave types through `leaveTypeLabel` (`packages/db/src/constants/leave-labels.ts`), so a stored key such as `duty` or `environmentRelatedActivities` reads as "Official Duty" and "Environmental-Related Activities" — the same words the rest of the product uses. A key with no label degrades to readable words rather than leaking.
