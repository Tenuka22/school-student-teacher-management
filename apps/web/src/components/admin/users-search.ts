import { ALL_ROLES } from "@school-student-teacher-management/auth/roles";
import type { PaginationState, SortingState } from "@tanstack/react-table";

import type {
  AccountSortKey,
  AccountStatus,
  RoleFilter,
  StatusFilter,
} from "./users-types";
import { ANY_FILTER } from "./users-types";

/**
 * The accounts list's URL contract: what a search param is called, what it may
 * hold, and what it means to the server.
 *
 * ## Why this list is in the URL at all
 *
 * Everything here is a *question about the College* — which accounts, in what
 * order, which page — and every one of them is expensive enough to be a server
 * request. A question held in `useState` answers itself once and is lost on
 * refresh, on Back, and on a shared link, so an administrator who found "every
 * unconfirmed account, newest last, page 3" cannot come back to it, and cannot
 * send it to the Principal who needs to see the same thing.
 *
 * So the six values live in the query string, the route's `validateSearch` is
 * this file's `validateUsersSearch`, and the route's `loader` reads them through
 * `toListAccountsInput` and fetches **on the server** before the page is sent.
 * The first paint is therefore already the searched, sorted, paged list — not a
 * spinner that becomes one a moment later.
 *
 * ## Every value is clamped on the way in, and that is the point
 *
 * A hand-edited or stale link must not be able to send the server something it
 * does not accept. `?page=-4`, `?page=abc`, `?size=1000`, `?sort=;drop table` and
 * `?role=wizard` are all read here and all become a valid default rather than a
 * 500 or an empty table that reads as "the College has no accounts". The server
 * still validates: this is a first gate, not the only one.
 *
 * ## Why the names are short
 *
 * `q`, `role`, `status`, `sort`, `dir`, `page`, `size`. These are typed often —
 * a filter is re-applied by editing the URL, and `?q=fernando&status=banned` is
 * a thing a person can read out loud. The full names would be `?search=…` and
 * `?sortDirection=…`, and the second of those is the only one that was ever
 * contentious.
 */

/** How many accounts one page holds unless the URL says otherwise. */
export const DEFAULT_PAGE_SIZE = 50;

/** The page sizes the select offers. The URL may only name one of these. */
export const USERS_PAGE_SIZES = [10, 25, 50, 100] as const;

/** The order the list is in when the URL names none: oldest account first. */
export const DEFAULT_SORT: AccountSortKey = "createdAt";

/** Ascending, unless the URL says `desc`. */
export const DEFAULT_DIRECTION = "asc" as const;

/**
 * The columns a header may order by, and the only ones `listAccounts` accepts.
 *
 * A header outside this list is a label rather than a button (see
 * `users-columns.tsx`), so a `sort` that is not here can only arrive from a typed
 * URL — and is read as the default rather than sent on.
 */
export const USERS_SORT_KEYS = [
  "name",
  "email",
  "role",
  "createdAt",
] as const satisfies readonly AccountSortKey[];

/**
 * The three states the status filter offers, with the words for them.
 *
 * The values and their labels are one list because a value the parser accepts and
 * a label the select shows are the same fact: the day a fourth status is added to
 * `listAccounts` and not here, the filter cannot offer it, and the day one is
 * added here and not to the server's picklist, the URL accepts a status the API
 * rejects. One list, and the server's own union in the type position.
 */
export const USERS_STATUS_OPTIONS = [
  { value: "active", label: "Active (not banned)" },
  { value: "banned", label: "Banned" },
  { value: "unverified", label: "Email not confirmed" },
] as const satisfies { value: AccountStatus; label: string }[];

const STATUS_VALUES: readonly AccountStatus[] = USERS_STATUS_OPTIONS.map(
  (option) => option.value
);

/**
 * A search term longer than this is not a search term.
 *
 * The server would accept it and match nothing; 200 characters is well past any
 * real name, email or login, and it keeps a hand-edited URL from putting an
 * unbounded string into a query parameter.
 */
const MAX_TERM_LENGTH = 200;

