import {
  readDirection,
  readOneOf,
  readString,
} from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

/**
 * The staffing queue's URL contract: what a search param is called, what it may
 * hold, and what it means.
 *
 * ## Why a queue with no page number still has a URL
 *
 * Four values, and none of them is a page. The whole queue is fetched in one
 * request — `listTeacherRequests` has no `page` input — so a `?page=` here would
 * be a number the server never heard of, and paging a list of a dozen people is
 * furniture. What the URL buys is the thing every other list here buys: a search
 * somebody narrowed cannot be lost on refresh, cannot be lost on Back, and can be
 * sent to the Principal so both seats look at the same view of the queue.
 *
 * ## Why there is a status filter and no pagination
 *
 * The queue is two populations in one list — accounts that can be approved now,
 * and accounts the server will refuse — and an approver's whole question is
 * "which of these can I act on". A filter answers it; a page control would not.
 *
 * ## Every value is clamped on the way in
 *
 * `?status=wizard`, `?sort=;drop table` and `?dir=sideways` all read as the
 * default rather than as an error, because a hand-edited or stale link must not
 * be able to reach the table as something it cannot render.
 */

export type RequestSortKey = "name" | "createdAt" | "lastSignInAt";

/**
 * The three states the status filter offers, with the words for them.
 *
 * One list because the value the parser accepts and the label the select shows
 * are the same fact: a status added to the select and not to the parser would
 * produce a URL that the next read turns back into "everyone".
 */
export const REQUEST_STATUS_OPTIONS = [
  { value: "all", label: "Everyone waiting" },
  { value: "ready", label: "Ready to approve" },
  { value: "blocked", label: "Cannot be approved yet" },
] as const;

export type RequestStatusFilter =
  (typeof REQUEST_STATUS_OPTIONS)[number]["value"];

const STATUS_VALUES: readonly RequestStatusFilter[] =
  REQUEST_STATUS_OPTIONS.map((option) => option.value);

/** The order the queue is in when the URL names none: oldest waiting first. */
export const DEFAULT_REQUEST_SORT: RequestSortKey = "createdAt";

/** Ascending, unless the URL says `desc`. */
export const DEFAULT_DIRECTION = "asc" as const;

/** The status filter's value for "no filtering". */
export const ANY_REQUEST_STATUS = "all" as const;

/**
 * The columns a header may order by — and the only three worth ordering this
 * queue by.
 *
 * A header outside this list is a plain label rather than a button (see
 * `teacher-requests-columns.tsx`), so a `sort` that is not here can only arrive
 * from a typed URL, and is read as the default.
 */
export const REQUEST_SORT_KEYS = [
  "name",
  "createdAt",
  "lastSignInAt",
] as const satisfies readonly RequestSortKey[];

/** What the queue is showing, as the URL says. Every field is already valid. */
export interface TeacherRequestsSearch {
  /** Free text, matched against name, email and username together. */
  q: string;
  status: RequestStatusFilter;
  sort: RequestSortKey;
  dir: typeof DEFAULT_DIRECTION | "desc";
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
export const validateTeacherRequestsSearch = (
  search: Record<string, unknown>
): TeacherRequestsSearch => ({
  q: readString(search.q),
  status: readOneOf(search.status, STATUS_VALUES) ?? ANY_REQUEST_STATUS,
  sort: readOneOf(search.sort, REQUEST_SORT_KEYS) ?? DEFAULT_REQUEST_SORT,
  dir: readDirection(search.dir),
});

/**
 * A `TeacherRequestsSearch` back into query-string values, with every default
 * left off.
 *
 * The omission runs **after** validation, not before: a route's `validateSearch`
 * return value is what the router serialises into the address bar, so a
 * validator that returned the filled object would put `?status=all&sort=
 * createdAt&dir=asc` on every unfiltered queue — four params, none of which
 * narrow anything. It also makes the params optional to a `<Link>`, because every
 * key is absent while it is at its default.
 */
export const toTeacherRequestsSearchParams = (
  search: TeacherRequestsSearch
): RouteSearch<TeacherRequestsSearch> => {
  const params: RouteSearch<TeacherRequestsSearch> = {};

  if (search.q !== "") {
    params.q = search.q;
  }

  if (search.status !== ANY_REQUEST_STATUS) {
    params.status = search.status;
  }

  if (search.sort !== DEFAULT_REQUEST_SORT) {
    params.sort = search.sort;
  }

  if (search.dir !== DEFAULT_DIRECTION) {
    params.dir = search.dir;
  }

  return params;
};

/**
 * What the route declares as its `validateSearch`: clamped, then stripped of its
 * defaults. The page re-runs `validateTeacherRequestsSearch` over the result, so
 * a link written by hand and a link written by the app arrive in the same shape.
 */
export const validateTeacherRequestsRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<TeacherRequestsSearch> =>
  toTeacherRequestsSearchParams(validateTeacherRequestsSearch(search));

/**
 * True when something is narrowing the queue.
 *
 * Drives "Clear filters" and the difference between "no requests match" and
 * "nobody is waiting" — the first invites a search to be loosened, the second
 * describes the College.
 */
export const hasTeacherRequestFilters = (
  search: TeacherRequestsSearch
): boolean => search.q !== "" || search.status !== ANY_REQUEST_STATUS;
