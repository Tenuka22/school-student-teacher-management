import { readString } from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

/**
 * The historical page's URL contract.
 *
 * The six tabs were a `Tabs` with `defaultValue="staff"` and nothing else: which
 * year you were reading was in the path, and which *part* of that year was in
 * component state. So a link to the leave decisions of 2025 opened the staff
 * roster of 2025, Back from "Attendance exceptions" to "Leave decisions" did
 * nothing, and a search typed into one tab was lost the moment the tab changed.
 *
 * Five params, and no page: `getHistoricalData` returns a whole year in one
 * response, so there is no page two to fetch and a paging bar would be
 * furniture — the same reasoning the attendance register gives, one file over.
 *
 * `sort` is validated **against the tab it is being read with**, not against the
 * union of every tab's columns. That is what makes a shared link honest in both
 * directions: `?tab=attendance&sort=name` is a sort key the attendance tab does
 * not have, so it becomes that tab's own default rather than a header that
 * highlights nothing — and it also means changing tabs can leave the previous
 * tab's key behind, which `toHistorySearchParams` resolves the same way.
 */
export const HISTORY_TABS = [
  "staff",
  "subjects",
  "timetables",
  "homerooms",
  "leaves",
  "attendance",
] as const;

export type HistoryTab = (typeof HISTORY_TABS)[number];

/** The tab a bare `/admin/2026/staff/historical-data` shows. */
export const DEFAULT_HISTORY_TAB: HistoryTab = "staff";

const HISTORY_TAB_LABELS: Record<HistoryTab, string> = {
  staff: "Staff & positions",
  subjects: "Teacher subjects",
  timetables: "Class & teacher timetables",
  homerooms: "Homeroom history",
  leaves: "Leave decisions",
  attendance: "Attendance exceptions",
};

/** The words a reader sees on the tab and in the caption. One place, both uses. */
export const historyTabLabel = (tab: HistoryTab): string =>
  HISTORY_TAB_LABELS[tab];

/**
 * The columns each tab may order by.
 *
 * A column that is on screen but not in its tab's list is a column nobody can
 * sort: `gradeLevel` is sortable on the timetable tab because "Grade 1 before
 * Grade 10" is a question a reader asks, and the same numbers on other tabs are
 * not a question at all.
 */
export const HISTORY_SORT_KEYS = {
  staff: ["name", "teacherServiceNo"],
  subjects: ["staffName", "subjectKey"],
  timetables: [
    "className",
    "gradeLevel",
    "dayOfWeek",
    "periodNumber",
    "subjectKey",
    "staffName",
  ],
  homerooms: [
    "className",
    "changeType",
    "previousTeacherName",
    "newTeacherName",
    "changedAt",
  ],
  leaves: ["staffName", "type", "startDate", "deputyStatus", "finalStatus"],
  attendance: ["staffName", "date", "status"],
} as const satisfies Record<HistoryTab, readonly string[]>;

/**
 * A sort key, as far as TypeScript is concerned: any string.
 *
 * The union of the six lists above would be more precise and would buy nothing,
 * because every read of a sort key already runs it through that tab's list — the
 * type cannot express "valid *for this tab*", only "valid for some tab", and a
 * key that is valid for some tab and used on another is exactly the case the
 * read exists to reject. Membership is enforced at read time, by design.
 */
export type HistorySortKey = string;

/**
 * Where each tab starts when the URL names no order.
 *
 * The three chronological tabs default to newest first, because on a history
 * page the thing being looked for is almost always the most recent change; the
 * three rosters default to A–Z, because a roster is read by name.
 */
export const HISTORY_SORT_DEFAULTS: Record<
  HistoryTab,
  { key: HistorySortKey; dir: "asc" | "desc" }
> = {
  staff: { key: "name", dir: "asc" },
  subjects: { key: "staffName", dir: "asc" },
  timetables: { key: "className", dir: "asc" },
  homerooms: { key: "changedAt", dir: "desc" },
  leaves: { key: "startDate", dir: "desc" },
  attendance: { key: "date", dir: "desc" },
};

/**
 * The picklist behind the one filter, per tab.
 *
 * Three tabs have a status worth narrowing by and three do not: a roster of
 * staff has no state to pick from, so the param is absent there rather than
 * present and ignored.
 */
export const HISTORY_STATUS_VALUES = {
  staff: [],
  subjects: [],
  timetables: [],
  homerooms: ["assigned", "replaced", "cleared"],
  leaves: ["pending", "recommended", "approved", "rejected", "cancelled"],
  attendance: ["partial", "absent", "lateShortLeave", "halfDay"],
} as const satisfies Record<HistoryTab, readonly string[]>;

/**
 * The word above that picklist, per tab.
 *
 * The picker has to name what it narrows: on "Homeroom history" the options are
 * `assigned`/`replaced`/`cleared`, so a control labelled "Status" would be
 * asking about a state the rows do not have, and on "Leave decisions" the column
 * a reader is actually reaching for is the Principal's.
 */