/** What the list is showing, as the URL says. Every field is already valid. */
export interface UsersSearch {
  /** Free text, matched against name, email and username together. */
  q: string;
  role: RoleFilter;
  status: StatusFilter;
  sort: AccountSortKey;
  dir: typeof DEFAULT_DIRECTION | "desc";
  /** One-based, because a URL is read by people; the server wants zero-based. */
  page: number;
  size: number;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined => allowed.find((option) => option === value);

const asPage = (value: unknown): number => {
  const parsed = Number(asString(value));

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
};

const asSize = (value: unknown): number => {
  const parsed = Number(asString(value));

  return USERS_PAGE_SIZES.find((size) => size === parsed) ?? DEFAULT_PAGE_SIZE;
};

/**
 * Reads the accounts list out of any search object, valid or not.
 *
 * This is both the route's `validateSearch` and the hook's read of the URL, and
 * being the same function in both places is deliberate: a value the route
 * accepts and a value the table renders can never come from two different lists
 * of what is allowed. It is also idempotent — reading an already-parsed object
 * returns an equal one — so the hook may parse defensively without a second
 * source of truth.
 */
export const validateUsersSearch = (
  search: Record<string, unknown>
): UsersSearch => ({
  q: asString(search.q).slice(0, MAX_TERM_LENGTH),
  role: asOneOf(asString(search.role), ALL_ROLES) ?? ANY_FILTER,
  status: asOneOf(asString(search.status), STATUS_VALUES) ?? ANY_FILTER,
  sort: asOneOf(asString(search.sort), USERS_SORT_KEYS) ?? DEFAULT_SORT,
  dir: asString(search.dir) === "desc" ? "desc" : DEFAULT_DIRECTION,
  page: asPage(search.page),
  size: asSize(search.size),
});

/** What the server is asked, for a URL. This is the only bridge between the two. */
export const toListAccountsInput = (search: UsersSearch) => ({
  search: search.q || undefined,
  role: search.role === ANY_FILTER ? undefined : search.role,
  status: search.status === ANY_FILTER ? undefined : search.status,
  sortBy: search.sort,
  sortDirection: search.dir,
  page: search.page - 1,
  pageSize: search.size,
});

/** The URL's order, in the two-word shape TanStack Table speaks. */
export const toSorting = (search: UsersSearch): SortingState => [
  { id: search.sort, desc: search.dir === "desc" },
];

/**
 * The URL's page, in TanStack Table's shape.
 *
 * The one place a one-based URL becomes a zero-based index, so the two can never
 * disagree about which page is on screen: `?page=1` is `pageIndex: 0` here and
 * `page: 0` in the server's input, and both are the same page.
 */
export const toPagination = (search: UsersSearch): PaginationState => ({
  pageIndex: search.page - 1,
  pageSize: search.size,
});

/**
 * A `UsersSearch` back into query-string values, with every default left off.
 *
 * The omission is the whole point of a separate function: `?page=1&size=50` and
 * `?sort=createdAt&dir=asc` on every unfiltered URL is a URL nobody can read and
 * nobody can edit, and a "reset" that leaves four params behind is not a reset.
 * `undefined` is what tells TanStack Router to drop a key, so a value at its
 * default genuinely leaves the URL.
 */
export const toUsersSearchParams = (
  search: UsersSearch
): Record<string, string | undefined> => ({
  q: search.q || undefined,
  role: search.role === ANY_FILTER ? undefined : search.role,
  status: search.status === ANY_FILTER ? undefined : search.status,
  sort: search.sort === DEFAULT_SORT ? undefined : search.sort,
  dir: search.dir === DEFAULT_DIRECTION ? undefined : search.dir,
  page: search.page === 1 ? undefined : String(search.page),
  size: search.size === DEFAULT_PAGE_SIZE ? undefined : String(search.size),
});

/**
 * True when something is narrowing the list.
 *
 * Drives the "Clear filters" button and the difference between "no accounts
 * match" and "there are no accounts" — two sentences that must never be confused,
 * because the first invites an administrator to give up on a filter and the
 * second invites them to delete something.
 */
export const hasUsersFilters = (search: UsersSearch): boolean =>
  search.q !== "" || search.role !== ANY_FILTER || search.status !== ANY_FILTER;
