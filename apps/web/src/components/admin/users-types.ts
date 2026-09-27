/**
 * Every accounts type the web layer uses, derived from the router.
 *
 * Nothing here is hand-written, and nothing here may become hand-written: each
 * name is a projection of `InferRouterOutputs<AppRouter>` at the path the client
 * actually calls, so a server-side change — a renamed column, a dropped field, a
 * new status arm — surfaces as a compile error in the table rather than as a
 * runtime `undefined` on a screen that has already shipped. This is the same
 * arrangement `staff/inventory/inventory-types.ts` documents for the inventory
 * feature, and the reason it is a file and not a comment.
 */
import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";

type RouterInputs = InferRouterInputs<AppRouter>;
type RouterOutputs = InferRouterOutputs<AppRouter>;

type ListAccountsOutput = RouterOutputs["staff"]["listAccounts"];
type ListAccountsInput = NonNullable<RouterInputs["staff"]["listAccounts"]>;

/** Element type of a response array, without naming the container. */
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;

/**
 * One account, as `listAccounts` returns it.
 *
 * This is the row type for the users table and the type every ban dialog is
 * handed, which is why `createdAt` is a string: the server sends an ISO string,
 * and the table formats and sorts what it is given without asking where it came
 * from.
 */
export type AccountRow = ElementOf<ListAccountsOutput["accounts"]>;

/**
 * The three states the status filter offers, read off the input rather than
 * re-listed. `listAccounts` owns this union; a fourth arm is a type error here
 * before it is a missing option in the select.
 */
export type AccountStatus = NonNullable<ListAccountsInput["status"]>;

/** The columns the server can order by, read from the input for the same reason. */
export type AccountSortKey = NonNullable<ListAccountsInput["sortBy"]>;

/** The roles the role filter offers, from the same place. */
export type AccountRole = NonNullable<ListAccountsInput["role"]>;

/**
 * The value both filter selects carry for "no filter".
 *
 * A named sentinel rather than an empty string, because an empty string is a
 * value a `<Select>` has to store and match: the shadcn `Select` renders
 * `<SelectItem value="">` as an item with no identity, and a select whose
 * controlled value is `""` and whose items have no `""` is a control that cannot
 * say "nothing chosen". `all` is not a role and not a status, so it cannot
 * collide with a real filter.
 */
export const ANY_FILTER = "all";

/** What the role select can be set to: every role, or none of them. */
export type RoleFilter = AccountRole | typeof ANY_FILTER;

/** What the status select can be set to: every status, or none of them. */
export type StatusFilter = AccountStatus | typeof ANY_FILTER;
