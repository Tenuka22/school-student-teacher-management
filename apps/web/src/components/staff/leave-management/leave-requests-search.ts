import type { LeaveQueue } from "@school-student-teacher-management/api/routers/staff/leaves/list-leave-requests";
import type { LeaveStatus } from "@school-student-teacher-management/db/schema/leaves";

import {
  readOneOf,
  readString,
} from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

import { leaveStatusBadge } from "./leave-status";

/**
 * The leave queue's URL contract: what a search param is called, what it may
 * hold, and what it means.
 *
 * ## Why a queue with no page number still has a URL
 *
 * Five values, and none of them is a page. The ledger is fetched in one request
 * — see `toLeaveLedgerInput` — so a `?page=` here would be a number the server
 * never heard of, and paging a school year's leave is furniture. What the URL
 * buys is what every other list here buys: a queue somebody narrowed cannot be
 * lost on refresh, cannot be lost on Back, and can be sent to the Principal so
 * two seats look at the same slice of the ledger.
 *
 * ## Why `queue` can be absent in a way `status` cannot
 *
 * A Deputy's useful first screen is their own queue, and a Principal's is theirs
 * — the queue that matches what that member is responsible for. So "no queue in
 * the URL" does not mean "all requests"; it means *follow the reviewer's role*,
 * and `resolveLeaveQueue` is the one place that rule is written. `status` has no
 * such rule: absent means all, which is what it says.
 *
 * ## Every value is clamped on the way in
 *
 * `?status=wizard`, `?sort=;drop table` and `?dir=sideways` all read as the
 * default rather than as an error, because a hand-edited or stale link must not
 * be able to reach the table as something it cannot render.
 */

/**
 * The server's three review-chain scopes.
 *
 * Mirrored rather than imported as a value: this is a client module and
 * `list-leave-requests` is the handler that talks to the database, so a value
 * import would pull the whole procedure into the browser bundle. The
 * `satisfies` is what stops the mirror drifting — a scope the API drops makes
 * this file stop compiling.
 */
export const LEAVE_QUEUES = [
  "all",
  "deputy",
  "principal",
] as const satisfies readonly LeaveQueue[];

export type LeaveQueueScope = LeaveQueue;

/**
 * The same three scopes with the words for them.
 *
 * One list because the value the parser accepts and the label the select shows
 * are the same fact: a scope added to the select and not to the parser would
 * produce a URL the next read turns back into "follow my role".
 */
export const LEAVE_QUEUE_OPTIONS: {
  value: LeaveQueueScope;
  label: string;
}[] = [
  { value: "all", label: "Full ledger" },
  { value: "deputy", label: "Awaiting DP" },
  { value: "principal", label: "Awaiting Principal" },
];

/** A chosen queue, or `null` for "none chosen — follow the reviewer's role". */
export type LeaveQueueFilter = LeaveQueueScope | null;

/**
 * The five statuses the ledger can hold, mirrored from `leaveStatusSchema` for
 * the same reason `LEAVE_QUEUES` is.
 */
const LEAVE_STATUS_VALUES = [
  "approved",
  "cancelled",
  "pending",
  "recommended",
  "rejected",
] as const satisfies readonly LeaveStatus[];

/** The status filter's value for "no filtering". */
export const ANY_LEAVE_STATUS = "all" as const;

export type LeaveStatusFilter = LeaveStatus | typeof ANY_LEAVE_STATUS;

/**
 * The status picker's options, with the labels the Status column uses.
 *
 * Built from `leaveStatusBadge` rather than written out a second time, because
 * a filter that said "Recommended" while the row said "Recommended (Deputy
 * Principal)" is two vocabularies for one state — and the badge map is the one
 * that degrades safely when a status is added later.
 */
export const LEAVE_STATUS_OPTIONS: {
  value: LeaveStatusFilter;
  label: string;
}[] = [
  { value: ANY_LEAVE_STATUS, label: "Every status" },
  ...LEAVE_STATUS_VALUES.map((value) => ({
    value,
    label: leaveStatusBadge(value).label,
  })),
];

const STATUS_VALUES: readonly LeaveStatusFilter[] = LEAVE_STATUS_VALUES;

/**
 * The columns a header may order by.
 *
 * A header outside this list is a plain label rather than a button (see
 * `leave-requests-columns.tsx`), so a `sort` that is not here can only arrive
 * from a typed URL and is read as the default.
 */
export const LEAVE_SORT_KEYS = [
  "staffName",
  "type",
  "startDate",
  "status",
  "createdAt",
] as const;

export type LeaveSortKey = (typeof LEAVE_SORT_KEYS)[number];

/** The order the queue is in when the URL names none: the order it was filed in. */
export const DEFAULT_LEAVE_SORT: LeaveSortKey = "createdAt";

/**
 * The default direction, and the reader it needs of its own.
 *
 * `desc`, which is `listLeaveRequests`' own `orderBy(desc(createdAt))` — the
 * newest request first, which is what this queue has always opened at. The
 * shared `readDirection` defaults to `asc`, so using it here would quietly
 * reverse a screen leadership already knows.
 */
