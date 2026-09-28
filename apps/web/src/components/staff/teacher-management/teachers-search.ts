import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";

import {
  readDirection,
  readOneOf,
  readPage,
  readPageSize,
  readString,
} from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

/**
 * The teachers register's URL contract, and the second implementation of the
 * accounts one (`admin/users-search.ts`). Read them side by side: the shape is
 * identical, which is the point — a reader who knows how one list's state works
 * knows how every list's does.
 *
 * What differs is the content, and the differences are all facts about *teachers*
 * rather than about the mechanism: the register has one filter (the search) instead
 * of three, and its default order is by name because a staff register is read by
 * name far more often than by creation date — which is the opposite of the accounts
 * list, where the newest account is the one somebody is looking for.
 */
type RouterInputs = InferRouterInputs<AppRouter>;
type RouterOutputs = InferRouterOutputs<AppRouter>;

type ListTeachersInput = RouterInputs["staff"]["listTeachers"];
type ListTeachersOutput = RouterOutputs["staff"]["listTeachers"];

/** One teacher, as `listTeachers` returns it. */
export type TeacherRow = ListTeachersOutput["teachers"][number];

/** The columns the server can order by, read from the input rather than re-listed. */
export type TeacherSortKey = NonNullable<ListTeachersInput["sortBy"]>;

/** The page the register shows when the URL names none. */
export const TEACHER_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_TEACHER_PAGE_SIZE = 25;

/** The register's own order: by name, A to Z. */
export const DEFAULT_TEACHER_SORT: TeacherSortKey = "name";

/**
 * The columns a header may order by, and the only ones `listTeachers` accepts.
 *
 * `phone` is a column and not one of these: a phone number has no meaningful order
 * in a register read by name, and "sort by phone number" is a question nobody asks
 * and everybody can now answer by accident.
 */
export const TEACHER_SORT_KEYS = [
  "name",
  "email",
  "employmentStatus",
  "createdAt",
] as const satisfies readonly TeacherSortKey[];

/** What the register is showing, as the URL says. Every field is already valid. */
export interface TeachersSearch {
  /** Matched against name, email, phone, NIC and service number, all at once. */
  q: string;
  sort: TeacherSortKey;
  dir: "asc" | "desc";
  /** One-based, because a URL is read by people; the server wants zero-based. */
  page: number;
  size: number;
}

/**
 * Reads the register out of any search object, valid or not.
 *
 * The route's `validateSearch` and the page's hook both call this, so what the route
 * accepts and what the table shows can never come from two lists of what is
 * allowed. It is idempotent, so the hook may parse defensively without a second
 * source of truth.
 */
export const validateTeachersSearch = (
  search: Record<string, unknown>
): TeachersSearch => ({
  q: readString(search.q),
  sort: readOneOf(search.sort, TEACHER_SORT_KEYS) ?? DEFAULT_TEACHER_SORT,
  dir: readDirection(search.dir),
  page: readPage(search.page),
  size: readPageSize(
    search.size,
    TEACHER_PAGE_SIZES,
    DEFAULT_TEACHER_PAGE_SIZE
  ),
});

/** What the server is asked, for a URL. The only bridge between the two. */
export const toListTeachersInput = (search: TeachersSearch) => ({
  search: search.q || undefined,
  sortBy: search.sort,
  sortDirection: search.dir,
  page: search.page - 1,
  pageSize: search.size,
});

/**
 * A `TeachersSearch` back into query-string values, with every default left off.
 *
 * **This runs after validation, not before, and that ordering is the whole fix.**
 * A route's `validateSearch` return value is what the router serialises into the
 * address bar, so a validator that returns the *filled* object puts every default
 * back on the URL — a teachers page opened at `?sort=createdAt&dir=asc&page=1&
 * size=25`, none of which narrows anything. Omission has to be the last thing that
 * happens to a value, which is this function's job and the reason it is separate
 * from the parser.
 *
 * It is also what makes the params optional to a `<Link>`: every key is absent
 * when it is at its default, so a link may carry none of them.
 */
export const toTeachersSearchParams = (
  search: TeachersSearch
): RouteSearch<TeachersSearch> => {
  const params: RouteSearch<TeachersSearch> = {};

  if (search.q !== "") {
    params.q = search.q;
  }

  if (search.sort !== DEFAULT_TEACHER_SORT) {
    params.sort = search.sort;
  }

  if (search.dir !== "asc") {
    params.dir = search.dir;
  }

  if (search.page !== 1) {
    params.page = search.page;
  }

  if (search.size !== DEFAULT_TEACHER_PAGE_SIZE) {
    params.size = search.size;
  }

  return params;
};

/** What the route declares: clamped, then stripped of its defaults. */
export const validateTeachersRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<TeachersSearch> =>
  toTeachersSearchParams(validateTeachersSearch(search));

/**
 * True when something is narrowing the register, which is the difference between
 * "no teachers match" and "there are no teachers".
 */
export const hasTeacherFilters = (search: TeachersSearch): boolean =>
  search.q !== "";

/** Re-exported so a surface needs one import for the whole contract. */
export {
  searchToPagination,
  searchToSorting,
} from "@/components/ui-patterns/data-table/list-search";