export const HISTORY_STATUS_LABELS: Record<HistoryTab, string> = {
  staff: "Status",
  subjects: "Status",
  timetables: "Status",
  homerooms: "Change",
  leaves: "Decision",
  attendance: "Status",
};

/**
 * What a search is parsed *from*: the raw query object, or an already-filled
 * one being parsed a second time.
 *
 * Optional `unknown`s rather than `Record<string, unknown>` for one reason —
 * `HistorySearch` is an `interface`, and an interface has no implicit index
 * signature, so a filled search is not assignable to `Record<string, unknown>`.
 * Making the input all-optional runs the other way instead: the raw query object
 * has a string index signature and every field here is optional, so
 * `Record<string, unknown>` → `HistorySearchInput` holds, while
 * `HistorySearch` → `HistorySearchInput` holds trivially. Both directions of
 * the re-parse then type-check without a cast in either.
 *
 * An `interface`, not a `type` alias: `typescript(consistent-type-definitions)`
 * asks for `interface` here, and it is what `HistorySearch` is written as too.
 */
export interface HistorySearchInput {
  dir?: unknown;
  q?: unknown;
  sort?: unknown;
  status?: unknown;
  tab?: unknown;
}

/**
 * What the page shows, as the URL says. Every field is already valid.
 */
export interface HistorySearch {
  tab: HistoryTab;
  /** Matched against what each row *renders*, not against its stored keys. */
  q: string;
  sort: HistorySortKey;
  dir: "asc" | "desc";
  /** `""` means every row; otherwise a member of this tab's status list. */
  status: string;
}

const readTab = (raw: unknown): HistoryTab =>
  HISTORY_TABS.find((tab) => tab === raw) ?? DEFAULT_HISTORY_TAB;

const readSortKey = (raw: unknown, tab: HistoryTab): HistorySortKey => {
  const keys = HISTORY_SORT_KEYS[tab] as readonly string[];
  return keys.includes(typeof raw === "string" ? raw : "")
    ? (raw as HistorySortKey)
    : HISTORY_SORT_DEFAULTS[tab].key;
};

/** An absent `dir` is not `asc` — it is the tab's own default. */
const readDirection = (raw: unknown, tab: HistoryTab): "asc" | "desc" =>
  raw === "asc" || raw === "desc" ? raw : HISTORY_SORT_DEFAULTS[tab].dir;

const readStatus = (raw: unknown, tab: HistoryTab): string => {
  if (typeof raw !== "string" || raw === "") {
    return "";
  }
  return (HISTORY_STATUS_VALUES[tab] as readonly string[]).includes(raw)
    ? raw
    : "";
};

/**
 * Reads the page out of any search object, valid or not.
 *
 * The route's `validateSearch`, the writer's re-parse and the page's own read
 * all come through here, so what the address bar holds and what the table shows
 * can never come from two lists of what is allowed. Idempotent, so being called
 * three times over the same value is a second and third pass, not a second and
 * third opinion.
 */
export const validateHistorySearch = (
  search: HistorySearchInput
): HistorySearch => {
  const tab = readTab(search.tab);

  return {
    tab,
    q: readString(search.q),
    sort: readSortKey(search.sort, tab),
    dir: readDirection(search.dir, tab),
    status: readStatus(search.status, tab),
  };
};

/**
 * A search object back into query-string values, with every default left off.
 *
 * **Validation runs first, and that ordering is the whole fix.** The writer
 * hands this the *previous* URL's values merged with a patch, so a tab change
 * arrives carrying the old tab's sort key; re-parsing here drops that key to the
 * new tab's default before anything is written, and the URL never grows a param
 * that means nothing to the tab beside it. The writer itself validates before
 * merging, so what arrives is already a `HistorySearch` — the second pass is for
 * the patch, which can carry a key the *new* tab rejects.
 *
 * It is also what keeps the params optional to a `<Link>`: every key is absent
 * when it is at its default.
 */
export const toHistorySearchParams = (
  search: HistorySearch
): RouteSearch<HistorySearch> => {
  const valid = validateHistorySearch(search);
  const params: RouteSearch<HistorySearch> = {};
  const fallback = HISTORY_SORT_DEFAULTS[valid.tab];

  if (valid.tab !== DEFAULT_HISTORY_TAB) {
    params.tab = valid.tab;
  }
  if (valid.q !== "") {
    params.q = valid.q;
  }
  if (valid.sort !== fallback.key) {
    params.sort = valid.sort;
  }
  if (valid.dir !== fallback.dir) {
    params.dir = valid.dir;
  }
  if (valid.status !== "") {
    params.status = valid.status;
  }

  return params;
};

/** What the route declares: clamped, then stripped of its defaults. */
export const validateHistoryRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<HistorySearch> =>
  toHistorySearchParams(validateHistorySearch(search));

/**
 * True when something is narrowing the tab, which is the difference between
 * "nothing matched" and "this tab is empty".
 */
export const hasHistoryFilters = (search: HistorySearch): boolean =>
  search.q !== "" || search.status !== "";

/** Re-exported so a surface needs one import for the whole contract. */
export { searchToSorting } from "@/components/ui-patterns/data-table/list-search";