export const DEFAULT_LEAVE_DIRECTION = "desc" as const;

const readLeaveDirection = (raw: unknown): "asc" | "desc" =>
  raw === "asc" ? "asc" : DEFAULT_LEAVE_DIRECTION;

/** What the queue is showing, as the URL says. Every field is already valid. */
export interface LeaveRequestsSearch {
  /** Free text, matched against the teacher, the type and the reason. */
  q: string;
  status: LeaveStatusFilter;
  /** `null` when nobody has chosen one — see `resolveLeaveQueue`. */
  queue: LeaveQueueFilter;
  sort: LeaveSortKey;
  dir: "asc" | "desc";
}

/**
 * Reads the queue out of any search object, valid or not.
 *
 * This is both the route's `validateSearch` and the page's read of the URL, and
 * being the same function in both places is deliberate: a value the route
 * accepts and a value the table renders can never come from two different lists
 * of what is allowed. It is also idempotent, so parsing an already-parsed object
 * returns an equal one.
 */
export const validateLeaveRequestsSearch = (
  search: Record<string, unknown>
): LeaveRequestsSearch => ({
  dir: readLeaveDirection(search.dir),
  q: readString(search.q),
  queue: readOneOf(search.queue, LEAVE_QUEUES) ?? null,
  sort: readOneOf(search.sort, LEAVE_SORT_KEYS) ?? DEFAULT_LEAVE_SORT,
  status: readOneOf(search.status, STATUS_VALUES) ?? ANY_LEAVE_STATUS,
});

/**
 * A `LeaveRequestsSearch` back into query-string values, with every default
 * left off.
 *
 * The omission runs **after** validation, not before: a route's `validateSearch`
 * return value is what the router serialises into the address bar, so a
 * validator that returned the filled object would put `?status=all&sort=
 * createdAt&dir=desc` on every unfiltered queue — three params, none of which
 * narrow anything. It also makes the params optional to a `<Link>`, because
 * every key is absent while it is at its default.
 */
export const toLeaveRequestsSearchParams = (
  search: LeaveRequestsSearch
): RouteSearch<LeaveRequestsSearch> => {
  const params: RouteSearch<LeaveRequestsSearch> = {};

  if (search.q !== "") {
    params.q = search.q;
  }

  if (search.status !== ANY_LEAVE_STATUS) {
    params.status = search.status;
  }

  if (search.queue !== null) {
    params.queue = search.queue;
  }

  if (search.sort !== DEFAULT_LEAVE_SORT) {
    params.sort = search.sort;
  }

  if (search.dir !== DEFAULT_LEAVE_DIRECTION) {
    params.dir = search.dir;
  }

  return params;
};

/**
 * What the route declares as its `validateSearch`: clamped, then stripped of its
 * defaults. The page re-runs `validateLeaveRequestsSearch` over the result, so a
 * link written by hand and a link written by the app arrive in the same shape.
 */
export const validateLeaveRequestsRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<LeaveRequestsSearch> =>
  toLeaveRequestsSearchParams(validateLeaveRequestsSearch(search));

/**
 * Which of the server's three queues to show.
 *
 * The rule the old queue buttons held in component state, now written once and
 * shared by the page: an explicit choice always wins, and an absent one falls
 * through to the reviewer's role — a Principal lands on what they finalise, a
 * Deputy on what they recommend, anyone else on the full ledger. Derived rather
 * than stored, so it corrects itself the moment authority resolves.
 */
export const resolveLeaveQueue = (
  queue: LeaveQueueFilter,
  authority: { isDeputy: boolean; isPrincipal: boolean }
): LeaveQueueScope => {
  if (queue !== null) {
    return queue;
  }

  if (authority.isPrincipal) {
    return "principal";
  }

  if (authority.isDeputy) {
    return "deputy";
  }

  return "all";
};

/**
 * The one read this screen makes.
 *
 * **The full ledger, always, whatever the URL asks for.** Queue and status are
 * then both sliced in the browser, which is the correct tier for a set the
 * client holds in full — and it buys three things the server-side version could
 * not: the status picker's counts are counts of the ledger rather than of the
 * slice already filtered, switching a filter is instant instead of a round trip,
 * and the query key is `{year, queue: "all"}` — the same key the sidebar already
 * uses for its badge, so an administrator who has looked at the sidebar has
 * already fetched this page's data.
 *
 * The API's own `status` and `queue` inputs stay untouched for the dashboards,
 * which ask for a slice because they are drawing a number rather than a list.
 */
export const toLeaveLedgerInput = (year: number) => ({
  queue: "all" as const satisfies LeaveQueueScope,
  year,
});

/**
 * True when something is narrowing the ledger.
 *
 * Drives "Clear filters" and the difference between "no requests match" and
 * "nobody has applied" — the first invites a search to be loosened, the second
 * describes the year.
 */
export const hasLeaveRequestFilters = (search: LeaveRequestsSearch): boolean =>
  search.q !== "" ||
  search.queue !== null ||
  search.status !== ANY_LEAVE_STATUS;
